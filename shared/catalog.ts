// Danh mục vật phẩm dùng chung cho client và server.

/** Ô trang bị: quần áo (Tiệm thời trang) + đồ cầm tay / ngậm / phương tiện (Cửa hàng). */
export type Slot = 'top' | 'bottom' | 'hat' | 'acc' | 'hand' | 'mouth' | 'ride';
/** Các ô không bắt buộc (có thể tháo ra). */
export const OPTIONAL_SLOTS: Slot[] = ['hat', 'acc', 'hand', 'mouth', 'ride'];
/** Ô bán ở Tiệm thời trang / ở Cửa hàng vật phẩm. */
export const FASHION_SLOTS: Slot[] = ['top', 'bottom', 'hat', 'acc'];
export const GEAR_SLOTS: Slot[] = ['hand', 'mouth', 'ride'];
export type ItemKind = 'seed' | 'produce' | 'feed' | 'clothing' | 'material';

export interface Item {
  id: string;
  name: string;
  icon: string;
  kind: ItemKind;
  price?: number; // giá mua ở cửa hàng
  sell?: number; // giá bán lại
  level?: number; // cấp tối thiểu để mua
  slot?: Slot;
  style?: string;
  color?: string;
  color2?: string;
  /** Phương tiện: hệ số tốc độ đi (1.5 = nhanh gấp rưỡi) */
  speed?: number;
  /** Mô tả ngắn hiện ở cửa hàng */
  desc?: string;
}

export interface CropDef {
  id: string;
  name: string;
  icon: string;
  seedPrice: number;
  growSec: number;
  yield: number;
  sell: number;
  xp: number;
  level: number;
}

export interface AnimalDef {
  id: string;
  name: string;
  icon: string;
  price: number;
  level: number;
  feed: number; // số thức ăn mỗi lần cho ăn
  produceSec: number;
  product: string; // item id
  productName: string;
  productIcon: string;
  productSell: number;
  qty: number;
  xp: number;
}

