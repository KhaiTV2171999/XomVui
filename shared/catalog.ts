// Danh mục vật phẩm dùng chung cho client và server.

export type Slot = 'top' | 'bottom' | 'hat' | 'acc';
export type ItemKind = 'seed' | 'produce' | 'feed' | 'clothing';

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
  for (const k of Object.keys(ITEMS)) if (!k.startsWith('cl:')) delete ITEMS[k];
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
}

export function catalogSnapshot(): CatalogPayload {
  return { crops: Object.values(CROPS), animals: Object.values(ANIMALS), econ: { ...ECON } };
}

applyCatalog({ crops: DEFAULT_CROPS, animals: DEFAULT_ANIMALS, econ: { ...ECON } });

const SLOT_ICON: Record<Slot, string> = { top: '👕', bottom: '👖', hat: '🎩', acc: '🕶️' };

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
];
for (const [id, slot, name, style, color, color2, price, level] of CLOTHES) {
  ITEMS[`cl:${id}`] = {
    id: `cl:${id}`, name, icon: SLOT_ICON[slot], kind: 'clothing', slot, style, color,
    color2: color2 ?? undefined, price, level,
  };
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
export const HAIR_STYLES = ['Ngắn', 'Dựng', 'Dài', 'Bob', 'Đuôi ngựa', 'Búi đôi'];

export interface Appearance {
  skin: number;
  hair: number;
  hairColor: number;
  top: string;
  bottom: string;
  hat: string | null;
  acc: string | null;
}

export const DEFAULT_APPEARANCE: Appearance = {
  skin: 0, hair: 0, hairColor: 0, top: 'cl:tee_white', bottom: 'cl:pants_denim', hat: null, acc: null,
};

export function xpToNext(level: number) {
  return 60 + level * 40;
}

export const MAX_PLOTS = 26;
export const START_PLOTS = 6;
export const MAX_ANIMALS = 8;
export function plotPrice(currentCount: number) {
  return ECON.plotStep * (currentCount - 4);
}

/** Số nông sản chủ vườn luôn giữ lại (không bị hái trộm): theo ECON.stealKeep (mặc định 60%), làm tròn lên. */
export function stealFloor(cropYield: number) {
  return Math.ceil(cropYield * ECON.stealKeep - 1e-9);
}
