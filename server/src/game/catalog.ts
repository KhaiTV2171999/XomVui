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
  ['policeStaySec', 'police_stay_sec', 'Cảnh sát ở lại mỗi nông trại bao lâu (giây)'],
  ['policeGapSec', 'police_gap_sec', 'Thời gian cảnh sát di chuyển giữa hai nhà (giây)'],
  ['policeLookbackSec', 'police_lookback_sec', 'Cảnh sát ập tới: bắt ai đã trộm ở nhà đó trong bao nhiêu giây trước mà còn ở lại'],
  ['policeGraceSec', 'police_grace_sec', 'Cảnh sát vừa tới: kẻ trộm có bấy nhiêu giây để chạy khỏi nông trại'],
  ['policeCatchChance', 'police_catch_chance', 'Tỉ lệ cảnh sát bắt được kẻ trộm còn nán lại (0–1)'],
  ['policeIdleChance', 'police_idle_chance', 'Tỉ lệ một lượt cảnh sát nghỉ, không đi tuần (0–1)'],
  ['bailPerMin', 'bail_per_min', 'Bảo lãnh: giá mỗi phút lao động công ích còn lại (xu)'],
  ['bailMin', 'bail_min', 'Bảo lãnh: giá tối thiểu (xu)'],
  ['bailCooldownMin', 'bail_cooldown_min', 'Bảo lãnh: mỗi lần xin cách nhau tối thiểu (phút)'],
  ['fineBase', 'fine_base', 'Tiền phạt = fine_base × số lần vi phạm (xu)'],
  ['jailMinPerOffense', 'jail_min_per_offense', 'Lao động công ích = số phút này × số lần vi phạm'],
  ['jailMaxMin', 'jail_max_min', 'Lao động công ích tối đa (phút)'],
  ['plotUpgradePrice', 'plot_upgrade_price', 'Giá nâng cấp 1 ô đất thành Đất màu mỡ (xu)'],
  ['plotUpgradeLevel', 'plot_upgrade_level', 'Cấp tối thiểu để nâng cấp ô đất'],
  ['plotUpgradeMult', 'plot_upgrade_mult', 'Hệ số sản lượng ô đã nâng cấp (1.5 = ×1,5)'],
  ['stealSecBase', 'steal_sec_base', 'Trộm: thời gian lượm cơ bản (giây)'],
  ['stealSecPerItem', 'steal_sec_per_item', 'Trộm: thêm mỗi sản phẩm (giây)'],
  ['stealAnimalSec', 'steal_animal_sec', 'Bắt trộm vật nuôi: số giây này + giá con vật / 100'],
  ['dogCatchChance', 'dog_catch_chance', 'Xác suất chó giữ nhà xông ra trong một lần trộm (0–1)'],
  ['dogFine', 'dog_fine', 'Tiền phạt khi bị chó đuổi (xu, trả cho chủ vườn)'],
  ['salonHair', 'salon_hair', 'Tiệm thời trang: giá đổi kiểu tóc (xu)'],
  ['salonColor', 'salon_color', 'Tiệm thời trang: giá nhuộm màu tóc (xu)'],
  ['salonSkin', 'salon_skin', 'Tiệm thời trang: giá đổi màu da (xu)'],
  ['resellRate', 'resell_rate', 'Bán lại quần áo / vật phẩm: nhận lại tỉ lệ này của giá mua (0–1)'],
  ['field2Level', 'field2_level', 'Mở rộng: Ruộng mới (18 ô) — cấp tối thiểu'],
  ['field2Coins', 'field2_coins', 'Mở rộng: Ruộng mới — giá xu'],
  ['field2Wood', 'field2_wood', 'Mở rộng: Ruộng mới — số gỗ'],
  ['field2Stone', 'field2_stone', 'Mở rộng: Ruộng mới — số đá'],
  ['yardLevel', 'yard_level', 'Mở rộng: Sân xưởng — cấp tối thiểu'],
  ['yardCoins', 'yard_coins', 'Mở rộng: Sân xưởng — giá xu'],
  ['yardWood', 'yard_wood', 'Mở rộng: Sân xưởng — số gỗ'],
  ['yardStone', 'yard_stone', 'Mở rộng: Sân xưởng — số đá'],
  ['obstacleRegrowH', 'obstacle_regrow_h', 'Chướng ngại (đá, gốc cây, bụi) mọc lại sau bao nhiêu giờ'],
  ['animalUpgradeCost', 'animal_upgrade_cost', 'Nâng cấp vật nuôi: giá = giá con vật × hệ số này × (cấp hiện tại + 1)²'],
  ['animalUpgradeMult', 'animal_upgrade_mult', 'Nâng cấp vật nuôi: mỗi cấp nhân sản lượng / lứa lên bao nhiêu lần (2 = ×2)'],
  ['animalUpgradeSpeed', 'animal_upgrade_speed', 'Nâng cấp vật nuôi: mỗi cấp nhanh hơn bao nhiêu (0.15 = 15%)'],
  ['orderSlots', 'order_slots', 'Bảng đơn hàng: số ô đơn'],
  ['orderBonus', 'order_bonus', 'Bảng đơn hàng: đơn trả gấp bao nhiêu lần giá bán thẳng'],
  ['orderVipChance', 'order_vip_chance', 'Bảng đơn hàng: tỉ lệ đơn VIP thưởng ×2 (0–1)'],
  ['orderRefillMin', 'order_refill_min', 'Bảng đơn hàng: giao xong, đơn mới tới sau bao nhiêu phút'],
  ['orderSkipMin', 'order_skip_min', 'Bảng đơn hàng: bỏ qua, đơn mới tới sau bao nhiêu phút'],
  ['playerOrderPay', 'player_order_pay', 'Đơn cư dân: người đặt trả tỉ lệ này của giá trị đơn (0.8 = 80%, hệ thống bù phần còn lại)'],
  ['playerOrderUnlock', 'player_order_unlock', 'Đơn cư dân: số đơn dân làng phải giao để mở khoá tự đăng đơn'],
  ['playerOrderMax', 'player_order_max', 'Đơn cư dân: số đơn đang mở tối đa mỗi người'],
  ['woodPrice', 'wood_price', 'Cửa hàng nông trại: giá mua 1 gỗ (xu)'],
  ['stonePrice', 'stone_price', 'Cửa hàng nông trại: giá mua 1 đá (xu)'],
  ['matSellRate', 'mat_sell_rate', 'Bán lại gỗ / đá được tỉ lệ này của giá mua (0–1)'],
  ['playerOrderHours', 'player_order_hours', 'Đơn cư dân: hết hạn sau bao nhiêu giờ (hoàn tiền)'],
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

/** Thông số được phép là số thập phân (không làm tròn) */
const FRACTIONAL = new Set<string>(['animalUpgradeCost', 'animalUpgradeMult', 'obstacleRegrowH', 'orderBonus', 'orderRefillMin', 'orderSkipMin']);

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
    payload.econ[k] = k === 'stealKeep' ? Math.min(1, Math.max(0, v))
      : k === 'plotUpgradeMult' ? Math.min(5, Math.max(1, v))
      : k === 'stealSecPerItem' || k === 'stealSecBase' ? Math.min(60, Math.max(0, v))
      : k === 'dogCatchChance' || k === 'resellRate' || k === 'animalUpgradeSpeed' || k === 'orderVipChance' || k === 'playerOrderPay' || k === 'matSellRate' || k === 'policeCatchChance' || k === 'policeIdleChance' ? Math.min(1, Math.max(0, v))
      : FRACTIONAL.has(k) ? Math.max(0, v)
      : Math.max(0, Math.round(v));
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