/** Thông số kinh tế chung (chỉnh được trong DB, bảng game_settings). */
export const ECON = {
  /** Tỉ lệ sản lượng chủ vườn luôn giữ lại (kẻ trộm lấy tối đa phần còn lại). */
  stealKeep: 0.6,
  feedPrice: 15,
  dailyBonus: 300,
  starterCoins: 2000,
  /** Giá mở ô đất thứ n = plotStep × (n − 4). */
  plotStep: 300,
  // ---- Cảnh sát tuần tra ----
  /** Cảnh sát ở lại mỗi nông trại bao lâu (giây) */
  policeStaySec: 15,
  /** Thời gian di chuyển giữa hai nhà (giây) */
  policeGapSec: 90,
  /** Cảnh sát ập tới: bắt ai đã trộm ở nhà này trong khoảng (giây) trước đó mà vẫn còn ở đây */
  policeLookbackSec: 90,
  /** Cảnh sát vừa tới: kẻ trộm có bấy nhiêu giây để chạy khỏi nông trại */
  policeGraceSec: 5,
  /** Tỉ lệ cảnh sát bắt được kẻ trộm còn nán lại (0–1) */
  policeCatchChance: 0.3,
  /** Tỉ lệ một lượt cảnh sát nghỉ, không đi tuần (0–1) */
  policeIdleChance: 0.3,
  /** Tiền phạt = fineBase × số lần vi phạm (xu, không về ai — tiền bị thu hồi) */
  fineBase: 100,
  /** Lao động công ích = jailMinPerOffense × số lần vi phạm (phút), tối đa jailMaxMin */
  jailMinPerOffense: 10,
  jailMaxMin: 120,
  /** Bảo lãnh: giá = bailPerMin × số phút còn lại, tối thiểu bailMin (xu, nộp cho hệ thống) */
  bailPerMin: 300,
  bailMin: 3000,
  /** Mỗi lần xin bảo lãnh cách nhau tối thiểu (phút) */
  bailCooldownMin: 5,
  // ---- Nâng cấp ô đất ("Đất màu mỡ") ----
  /** Giá nâng cấp 1 ô đất (xu) */
  plotUpgradePrice: 10000,
  /** Cấp người chơi tối thiểu để nâng cấp đất */
  plotUpgradeLevel: 3,
  /** Hệ số sản lượng của ô đã nâng cấp (2 = ×2) */
  plotUpgradeMult: 2,
  // ---- Trộm kiểu "lượm" (trộm sạch nhưng mất thời gian) ----
  /** Thời gian lượm cơ bản (giây) */
  stealSecBase: 3,
  /** Thêm mỗi sản phẩm (giây) — ô 6 cây ≈ 3 + 6×1.5 = 12 giây */
  stealSecPerItem: 1.5,
  /** Bắt vật nuôi: số giây này + giá con vật / 100 (gà ≈ 23s, bò ≈ 32s, cừu ≈ 40s) */
  stealAnimalSec: 20,
  // ---- Chó giữ nhà ----
  /** Xác suất chó xông ra trong một lần trộm (0–1) */
  dogCatchChance: 0.2,
  /** Tiền phạt khi bị chó đuổi (xu, trả cho chủ vườn) */
  dogFine: 30,
  // ---- Tiệm thời trang ----
  /** Giá đổi kiểu tóc / màu tóc / màu da (xu) */
  salonHair: 200,
  salonColor: 150,
  salonSkin: 100,
  /** Bán lại quần áo, vật phẩm: nhận lại tỉ lệ này của giá mua (0–1) */
  resellRate: 0.5,
  // ---- Mở rộng nông trại ----
  /** Ruộng mới (18 ô): cấp, xu, gỗ, đá */
  field2Level: 4,
  field2Coins: 3000,
  field2Wood: 4,
  field2Stone: 2,
  /** Sân xưởng: cấp, xu, gỗ, đá */
  yardLevel: 5,
  yardCoins: 5000,
  yardWood: 6,
  yardStone: 4,
  /** Chướng ngại (đá, gốc cây, bụi) mọc lại sau bao nhiêu giờ */
  obstacleRegrowH: 6,
  // ---- Nâng cấp vật nuôi ----
  /** Giá nâng = giá con vật × hệ số này × (cấp hiện tại + 1)² */
  animalUpgradeCost: 10,
  /** Mỗi cấp nhân sản lượng / lứa lên bao nhiêu lần (2 = ×2) */
  animalUpgradeMult: 2,
  /** Mỗi cấp nhanh hơn bao nhiêu (0.15 = 15%) */
  animalUpgradeSpeed: 0.15,
  // ---- Bảng đơn hàng ----
  /** Số ô đơn hàng trên bảng */
  orderSlots: 6,
  /** Đơn trả gấp bao nhiêu lần giá bán thẳng */
  orderBonus: 1.5,
  /** Tỉ lệ đơn VIP (thưởng ×2) */
  orderVipChance: 0.15,
  /** Giao xong: đơn mới tới sau bao nhiêu phút */
  orderRefillMin: 2,
  /** Bỏ qua: đơn mới tới sau bao nhiêu phút */
  orderSkipMin: 15,
  // ---- Đơn hàng cư dân ----
  /** Người đặt chỉ trả tỉ lệ này của giá trị đơn (hệ thống bù phần còn lại cho người giao) */
  playerOrderPay: 0.8,
  /** Phải giao đủ bấy nhiêu đơn dân làng mới được tự đăng đơn */
  playerOrderUnlock: 10,
  /** Số đơn đang mở tối đa mỗi người */
  playerOrderMax: 3,
  /** Đơn hết hạn sau bao nhiêu giờ (hoàn tiền) */
  playerOrderHours: 24,
  // ---- Vật liệu (Cửa hàng nông trại) ----
  /** Giá mua 1 gỗ / 1 đá (xu) */
  woodPrice: 150,
  stonePrice: 250,
  /** Bán lại vật liệu được tỉ lệ này của giá mua */
  matSellRate: 0.4,
};

