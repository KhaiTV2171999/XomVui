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

export const CROPS: Record<string, CropDef> = {};
[
  ['cai', 'Cải xanh', '🥬', 10, 60, 2, 9, 2, 1],
  ['carot', 'Cà rốt', '🥕', 20, 180, 2, 16, 4, 1],
  ['ngo', 'Ngô', '🌽', 35, 300, 3, 18, 6, 2],
  ['cachua', 'Cà chua', '🍅', 50, 600, 3, 28, 9, 3],
  ['dau', 'Dâu tây', '🍓', 80, 1200, 4, 34, 14, 4],
  ['duahau', 'Dưa hấu', '🍉', 150, 2400, 3, 85, 25, 6],
  ['bingo', 'Bí ngô', '🎃', 250, 3600, 4, 100, 40, 8],
  ['hoahong', 'Hoa hồng', '🌹', 400, 7200, 5, 130, 70, 10],
].forEach(([id, name, icon, seedPrice, growSec, y, sell, xp, level]) => {
  CROPS[id as string] = {
    id: id as string, name: name as string, icon: icon as string,
    seedPrice: seedPrice as number, growSec: growSec as number, yield: y as number,
    sell: sell as number, xp: xp as number, level: level as number,
  };
});

export interface AnimalDef {
  id: string;
  name: string;
  icon: string;
  price: number;
  level: number;
  feed: number; // số thức ăn mỗi lần cho ăn
  produceSec: number;
  product: string; // item id
  qty: number;
  xp: number;
}

export const ANIMALS: Record<string, AnimalDef> = {
  ga: { id: 'ga', name: 'Gà mái', icon: '🐔', price: 300, level: 2, feed: 1, produceSec: 600, product: 'prod:trung', qty: 2, xp: 5 },
  bo: { id: 'bo', name: 'Bò sữa', icon: '🐄', price: 1200, level: 5, feed: 2, produceSec: 1800, product: 'prod:sua', qty: 2, xp: 15 },
  cuu: { id: 'cuu', name: 'Cừu', icon: '🐑', price: 2000, level: 7, feed: 3, produceSec: 3600, product: 'prod:len', qty: 2, xp: 30 },
};

export const ITEMS: Record<string, Item> = {};

for (const c of Object.values(CROPS)) {
  ITEMS[`seed:${c.id}`] = { id: `seed:${c.id}`, name: `Hạt ${c.name.toLowerCase()}`, icon: '🌱', kind: 'seed', price: c.seedPrice, level: c.level };
  ITEMS[`crop:${c.id}`] = { id: `crop:${c.id}`, name: c.name, icon: c.icon, kind: 'produce', sell: c.sell };
}
ITEMS['prod:trung'] = { id: 'prod:trung', name: 'Trứng gà', icon: '🥚', kind: 'produce', sell: 25 };
ITEMS['prod:sua'] = { id: 'prod:sua', name: 'Sữa bò', icon: '🥛', kind: 'produce', sell: 90 };
ITEMS['prod:len'] = { id: 'prod:len', name: 'Len cừu', icon: '🧶', kind: 'produce', sell: 150 };
ITEMS['feed'] = { id: 'feed', name: 'Thức ăn gia súc', icon: '🌾', kind: 'feed', price: 15 };

const SLOT_ICON: Record<Slot, string> = { top: '👕', bottom: '👖', hat: '🎩', acc: '🕶️' };

// [id, slot, tên, style, màu, màu phụ, giá, cấp]
const CLOTHES: [string, Slot, string, string, string, string | null, number, number][] = [
  ['tee_white', 'top', 'Áo thun trắng', 'tee', '#f4f4f8', null, 0, 1],
  ['tee_sky', 'top', 'Áo thun xanh trời', 'tee', '#7cc6fe', null, 0, 1],
  ['tee_red', 'top', 'Áo thun đỏ', 'tee', '#ef5b5b', null, 120, 1],
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
  ['skirt_pink', 'bottom', 'Chân váy hồng', 'skirt', '#ff9ec7', null, 0, 1],
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
  'cl:skirt_pink': 1,
};
export const STARTER_COINS = 2000;
export const DAILY_BONUS = 300;

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
  return 300 * (currentCount - 4);
}

/** Số nông sản chủ vườn luôn giữ lại (không bị hái trộm): một nửa, làm tròn lên. */
export function stealFloor(cropYield: number) {
  return Math.ceil(cropYield / 2);
}
