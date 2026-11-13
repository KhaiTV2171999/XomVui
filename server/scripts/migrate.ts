/**
 * Migrate DB (an toàn, không xoá dữ liệu): tạo bảng / cột còn thiếu, chạy các migration một lần,
 * thêm bảng giá & thông số mặc định còn thiếu (ON CONFLICT DO NOTHING — giữ nguyên giá đã chỉnh).
 *
 *   DATABASE_URL=postgres://... npm run migrate
 */
import { initDb, pool } from '../src/db';
import { initCatalog } from '../src/game/catalog';
import { setIo } from '../src/game/online';

// initCatalog có đẩy bảng giá cho người chơi online — ở đây không có server nên dùng io giả
const noop = { emit() {}, to() { return noop; } };
setIo(noop as never);

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? 'postgres://localhost').host;
  console.log(`→ Migrate ${host}`);
  await initDb();
  await initCatalog();
  const { rows } = await pool.query(`
    SELECT (SELECT count(*) FROM users)::int AS users,
           (SELECT count(*) FROM profiles)::int AS profiles,
           (SELECT count(*) FROM game_settings)::int AS settings,
           to_regclass('quest_days') IS NOT NULL AS quest_days`);
  console.log('✓ Xong:', rows[0]);
  process.exit(0);
}

main().catch((e) => { console.error('✗ Lỗi migrate:', e.message); process.exit(1); });