// ---- Bảng giá MẶC ĐỊNH: chỉ dùng để khởi tạo DB lần đầu. Sau đó DB là nguồn chính (game_crops, game_animals). ----
// Nguyên tắc: thu đủ ≈ 2,5× tiền hạt; bị trộm tối đa (còn 60%) vẫn lời ≥ ~1,5×.
// [id, tên, icon, giá hạt, thời gian (giây), sản lượng, giá bán/cái, xp, cấp]
export const DEFAULT_CROPS: CropDef[] = ([
  ['cai', 'Cải xanh', '🥬', 10, 60, 4, 7, 2, 1],
  ['carot', 'Cà rốt', '🥕', 20, 180, 4, 13, 4, 1],
  ['ngo', 'Ngô', '🌽', 40, 300, 5, 20, 6, 2],
  ['cachua', 'Cà chua', '🍅', 60, 600, 5, 30, 10, 3],
  ['dau', 'Dâu tây', '🍓', 100, 1200, 6, 42, 16, 4],
  ['duahau', 'Dưa hấu', '🍉', 160, 2400, 5, 80, 28, 6],
  ['bingo', 'Bí ngô', '🎃', 250, 3600, 6, 110, 45, 8],
  ['hoahong', 'Hoa hồng', '🌹', 400, 7200, 6, 180, 80, 10],
] as [string, string, string, number, number, number, number, number, number][]).map(
  ([id, name, icon, seedPrice, growSec, y, sell, xp, level]) => ({ id, name, icon, seedPrice, growSec, yield: y, sell, xp, level }));

// Vật nuôi: mỗi lứa 3 sản phẩm (kẻ trộm lấy được 1), lời rõ sau khi trừ thức ăn.
export const DEFAULT_ANIMALS: AnimalDef[] = [
  { id: 'ga', name: 'Gà mái', icon: '🐔', price: 300, level: 2, feed: 1, produceSec: 600, product: 'prod:trung', productName: 'Trứng gà', productIcon: '🥚', productSell: 20, qty: 3, xp: 5 },
  { id: 'bo', name: 'Bò sữa', icon: '🐄', price: 1200, level: 5, feed: 2, produceSec: 1800, product: 'prod:sua', productName: 'Sữa bò', productIcon: '🥛', productSell: 70, qty: 3, xp: 15 },
  { id: 'cuu', name: 'Cừu', icon: '🐑', price: 2000, level: 7, feed: 3, produceSec: 3600, product: 'prod:len', productName: 'Len cừu', productIcon: '🧶', productSell: 130, qty: 3, xp: 30 },
];

export const CROPS: Record<string, CropDef> = {};
export const ANIMALS: Record<string, AnimalDef> = {};
export const ITEMS: Record<string, Item> = {};

/** Gói bảng giá gửi từ server xuống client (và nạp từ DB trên server). */
export interface CatalogPayload { crops: CropDef[]; animals: AnimalDef[]; econ: typeof ECON }

/**
 * Thay bảng giá đang dùng bằng gói mới — sửa tại chỗ các object CROPS / ANIMALS / ITEMS / ECON
 * để mọi nơi đang import chúng tự thấy giá mới.
 */
export function applyCatalog(c: CatalogPayload) {
  for (const k of Object.keys(CROPS)) delete CROPS[k];
  for (const k of Object.keys(ANIMALS)) delete ANIMALS[k];
  for (const k of Object.keys(ITEMS)) if (!k.startsWith('cl:') && !k.startsWith('mat:') && !k.startsWith('good:')) delete ITEMS[k];
  Object.assign(ECON, c.econ);
  for (const cr of c.crops) {
    CROPS[cr.id] = { ...cr };
    ITEMS[`seed:${cr.id}`] = { id: `seed:${cr.id}`, name: `Hạt ${cr.name.toLowerCase()}`, icon: '🌱', kind: 'seed', price: cr.seedPrice, level: cr.level };
    ITEMS[`crop:${cr.id}`] = { id: `crop:${cr.id}`, name: cr.name, icon: cr.icon, kind: 'produce', sell: cr.sell };
  }
  for (const a of c.animals) {
    ANIMALS[a.id] = { ...a };
    ITEMS[a.product] = { id: a.product, name: a.productName, icon: a.productIcon, kind: 'produce', sell: a.productSell };
  }
  ITEMS['feed'] = { id: 'feed', name: 'Thức ăn gia súc', icon: '🌾', kind: 'feed', price: ECON.feedPrice };
  setMatPrices();
}

