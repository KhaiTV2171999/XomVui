// Chuyển dữ liệu từ SQLite cũ (server/data/game.db) sang PostgreSQL.
// Chạy: npm run migrate:sqlite --prefix server   (ghi đè toàn bộ dữ liệu đang có trong Postgres!)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { initDb, pool } from '../src/db';

const file = path.resolve(process.argv[2] ?? path.join(process.cwd(), 'data', 'game.db'));
if (!fs.existsSync(file)) {
  console.error('Không tìm thấy file SQLite:', file);
  process.exit(1);
}

const sq = new DatabaseSync(file, { readOnly: true });
const rows = (sql: string) => sq.prepare(sql).all() as Record<string, any>[];

await initDb();
const c = await pool.connect();
try {
  await c.query('BEGIN');
  await c.query('TRUNCATE friends, farms, inventory, profiles, sessions, users RESTART IDENTITY CASCADE');

  const users = rows('SELECT * FROM users');
  for (const u of users) {
    await c.query('INSERT INTO users (id, username, pass, created_at) VALUES ($1, $2, $3, $4)', [u.id, u.username, u.pass, u.created_at]);
  }
  for (const s of rows('SELECT * FROM sessions')) {
    await c.query('INSERT INTO sessions (token, user_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [s.token, s.user_id, s.created_at]);
  }
  for (const p of rows('SELECT * FROM profiles')) {
    await c.query(
      'INSERT INTO profiles (user_id, name, coins, xp, level, appearance, created, last_daily) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [p.user_id, p.name, p.coins, p.xp, p.level, p.appearance, !!p.created, p.last_daily],
    );
  }
  for (const i of rows('SELECT * FROM inventory')) {
    await c.query('INSERT INTO inventory (user_id, item_id, qty) VALUES ($1, $2, $3)', [i.user_id, i.item_id, i.qty]);
  }
  for (const f of rows('SELECT * FROM farms')) {
    await c.query('INSERT INTO farms (user_id, data) VALUES ($1, $2)', [f.user_id, f.data]);
  }
  for (const f of rows('SELECT * FROM friends')) {
    await c.query('INSERT INTO friends (user_id, friend_id, status, created_at) VALUES ($1, $2, $3, $4)', [f.user_id, f.friend_id, f.status, f.created_at]);
  }
  // Đặt lại bộ đếm id để tài khoản mới không trùng id cũ
  await c.query("SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT MAX(id) FROM users), 1))");
  await c.query('COMMIT');
  console.log(`✅ Đã chuyển ${users.length} tài khoản từ ${file} sang PostgreSQL`);
} catch (e) {
  await c.query('ROLLBACK');
  console.error('❌ Lỗi, đã huỷ:', e);
  process.exitCode = 1;
} finally {
  c.release();
  await pool.end();
}
