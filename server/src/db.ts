import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import {
  Appearance, DEFAULT_APPEARANCE, START_PLOTS, STARTER_COINS, STARTER_ITEMS, xpToNext,
} from '../../shared/catalog';

// ------------------------------------------------------------ Kết nối PostgreSQL
// DATABASE_URL=postgres://user:pass@host:port/db (mặc định: container docker-compose ở cổng 5434)
pg.types.setTypeParser(20, (v) => Number(v)); // BIGINT → number

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://xomvui:xomvui@localhost:5434/xomvui',
  max: 10,
  ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined,
});

/** Transaction hiện tại (nếu có) — mọi truy vấn bên trong tx() tự dùng chung kết nối này. */
const txStore = new AsyncLocalStorage<pg.PoolClient>();
const conn = () => txStore.getStore() ?? pool;

async function all<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await conn().query(sql, params)).rows as T[];
}
async function one<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await all<T>(sql, params))[0];
}

/** Chạy fn trong một transaction (lồng nhau thì dùng lại transaction ngoài). */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await txStore.run(client, fn);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  pass TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  coins INTEGER NOT NULL CHECK (coins >= 0),
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  appearance JSONB NOT NULL,
  created BOOLEAN NOT NULL DEFAULT FALSE,
  last_daily TEXT
);
CREATE INDEX IF NOT EXISTS profiles_name_lower ON profiles (lower(name));
CREATE TABLE IF NOT EXISTS inventory (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE IF NOT EXISTS farms (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS friends (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
`;

/** Tạo bảng nếu chưa có. Gọi một lần khi server khởi động. */
export async function initDb() {
  await pool.query(SCHEMA);
}

export class GameError extends Error {}

export interface Profile {
  userId: number;
  name: string;
  coins: number;
  xp: number;
  level: number;
  appearance: Appearance;
  created: boolean;
  lastDaily: string | null;
}

export interface Plot {
  crop: string | null;
  plantedAt: number;
  bonus: number;
  waterStage: number;
  yieldLeft: number;
  stolenBy: number[];
}
export interface Animal { type: string; fedAt: number | null }
export interface Farm { plots: Plot[]; animals: Animal[]; /** Có chó giữ nhà */ dog?: boolean }

export const emptyPlot = (): Plot => ({ crop: null, plantedAt: 0, bonus: 0, waterStage: -1, yieldLeft: 0, stolenBy: [] });
const newFarm = (): Farm => ({ plots: Array.from({ length: START_PLOTS }, emptyPlot), animals: [] });

// ------------------------------------------------------------ Tài khoản

export async function createUser(username: string, passHash: string): Promise<number> {
  return tx(async () => {
    const { id } = (await one<{ id: number }>(
      'INSERT INTO users (username, pass, created_at) VALUES ($1, $2, $3) RETURNING id', [username, passHash, Date.now()],
    ))!;
    await all('INSERT INTO profiles (user_id, name, coins, appearance) VALUES ($1, $2, $3, $4)',
      [id, username, STARTER_COINS, JSON.stringify(DEFAULT_APPEARANCE)]);
    for (const [item, qty] of Object.entries(STARTER_ITEMS)) await addItem(id, item, qty);
    await saveFarm(id, newFarm());
    return id;
  });
}

export async function findUser(username: string) {
  return one<{ id: number; username: string; pass: string }>(
    'SELECT id, username, pass FROM users WHERE lower(username) = lower($1)', [username],
  );
}

export async function createSession(token: string, userId: number) {
  await all('INSERT INTO sessions (token, user_id, created_at) VALUES ($1, $2, $3)', [token, userId, Date.now()]);
}
export async function userIdFromToken(token: string): Promise<number | null> {
  const r = await one<{ user_id: number }>('SELECT user_id FROM sessions WHERE token = $1', [token]);
  return r ? r.user_id : null;
}

// ------------------------------------------------------------ Hồ sơ, xu, kinh nghiệm

function rowToProfile(r: any): Profile {
  return {
    userId: r.user_id, name: r.name, coins: r.coins, xp: r.xp, level: r.level,
    appearance: r.appearance, created: !!r.created, lastDaily: r.last_daily ?? null,
  };
}

export async function getProfile(userId: number): Promise<Profile> {
  const r = await one('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  if (!r) throw new GameError('Không tìm thấy người chơi');
  return rowToProfile(r);
}
export async function findProfileByName(name: string): Promise<Profile | null> {
  const r = await one('SELECT * FROM profiles WHERE lower(name) = lower($1)', [name]);
  return r ? rowToProfile(r) : null;
}

/** Cộng/trừ xu một cách nguyên tử (không thể âm). Ném lỗi nếu không đủ xu. */
export async function addCoins(userId: number, delta: number): Promise<number> {
  const r = await one<{ coins: number }>(
    'UPDATE profiles SET coins = coins + $1 WHERE user_id = $2 AND coins + $1 >= 0 RETURNING coins', [delta, userId],
  );
  if (!r) throw new GameError('Không đủ xu');
  return r.coins;
}

/** Trừ tối đa `max` xu (không âm). Trả về số xu thực sự trừ được. */
export async function takeCoinsUpTo(userId: number, max: number): Promise<number> {
  return tx(async () => {
    const r = await one<{ coins: number }>('SELECT coins FROM profiles WHERE user_id = $1 FOR UPDATE', [userId]);
    const take = Math.max(0, Math.min(max, r?.coins ?? 0));
    if (take) await all('UPDATE profiles SET coins = coins - $1 WHERE user_id = $2', [take, userId]);
    return take;
  });
}

export async function addXp(userId: number, amount: number): Promise<{ level: number; leveledUp: boolean }> {
  return tx(async () => {
    const p = await one<{ xp: number; level: number }>('SELECT xp, level FROM profiles WHERE user_id = $1 FOR UPDATE', [userId]);
    if (!p) throw new GameError('Không tìm thấy người chơi');
    let { xp, level } = p;
    xp += amount;
    let leveledUp = false;
    while (xp >= xpToNext(level)) {
      xp -= xpToNext(level);
      level++;
      leveledUp = true;
    }
    await all('UPDATE profiles SET xp = $1, level = $2 WHERE user_id = $3', [xp, level, userId]);
    return { level, leveledUp };
  });
}

export async function setAppearance(userId: number, a: Appearance) {
  await all('UPDATE profiles SET appearance = $1, created = TRUE WHERE user_id = $2', [JSON.stringify(a), userId]);
}
/** Đánh dấu đã nhận quà ngày `day`; trả về true nếu đây là lần đầu trong ngày. */
export async function claimDaily(userId: number, day: string): Promise<boolean> {
  const r = await one(
    'UPDATE profiles SET last_daily = $1 WHERE user_id = $2 AND (last_daily IS DISTINCT FROM $1) RETURNING user_id', [day, userId],
  );
  return !!r;
}

// ------------------------------------------------------------ Túi đồ

export async function getInventory(userId: number): Promise<Record<string, number>> {
  const rows = await all<{ item_id: string; qty: number }>('SELECT item_id, qty FROM inventory WHERE user_id = $1 AND qty > 0', [userId]);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.item_id] = r.qty;
  return out;
}
export async function itemQty(userId: number, itemId: string): Promise<number> {
  const r = await one<{ qty: number }>('SELECT qty FROM inventory WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
  return r?.qty ?? 0;
}
export async function addItem(userId: number, itemId: string, qty: number) {
  await all(`INSERT INTO inventory (user_id, item_id, qty) VALUES ($1, $2, $3)
    ON CONFLICT (user_id, item_id) DO UPDATE SET qty = inventory.qty + EXCLUDED.qty`, [userId, itemId, qty]);
}
/** Trừ vật phẩm một cách nguyên tử. Ném lỗi nếu không đủ. */
export async function removeItem(userId: number, itemId: string, qty: number) {
  const r = await one('UPDATE inventory SET qty = qty - $3 WHERE user_id = $1 AND item_id = $2 AND qty >= $3 RETURNING qty', [userId, itemId, qty]);
  if (!r) throw new GameError('Không đủ vật phẩm');
}

// ------------------------------------------------------------ Nông trại

/** Đọc nông trại; trong transaction thì khoá dòng (FOR UPDATE) để tránh 2 thao tác ghi đè nhau. */
export async function getFarm(userId: number): Promise<Farm> {
  const lock = txStore.getStore() ? ' FOR UPDATE' : '';
  const r = await one<{ data: Farm }>(`SELECT data FROM farms WHERE user_id = $1${lock}`, [userId]);
  if (r) return r.data;
  const farm = newFarm();
  await saveFarm(userId, farm);
  return farm;
}
export async function saveFarm(userId: number, farm: Farm) {
  await all(`INSERT INTO farms (user_id, data) VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data`, [userId, JSON.stringify(farm)]);
}

// ------------------------------------------------------------ Bạn bè

export async function friendStatus(a: number, b: number): Promise<string | null> {
  const r = await one<{ status: string }>('SELECT status FROM friends WHERE user_id = $1 AND friend_id = $2', [a, b]);
  return r?.status ?? null;
}
export async function setFriend(a: number, b: number, status: string) {
  await all(`INSERT INTO friends (user_id, friend_id, status, created_at) VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, friend_id) DO UPDATE SET status = EXCLUDED.status`, [a, b, status, Date.now()]);
}
export async function deleteFriend(a: number, b: number) {
  await all('DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)', [a, b]);
}
export async function listFriends(userId: number) {
  return all<{ id: number; name: string; level: number }>(`SELECT p.user_id AS id, p.name, p.level FROM friends f
    JOIN profiles p ON p.user_id = f.friend_id WHERE f.user_id = $1 AND f.status = 'accepted' ORDER BY p.name`, [userId]);
}
export async function listIncoming(userId: number) {
  return all<{ id: number; name: string; level: number }>(`SELECT p.user_id AS id, p.name, p.level FROM friends f
    JOIN profiles p ON p.user_id = f.user_id WHERE f.friend_id = $1 AND f.status = 'pending'`, [userId]);
}