/** Giá mua / bán gỗ, đá theo ECON (chỉnh trong DB). */
function setMatPrices() {
  for (const [id, price] of [['mat:wood', ECON.woodPrice], ['mat:stone', ECON.stonePrice]] as const) {
    const it = ITEMS[id];
    if (it) { it.price = price; it.sell = Math.max(1, Math.floor(price * ECON.matSellRate)); }
  }
}

export function catalogSnapshot(): CatalogPayload {
  return { crops: Object.values(CROPS), animals: Object.values(ANIMALS), econ: { ...ECON } };
}

applyCatalog({ crops: DEFAULT_CROPS, animals: DEFAULT_ANIMALS, econ: { ...ECON } });

const SLOT_ICON: Record<Slot, string> = { top: '👕', bottom: '👖', hat: '🎩', acc: '🕶️', hand: '🎈', mouth: '🎺', ride: '🛹' };

// [id, slot, tên, style, màu, màu phụ, giá, cấp]
const CLOTHES: [string, Slot, string, string, string, string | null, number, number][] = [
  ['tee_white', 'top', 'Áo thun trắng', 'tee', '#f4f4f8', null, 0, 1],
  ['tee_sky', 'top', 'Áo thun xanh trời', 'tee', '#7cc6fe', null, 0, 1],
  ['tee_red', 'top', 'Áo thun đỏ', 'tee', '#ef5b5b', null, 120, 1],
  ['tee_pink', 'top', 'Áo thun hồng', 'tee', '#ff9ec7', null, 0, 1],
  ['stripe_navy', 'top', 'Áo sọc hải quân', 'stripe', '#2b4c7e', '#ffffff', 250, 1],
  ['stripe_mint', 'top', 'Áo sọc bạc hà', 'stripe', '#8ee3c8', '#ffffff', 250, 1],
  ['hoodie_purple', 'top', 'Hoodie tím', 'hoodie', '#9b72cf', null, 400, 2],
  ['hoodie_yellow', 'top', 'Hoodie vàng', 'hoodie', '#ffd166', null, 400, 2],
  ['jacket_denim', 'top', 'Áo khoác bò', 'jacket', '#5a7fb5', '#87a7d6', 700, 3],
  ['jacket_black', 'top', 'Áo khoác da', 'jacket', '#34344a', '#5c5c78', 800, 3],
  ['dress_pink', 'top', 'Váy hồng', 'dress', '#ff9ec7', '#ffffff', 600, 2],
  ['dress_white', 'top', 'Váy trắng tinh khôi', 'dress', '#ffffff', '#ffc2dd', 900, 4],
  ['aodai_red', 'top', 'Áo dài đỏ', 'aodai', '#d7263d', '#ffd166', 1500, 5],
  ['aodai_blue', 'top', 'Áo dài xanh', 'aodai', '#3a86ff', '#ffffff', 1500, 5],
  ['pants_denim', 'bottom', 'Quần jean', 'pants', '#4a6fa5', null, 0, 1],
  ['pants_black', 'bottom', 'Quần đen', 'pants', '#2d2d38', null, 150, 1],
  ['pants_khaki', 'bottom', 'Quần kaki', 'pants', '#c8a97e', null, 150, 1],
  ['shorts_khaki', 'bottom', 'Quần short kaki', 'shorts', '#c8a97e', null, 0, 1],
  ['shorts_red', 'bottom', 'Quần short đỏ', 'shorts', '#e05d5d', null, 120, 1],
  ['skirt_pink', 'bottom', 'Chân váy hồng', 'skirt', '#ff9ec7', null, 150, 1],
  ['skirt_plaid', 'bottom', 'Chân váy caro', 'skirt', '#b23a48', '#2b2d42', 300, 2],
  ['cap_red', 'hat', 'Mũ lưỡi trai đỏ', 'cap', '#e63946', null, 200, 1],
  ['cap_blue', 'hat', 'Mũ lưỡi trai xanh', 'cap', '#457b9d', null, 200, 1],
  ['beanie_green', 'hat', 'Mũ len xanh', 'beanie', '#52b788', '#ffffff', 250, 1],
  ['bow_pink', 'hat', 'Nơ hồng', 'bow', '#ff70a6', null, 180, 1],
  ['party_hat', 'hat', 'Mũ sinh nhật', 'party', '#ffbe0b', '#fb5607', 300, 2],
  ['flower_crown', 'hat', 'Vòng hoa', 'flower', '#ffafcc', '#95d5b2', 500, 2],
  ['nonla', 'hat', 'Nón lá', 'nonla', '#e9d8a6', '#c9a96e', 600, 3],
  ['crown_gold', 'hat', 'Vương miện vàng', 'crown', '#ffd700', '#e63946', 5000, 8],
  ['glasses_round', 'acc', 'Kính tròn', 'glasses', '#333333', null, 150, 1],
  ['sunglasses', 'acc', 'Kính râm', 'sunglasses', '#151515', null, 300, 1],
  ['scarf_red', 'acc', 'Khăn quàng đỏ', 'scarf', '#e63946', null, 250, 2],
  ['cape_red', 'acc', 'Áo choàng đỏ', 'cape', '#c1121f', null, 1200, 4],
  ['wings_angel', 'acc', 'Cánh thiên thần', 'wings', '#ffffff', '#cde7ff', 3000, 6],
  ['tee_lime', 'top', 'Áo thun chanh', 'tee', '#b5e655', null, 120, 1],
  ['hoodie_black', 'top', 'Hoodie đen', 'hoodie', '#3a3a4a', null, 450, 2],
  ['stripe_red', 'top', 'Áo sọc đỏ', 'stripe', '#e05d5d', '#ffffff', 250, 1],
  ['jacket_green', 'top', 'Áo khoác lính', 'jacket', '#5f7a3f', '#86a35c', 750, 3],
  ['pants_white', 'bottom', 'Quần trắng', 'pants', '#efeff5', null, 200, 2],
  ['shorts_blue', 'bottom', 'Quần short xanh', 'shorts', '#4f8fd6', null, 120, 1],
  ['cat_ears', 'hat', 'Tai mèo', 'catears', '#2b2b2b', '#ff9ec7', 400, 2],
  ['cap_black', 'hat', 'Mũ lưỡi trai đen', 'cap', '#2d2d38', null, 200, 1],
  ['heart_glasses', 'acc', 'Kính trái tim', 'heartglasses', '#ff4d7e', null, 350, 2],
  ['backpack', 'acc', 'Ba lô', 'backpack', '#f4a261', '#e76f51', 600, 3],
];

