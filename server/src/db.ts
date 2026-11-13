import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import {
  Appearance, DEFAULT_APPEARANCE, START_PLOTS, ECON, STARTER_ITEMS, xpToNext,
} from '../../shared/catalog';

// ------------------------------------------------------------ Kết nối PostgreSQL
// DATABASE_URL=postgres://user:pass@host:port/db (mặc định: container docker-compose ở cổng 5434)
pg.types.setTypeParser(20, (v) => Number(v)); // BIGINT → number

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://xomvui:xomvui@localhost:5434/xomvui',
  max: 10,
  // Neon / Postgres trên cloud cần SSL: tự bật khi URL có sslmode hoặc là neon.tech
  ssl: process.env.DATABASE_SSL === '1' || /sslmode=|neon\.tech/.test(process.env.DATABASE_URL ?? '')
    ? { rejectUnauthorized: false } : undefined,
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
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  read_at BIGINT
);
CREATE INDEX IF NOT EXISTS messages_pair ON messages (LEAST(from_id, to_id), GREATEST(from_id, to_id), id);
CREATE INDEX IF NOT EXISTS messages_unread ON messages (to_id) WHERE read_at IS NULL;
-- Tiền án (số lần bị cảnh sát bắt) và hạn lao động công ích
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS offenses INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS jail_until BIGINT;
-- Xây nhà cao tầng: điểm cao nhất mỗi người (chơi đơn xếp hạng)
CREATE TABLE IF NOT EXISTS tower_scores (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  best INTEGER NOT NULL DEFAULT 0,
  best_floors INTEGER NOT NULL DEFAULT 0,
  plays INTEGER NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS tower_scores_best ON tower_scores (best DESC);
-- Bảng tin cộng đồng (cư dân mới, cảnh sát bắt trộm...)
CREATE TABLE IF NOT EXISTS announcements (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at BIGINT NOT NULL
);
-- Nhiệm vụ hằng ngày: tiến độ + đã nhận thưởng (mỗi người mỗi ngày một dòng)
CREATE TABLE IF NOT EXISTS quest_days (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  progress JSONB NOT NULL DEFAULT '{}',
  claimed JSONB NOT NULL DEFAULT '[]',
  chest BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, day)
);
`;

/** Tạo bảng nếu chưa có. Gọi một lần khi server khởi động. */
export async function initDb() {
  await pool.query(SCHEMA);
  await migrate('2026-11-starter-neutral', `
    -- Đồ khởi đầu trung tính: "Chân váy hồng" (tặng sẵn trước đây) → "Áo thun hồng"
    INSERT INTO inventory (user_id, item_id, qty)
      SELECT user_id, 'cl:tee_pink', 1 FROM inventory WHERE item_id = 'cl:skirt_pink' AND qty > 0
      ON CONFLICT (user_id, item_id) DO NOTHING;
    UPDATE profiles SET appearance = jsonb_set(appearance, '{bottom}', '"cl:pants_denim"')
      WHERE appearance->>'bottom' = 'cl:skirt_pink';
    DELETE FROM inventory WHERE item_id = 'cl:skirt_pink';`);
}

/** Chạy một đoạn SQL đúng một lần cho mỗi database (ghi dấu trong bảng migrations). */
async function migrate(name: string, sql: string) {
  await pool.query('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await c.query('INSERT INTO migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
    if (r.rowCount) { await c.query(sql); console.log(`🛠️  Migration: ${name}`); }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
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
  /** Số lần bị cảnh sát bắt */
  offenses: number;
  /** Đang lao động công ích tới thời điểm này (ms), null = tự do */
  jailUntil: number | null;
}

export interface Plot {
  crop: string | null;
  plantedAt: number;
  bonus: number;
  waterStage: number;
  yieldLeft: number;
  stolenBy: number[];
  /** Cấp ô đất: 1 = Đất màu mỡ (sản lượng ×1,5). Không có = đất thường. */
  lvl?: number;
}
export interface Animal {
  type: string;
  fedAt: number | null;
  /** Số sản phẩm còn lại của lứa hiện tại (bị trộm thì giảm). Không có = đủ số. */
  left?: number;
  /** Ai đã trộm lứa này */
  stolenBy?: number[];
}
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
      [id, username, ECON.starterCoins, JSON.stringify(DEFAULT_APPEARANCE)]);
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
    offenses: r.offenses ?? 0, jailUntil: r.jail_until != null && Number(r.jail_until) > Date.now() ? Number(r.jail_until) : null,
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

// ------------------------------------------------------------ Tin nhắn riêng

export interface ChatMessage { id: number; from: number; to: number; text: string; at: number; read: boolean }

const rowToMsg = (r: any): ChatMessage => ({
  id: r.id, from: r.from_id, to: r.to_id, text: r.text, at: r.created_at, read: r.read_at != null,
});

export async function addMessage(from: number, to: number, text: string): Promise<ChatMessage> {
  return rowToMsg(await one(
    'INSERT INTO messages (from_id, to_id, text, created_at) VALUES ($1, $2, $3, $4) RETURNING *', [from, to, text, Date.now()],
  ));
}

/** Lịch sử trò chuyện giữa a và b (mới nhất ở cuối), `before` để tải thêm tin cũ hơn. */
export async function getConversation(a: number, b: number, before?: number, limit = 40): Promise<ChatMessage[]> {
  const rows = await all(
    `SELECT * FROM messages
     WHERE LEAST(from_id, to_id) = LEAST($1::int, $2::int) AND GREATEST(from_id, to_id) = GREATEST($1::int, $2::int)
       AND ($3::bigint IS NULL OR id < $3::bigint)
     ORDER BY id DESC LIMIT $4`, [a, b, before ?? null, limit],
  );
  return rows.reverse().map(rowToMsg);
}

/** Đánh dấu đã đọc mọi tin `other` gửi cho `me`. */
export async function markRead(me: number, other: number) {
  await all('UPDATE messages SET read_at = $3 WHERE to_id = $1 AND from_id = $2 AND read_at IS NULL', [me, other, Date.now()]);
}

/** Số tin chưa đọc theo từng người gửi. */
export async function unreadCounts(me: number): Promise<Record<number, number>> {
  const rows = await all<{ from_id: number; n: number }>(
    'SELECT from_id, COUNT(*)::int AS n FROM messages WHERE to_id = $1 AND read_at IS NULL GROUP BY from_id', [me],
  );
  return Object.fromEntries(rows.map((r) => [r.from_id, r.n]));
}

/** Tin nhắn gần nhất với từng người (để hiển thị trong danh sách). */
export async function lastMessages(me: number): Promise<Record<number, ChatMessage>> {
  const rows = await all(
    `SELECT DISTINCT ON (other) *, CASE WHEN from_id = $1 THEN to_id ELSE from_id END AS other
     FROM messages WHERE from_id = $1 OR to_id = $1 ORDER BY other, id DESC`, [me],
  );
  return Object.fromEntries(rows.map((r) => [r.other, rowToMsg(r)]));
}

// ------------------------------------------------------------ Cư dân, bảng tin, cảnh sát

/** Danh sách cư dân (đã tạo nhân vật), tìm theo tên. */
export async function listResidents(q: string, limit = 60) {
  // thoát ký tự đặc biệt của LIKE (% _ \)
  const like = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
  return all<{ id: number; name: string; level: number; appearance: Appearance; joined: number }>(
    `SELECT p.user_id AS id, p.name, p.level, p.appearance, u.created_at AS joined
       FROM profiles p JOIN users u ON u.id = p.user_id
      WHERE p.created AND ($1 = '' OR p.name ILIKE $2)
      ORDER BY p.level DESC, u.created_at DESC LIMIT $3`, [q, like, limit]);
}
export async function countResidents(): Promise<number> {
  return (await one<{ n: number }>('SELECT count(*)::int AS n FROM profiles WHERE created'))!.n;
}

export interface Announcement { id: number; kind: string; text: string; userId: number | null; at: number }
export async function addAnnouncement(kind: string, text: string, userId: number | null): Promise<Announcement> {
  const r = (await one<any>('INSERT INTO announcements (kind, text, user_id, created_at) VALUES ($1,$2,$3,$4) RETURNING *',
    [kind, text, userId, Date.now()]))!;
  return { id: Number(r.id), kind: r.kind, text: r.text, userId: r.user_id, at: Number(r.created_at) };
}
/** Xoá tin cũ trên Bảng tin: quá 3 ngày, hoặc ngoài 100 tin mới nhất. */
export async function pruneAnnouncements(maxAgeMs = 3 * 24 * 3600_000, keep = 100) {
  await all(`DELETE FROM announcements WHERE created_at < $1
     OR id NOT IN (SELECT id FROM announcements ORDER BY id DESC LIMIT $2)`, [Date.now() - maxAgeMs, keep]);
}

export async function listAnnouncements(limit = 50): Promise<Announcement[]> {
  const rows = await all<any>('SELECT * FROM announcements ORDER BY id DESC LIMIT $1', [limit]);
  return rows.map((r) => ({ id: Number(r.id), kind: r.kind, text: r.text, userId: r.user_id, at: Number(r.created_at) }));
}

/** Ghi tiền án + hạn lao động công ích. Trả về số lần vi phạm mới. */
export async function addOffense(userId: number, jailUntil: number): Promise<number> {
  const r = await one<{ offenses: number }>(
    'UPDATE profiles SET offenses = offenses + 1, jail_until = $2 WHERE user_id = $1 RETURNING offenses', [userId, jailUntil]);
  return r?.offenses ?? 1;
}

// ------------------------------------------------------------ Xây nhà cao tầng

/** Ghi một ván chơi đơn; trả về điểm cao nhất (sau khi cập nhật) và có phải kỷ lục mới không. */
export async function saveTowerScore(userId: number, score: number, floors: number) {
  const r = (await one<{ best: number; best_floors: number; plays: number }>(
    `INSERT INTO tower_scores (user_id, best, best_floors, plays, updated_at) VALUES ($1, $2, $3, 1, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       plays = tower_scores.plays + 1,
       best_floors = CASE WHEN EXCLUDED.best > tower_scores.best THEN EXCLUDED.best_floors ELSE tower_scores.best_floors END,
       best = GREATEST(tower_scores.best, EXCLUDED.best),
       updated_at = CASE WHEN EXCLUDED.best > tower_scores.best THEN EXCLUDED.updated_at ELSE tower_scores.updated_at END
     RETURNING best, best_floors, plays`, [userId, score, floors, Date.now()]))!;
  return { best: r.best, bestFloors: r.best_floors, plays: r.plays };
}

export async function towerBoard(limit = 20) {
  return all<{ id: number; name: string; best: number; floors: number; appearance: Appearance }>(
    `SELECT t.user_id AS id, p.name, t.best, t.best_floors AS floors, p.appearance
       FROM tower_scores t JOIN profiles p ON p.user_id = t.user_id
      WHERE t.best > 0 ORDER BY t.best DESC, t.updated_at ASC LIMIT $1`, [limit]);
}

export async function towerMine(userId: number) {
  const r = await one<{ best: number; best_floors: number; plays: number }>('SELECT best, best_floors, plays FROM tower_scores WHERE user_id = $1', [userId]);
  if (!r || r.best <= 0) return { best: 0, floors: 0, plays: r?.plays ?? 0, rank: null as number | null };
  const rk = (await one<{ n: number }>('SELECT count(*)::int + 1 AS n FROM tower_scores WHERE best > $1', [r.best]))!;
  return { best: r.best, floors: r.best_floors, plays: r.plays, rank: rk.n };
}

// ---- Nhiệm vụ hằng ngày ----
export interface QuestRow { progress: Record<string, number>; claimed: string[]; chest: boolean }

export async function getQuestDay(userId: number, day: string): Promise<QuestRow> {
  const r = await one<QuestRow>('SELECT progress, claimed, chest FROM quest_days WHERE user_id = $1 AND day = $2', [userId, day]);
  return r ?? { progress: {}, claimed: [], chest: false };
}

/** Cộng tiến độ một nhiệm vụ (không vượt quá goal). Trả về tiến độ mới. */
export async function bumpQuest(userId: number, day: string, kind: string, n: number, goal: number): Promise<number> {
  const r = await one<{ v: number }>(
    `INSERT INTO quest_days (user_id, day, progress) VALUES ($1, $2, jsonb_build_object($3::text, LEAST($4::int, $5::int)))
     ON CONFLICT (user_id, day) DO UPDATE SET progress = quest_days.progress || jsonb_build_object($3::text,
       LEAST($5::int, COALESCE((quest_days.progress->>$3)::int, 0) + $4::int))
     RETURNING (progress->>$3)::int AS v`, [userId, day, kind, n, goal]);
  return r?.v ?? 0;
}

/** Đánh dấu đã nhận thưởng; trả về false nếu đã nhận trước đó (chống nhận 2 lần). */
export async function markQuestClaimed(userId: number, day: string, kind: string) {
  const r = await all(`UPDATE quest_days SET claimed = claimed || to_jsonb($3::text)
    WHERE user_id = $1 AND day = $2 AND NOT (claimed ? $3) RETURNING 1`, [userId, day, kind]);
  return r.length > 0;
}

export async function markChest(userId: number, day: string) {
  const r = await all('UPDATE quest_days SET chest = TRUE WHERE user_id = $1 AND day = $2 AND chest = FALSE RETURNING 1', [userId, day]);
  return r.length > 0;
}

/** Dọn tiến độ nhiệm vụ cũ (quá 7 ngày). */
export async function pruneQuests(beforeDay: string) {
  await all('DELETE FROM quest_days WHERE day < $1', [beforeDay]);
}
