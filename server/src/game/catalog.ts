import {
  AnimalDef, applyCatalog, CatalogPayload, catalogSnapshot, CropDef, DEFAULT_ANIMALS, DEFAULT_CROPS, ECON,
} from '../../../shared/catalog';
import { pool } from '../db';
import { getIo } from './online';

/*
 * Bảng giá nông trại lưu trong DB — sửa trực tiếp các bảng dưới đây (Neon → Tables, hoặc SQL),
 * server tự nạp lại sau tối đa RELOAD_MS và đẩy giá mới xuống mọi người chơi đang online.
 *
 *   game_crops     — cây trồng: giá hạt, thời gian lớn, sản lượng, giá bán, xp, cấp mở khoá
 *   game_animals   — vật nuôi: giá mua, thức ăn/lần, thời gian ra sản phẩm, số lượng, giá bán sản phẩm
 *   game_settings  — thông số chung (key/value): feed_price, steal_keep, daily_bonus, starter_coins, plot_step
 *
 * Đặt enabled = false để ẩn một cây/vật nuôi khỏi cửa hàng (người đang trồng vẫn thu hoạch bình thường).
 */
const RELOAD_MS = 60_000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS game_crops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  seed_price INTEGER NOT NULL CHECK (seed_price >= 0),
  grow_sec INTEGER NOT NULL CHECK (grow_sec > 0),
  yield INTEGER NOT NULL CHECK (yield > 0),
  sell INTEGER NOT NULL CHECK (sell >= 0),
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS game_animals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  level INTEGER NOT NULL DEFAULT 1,
  feed INTEGER NOT NULL CHECK (feed >= 0),
  produce_sec INTEGER NOT NULL CHECK (produce_sec > 0),
  product TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_icon TEXT NOT NULL,
  product_sell INTEGER NOT NULL CHECK (product_sell >= 0),
  qty INTEGER NOT NULL CHECK (qty > 0),
  xp INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS game_settings (
  key TEXT PRIMARY KEY,
  value NUMERIC NOT NULL,
  note TEXT
);
`;

const SETTINGS: [keyof typeof ECON, string, string][] = [
  ['feedPrice', 'feed_price', 'Giá 1 phần thức ăn gia súc (xu)'],
  ['stealKeep', 'steal_keep', 'Tỉ lệ sản lượng chủ luôn giữ lại, 0–1 (0.6 = kẻ trộm lấy tối đa 40%)'],
  ['dailyBonus', 'daily_bonus', 'Quà đăng nhập mỗi ngày (xu)'],
  ['starterCoins', 'starter_coins', 'Xu khởi đầu cho tài khoản mới'],
  ['plotStep', 'plot_step', 'Giá mở ô đất thứ n = plot_step × (n − 4)'],
];

/** Tạo bảng + nạp giá mặc định nếu bảng còn trống, rồi đọc bảng giá vào bộ nhớ. */
export async function initCatalog() {
  await pool.query(SCHEMA);
  for (const [i, c] of DEFAULT_CROPS.entries()) {
    await pool.query(
      `INSERT INTO game_crops (id, name, icon, seed_price, grow_sec, yield, sell, xp, level, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [c.id, c.name, c.icon, c.seedPrice, c.growSec, c.yield, c.sell, c.xp, c.level, i]);
  }
  for (const [i, a] of DEFAULT_ANIMALS.entries()) {
    await pool.query(
      `INSERT INTO game_animals (id, name, icon, price, level, feed, produce_sec, product, product_name, product_icon, product_sell, qty, xp, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.name, a.icon, a.price, a.level, a.feed, a.produceSec, a.product, a.productName, a.productIcon, a.productSell, a.qty, a.xp, i]);
  }
  for (const [k, key, note] of SETTINGS) {
    await pool.query('INSERT INTO game_settings (key, value, note) VALUES ($1,$2,$3) ON CONFLICT (key) DO NOTHING', [key, ECON[k], note]);
  }
  await reloadCatalog();
  setInterval(() => { reloadCatalog().catch((e) => console.error('catalog reload', e)); }, RELOAD_MS);
}

let lastJson = '';

/** Đọc lại bảng giá từ DB; nếu có thay đổi thì áp dụng và đẩy xuống mọi client. */
export async function reloadCatalog() {
  const [crops, animals, settings] = await Promise.all([
    pool.query('SELECT * FROM game_crops WHERE enabled ORDER BY sort, level, id'),
    pool.query('SELECT * FROM game_animals WHERE enabled ORDER BY sort, level, id'),
    pool.query('SELECT key, value FROM game_settings'),
  ]);
  const int = (v: unknown, min = 0) => Math.max(min, Math.round(Number(v) || 0));
  const payload: CatalogPayload = {
    crops: crops.rows.map((r): CropDef => ({
      id: r.id, name: r.name, icon: r.icon, seedPrice: int(r.seed_price), growSec: int(r.grow_sec, 1),
      yield: int(r.yield, 1), sell: int(r.sell), xp: int(r.xp), level: int(r.level, 1),
    })),
    animals: animals.rows.map((r): AnimalDef => ({
      id: r.id, name: r.name, icon: r.icon, price: int(r.price), level: int(r.level, 1), feed: int(r.feed),
      produceSec: int(r.produce_sec, 1), product: r.product, productName: r.product_name, productIcon: r.product_icon,
      productSell: int(r.product_sell), qty: int(r.qty, 1), xp: int(r.xp),
    })),
    econ: { ...ECON },
  };
  const byKey = new Map(settings.rows.map((r) => [r.key as string, Number(r.value)]));
  for (const [k, key] of SETTINGS) {
    const v = byKey.get(key);
    if (v == null || !Number.isFinite(v)) continue;
    payload.econ[k] = k === 'stealKeep' ? Math.min(1, Math.max(0, v)) : Math.max(0, Math.round(v));
  }
  if (!payload.crops.length) return; // bảng trống/lỗi → giữ giá đang dùng
  const json = JSON.stringify(payload);
  if (json === lastJson) return;
  const first = !lastJson;
  lastJson = json;
  applyCatalog(payload);
  if (!first) {
    console.log('💹 Bảng giá đã cập nhật từ DB');
    getIo().emit('catalog', catalogSnapshot());
  }
}

/** Gói bảng giá hiện tại để gửi cho client vừa kết nối. */
export function currentCatalog() {
  return catalogSnapshot();
}