// ---- Cửa hàng vật phẩm: cầm tay, ngậm, phương tiện ----
// [id, slot, tên, style, màu, màu phụ, giá, cấp, tốc độ, mô tả]
const GEAR: [string, Slot, string, string, string, string | null, number, number, number | null, string][] = [
  ['balloon_red', 'hand', 'Bóng bay đỏ', 'balloon', '#ef476f', null, 120, 1, null, 'Bay lơ lửng theo bạn'],
  ['balloon_blue', 'hand', 'Bóng bay xanh', 'balloon', '#4cc9f0', null, 120, 1, null, 'Bay lơ lửng theo bạn'],
  ['balloon_heart', 'hand', 'Bóng bay trái tim', 'balloonheart', '#ff5d8f', null, 250, 1, null, 'Tặng người thương'],
  ['icecream', 'hand', 'Cây kem', 'icecream', '#ffc8dd', '#f4a261', 100, 1, null, 'Mát lạnh ngày hè'],
  ['cotton_candy', 'hand', 'Kẹo bông', 'cottoncandy', '#ffafcc', '#cdb4db', 180, 1, null, 'Bông xốp ngọt ngào'],
  ['flag', 'hand', 'Lá cờ cổ vũ', 'flag', '#e63946', '#ffd166', 250, 2, null, 'Cổ vũ hết mình'],
  ['teddy', 'hand', 'Gấu bông', 'teddy', '#c68b59', '#f2d0a9', 600, 2, null, 'Ôm là hết buồn'],
  ['wand', 'hand', 'Đũa phép', 'wand', '#6c63ff', '#ffd166', 1500, 4, null, 'Lấp lánh ánh sao'],
  ['guitar', 'hand', 'Đàn ghi-ta', 'guitar', '#d08c60', '#7f4f24', 2000, 5, null, 'Đệm hát cho cả xóm'],
  ['chainsaw', 'hand', 'Máy cưa', 'chainsaw', '#f77f00', '#6c757d', 2500, 5, null, 'Ngầu nhất xóm'],
  ['lollipop', 'mouth', 'Kẹo mút', 'lollipop', '#ff70a6', '#ffd670', 60, 1, null, 'Ngọt lịm'],
  ['party_horn', 'mouth', 'Kèn sinh nhật', 'partyhorn', '#ffbe0b', '#3a86ff', 120, 1, null, 'Tò te tí te!'],
  ['whistle', 'mouth', 'Còi', 'whistle', '#ced4da', null, 100, 1, null, 'Tuýt tuýt!'],
  ['pacifier', 'mouth', 'Núm vú giả', 'pacifier', '#90e0ef', '#ff9ec7', 150, 1, null, 'Em bé của xóm'],
  ['trumpet', 'mouth', 'Kèn trumpet', 'trumpet', '#ffd166', '#e09f3e', 900, 3, null, 'Thổi vang cả khu'],
  ['rose_mouth', 'mouth', 'Hoa hồng ngậm', 'rose', '#d7263d', '#52b788', 500, 3, null, 'Lãng tử'],
  ['skates', 'ride', 'Giày patin', 'skates', '#ff5d8f', '#ffd166', 1200, 2, 1.3, 'Đi nhanh ×1,3'],
  ['skateboard', 'ride', 'Ván trượt', 'skateboard', '#3a86ff', '#ffbe0b', 2000, 3, 1.45, 'Đi nhanh ×1,45'],
  ['bicycle', 'ride', 'Xe đạp', 'bicycle', '#2a9d8f', '#264653', 3500, 4, 1.7, 'Đi nhanh ×1,7'],
  ['scooter', 'ride', 'Xe máy', 'scooter', '#e63946', '#f1faee', 9000, 7, 2.2, 'Đi nhanh ×2,2'],
  ['car_red', 'ride', 'Ô tô mui trần đỏ', 'car', '#e63946', '#ffd166', 20000, 10, 2.6, 'Đi nhanh ×2,6'],
  ['car_yellow', 'ride', 'Ô tô mui trần vàng', 'car', '#ffc300', '#3a86ff', 20000, 10, 2.6, 'Đi nhanh ×2,6'],
];
const GEAR_ICON: Record<string, string> = {
  skates: '⛸️', skateboard: '🛹', bicycle: '🚲', scooter: '🛵', car: '🚗',
  balloon: '🎈', balloonheart: '💗', icecream: '🍦', cottoncandy: '🍬', flag: '🚩', teddy: '🧸', wand: '✨', guitar: '🎸', chainsaw: '🔧',
  lollipop: '🍭', partyhorn: '🥳', whistle: '📯', pacifier: '🍼', trumpet: '🎺', rose: '🌹',
};
for (const [id, slot, name, style, color, color2, price, level] of CLOTHES) {
  ITEMS[`cl:${id}`] = {
    id: `cl:${id}`, name, icon: SLOT_ICON[slot], kind: 'clothing', slot, style, color,
    color2: color2 ?? undefined, price, level,
  };
}
for (const [id, slot, name, style, color, color2, price, level, speed, desc] of GEAR) {
  ITEMS[`cl:${id}`] = {
    id: `cl:${id}`, name, icon: GEAR_ICON[style] ?? SLOT_ICON[slot], kind: 'clothing', slot, style, color,
    color2: color2 ?? undefined, price, level, speed: speed ?? undefined, desc,
  };
}

// Vật liệu (dọn chướng ngại ở nông trại) — dùng để mở rộng đất, xây máy chế biến
ITEMS['mat:wood'] = { id: 'mat:wood', name: 'Gỗ', icon: '🌲', kind: 'material' };
ITEMS['mat:stone'] = { id: 'mat:stone', name: 'Đá', icon: '⛰️', kind: 'material' };
setMatPrices();
// Hàng chế biến (máy ở Sân xưởng)
for (const [id, name, icon, sell] of [
  ['banhngo', 'Bánh ngô', '🥞', 230], ['mutdau', 'Mứt dâu', '🍯', 380], ['phomai', 'Phô mai', '🧀', 480], ['aolen', 'Áo len', '🧥', 900],
] as [string, string, string, number][]) ITEMS[`good:${id}`] = { id: `good:${id}`, name, icon, kind: 'produce', sell };

/** Giá bán lại quần áo / vật phẩm (đồ tặng kèm 0 xu thì không bán được). */
export function resellPrice(itemId: string) {
  const it = ITEMS[itemId];
  if (!it || it.kind !== 'clothing' || !it.price) return 0;
  return Math.floor(it.price * ECON.resellRate);
}

/** Hệ số tốc độ đi theo phương tiện đang dùng. */
export function rideSpeed(a: { ride?: string | null } | null | undefined) {
  return (a?.ride && ITEMS[a.ride]?.speed) || 1;
}

export const STARTER_ITEMS: Record<string, number> = {
  'seed:cai': 10,
  'seed:carot': 5,
  feed: 5,
  'cl:tee_white': 1,
  'cl:tee_sky': 1,
  'cl:pants_denim': 1,
  'cl:shorts_khaki': 1,
  'cl:tee_pink': 1,
};

export const SKINS = ['#ffe3cc', '#f9d0b0', '#eab38b', '#c98e66', '#8d5a3b'];
export const HAIR_COLORS = ['#2b2b2b', '#5b3a29', '#a0522d', '#e0b04a', '#f2d68a', '#d94f70', '#6c63ff', '#3fb8af', '#ececec'];
export const HAIR_STYLES = ['Ngắn', 'Dựng', 'Dài', 'Bob', 'Đuôi ngựa', 'Búi đôi', 'Xoăn', 'Mào gà', 'Tết hai bên'];

export interface Appearance {
  skin: number;
  hair: number;
  hairColor: number;
  top: string;
  bottom: string;
  hat: string | null;
  acc: string | null;
  /** Đồ cầm tay / ngậm / phương tiện (tài khoản cũ có thể chưa có) */
  hand?: string | null;
  mouth?: string | null;
  ride?: string | null;
}

export const DEFAULT_APPEARANCE: Appearance = {
  skin: 0, hair: 0, hairColor: 0, top: 'cl:tee_white', bottom: 'cl:pants_denim', hat: null, acc: null, hand: null, mouth: null, ride: null,
};

export function xpToNext(level: number) {
  return 60 + level * 40;
}

export const MAX_PLOTS = 32;
export const START_PLOTS = 6;
export const MAX_ANIMALS = 10;

// ---- Nâng cấp vật nuôi: Lv1 → Lv2 → Lv3 ----
export const ANIMAL_MAX_LVL = 2; // lvl 0 = Lv1
/** Số sản phẩm mỗi lứa theo cấp con vật: mỗi cấp nhân với animalUpgradeMult (mặc định ×2) */
export function animalQty(type: string, lvl = 0) {
  return Math.round((ANIMALS[type]?.qty ?? 1) * ECON.animalUpgradeMult ** lvl);
}
/** Thời gian ra sản phẩm (giây) theo cấp con vật */
export function animalProduceSec(type: string, lvl = 0) {
  return Math.max(30, Math.round((ANIMALS[type]?.produceSec ?? 600) * (1 - ECON.animalUpgradeSpeed * lvl)));
}
/** Giá nâng con vật từ cấp lvl lên lvl+1: giá con vật × hệ số × (cấp + 1)² — rất đắt */
export function animalUpgradeCost(type: string, lvl = 0) {
  return Math.round((ANIMALS[type]?.price ?? 0) * ECON.animalUpgradeCost * (lvl + 1) ** 2);
}
export function plotPrice(currentCount: number) {
  return ECON.plotStep * (currentCount - 4);
}

/** Sản lượng một vụ trên ô đất: ô đã nâng cấp (lvl ≥ 1) được ×plotUpgradeMult, làm tròn. */
export function plotYield(baseYield: number, lvl?: number) {
  return lvl ? Math.max(baseYield, Math.round(baseYield * ECON.plotUpgradeMult)) : baseYield;
}

/** Số nông sản chủ vườn luôn giữ lại (không bị hái trộm): theo ECON.stealKeep (mặc định 60%), làm tròn lên. */
export function stealFloor(cropYield: number) {
  return Math.ceil(cropYield * ECON.stealKeep - 1e-9);
}
