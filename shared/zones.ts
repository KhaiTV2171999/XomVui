// Bản đồ các khu vực.

export interface Rect { x: number; y: number; w: number; h: number }
export interface Portal extends Rect { to: string; label: string; spawn: { x: number; y: number } }
export type BuildingAction = 'shop' | 'boutique' | 'games';
export interface Building extends Rect { id: string; label: string; icon: string; style: 'arcade' | 'shop' | 'boutique'; action: BuildingAction }
/** Trạm xe buýt: người chơi đứng ở (x, y); bánh xe buýt chạm đất ở roadY. */
export interface BusStop { x: number; y: number; roadY: number }

export interface ZoneDef {
  id: string;
  name: string;
  w: number;
  h: number;
  spawn: { x: number; y: number };
  portals: Portal[];
  buildings: Building[];
  busStop?: BusStop;
  road?: { y: number; h: number; sidewalk: number };
}

export const ZONES: Record<string, ZoneDef> = {
  farm: {
    id: 'farm', name: 'Nông trại', w: 2400, h: 1720, spawn: { x: 330, y: 478 },
    portals: [],
    buildings: [],
    busStop: { x: 1160, y: 1436, roadY: 1546 },
    road: { y: 1470, h: 110, sidewalk: 54 },
  },
  fun: {
    id: 'fun', name: 'Khu vui chơi', w: 2000, h: 1100, spawn: { x: 1160, y: 866 },
    portals: [
      { x: 0, y: 600, w: 70, h: 220, to: 'park', label: 'Công viên', spawn: { x: 1640, y: 650 } },
    ],
    buildings: [
      { id: 'shop', x: 150, y: 250, w: 380, h: 310, label: 'Cửa hàng', icon: '🛒', style: 'shop', action: 'shop' },
      { id: 'games', x: 760, y: 170, w: 480, h: 390, label: 'Khu giải trí', icon: '🎪', style: 'arcade', action: 'games' },
      { id: 'wardrobe', x: 1470, y: 250, w: 380, h: 310, label: 'Tiệm thời trang', icon: '👗', style: 'boutique', action: 'boutique' },
    ],
    busStop: { x: 1160, y: 866, roadY: 976 },
    road: { y: 900, h: 110, sidewalk: 54 },
  },
  park: {
    id: 'park', name: 'Công viên', w: 1800, h: 1300, spawn: { x: 1600, y: 650 },
    portals: [
      { x: 1730, y: 560, w: 70, h: 190, to: 'fun', label: 'Khu vui chơi', spawn: { x: 150, y: 720 } },
    ],
    buildings: [],
  },
};

export function zoneDefOf(zoneId: string): ZoneDef | null {
  if (zoneId.startsWith('farm:')) return ZONES.farm;
  return ZONES[zoneId] ?? null;
}

// ---- Bố cục nông trại ----
/** Hàng rào nông trại (đã nới rộng: chừa đất bên phải & phía dưới cho các khu mở rộng sau này). */
export const FARM_FENCE = { x: 140, y: 130, w: 2120, h: 1230, gateX: 880, gateW: 180 };
/** Nhà nằm sát góc trên-trái hàng rào; (x, y) là chân cửa nhà. */
export const FARM_HOUSE = { x: 305, y: 335, left: 140, right: 475, top: 130 };
/** Vườn chính dưới nhà: 4 hàng × 6 ô (ô 1-18 và 27-32). */
export const GARDEN = { x: 172, y: 524, w: 676, h: 430 };
/** Vườn thứ 2 ở phía trên, cạnh nhà (ô 19-26). */
export const GARDEN2 = { x: 620, y: 150, w: 468, h: 218 };

export const PLOT_W = 92;
export const PLOT_H = 70;
export function plotPos(i: number) {
  if (i >= 32) {
    // Ruộng mới (mở rộng): 3 hàng × 6 ô ở trên-giữa nông trại (giữa vườn trên và chuồng)
    const j = i - 32;
    return { x: 1186 + (j % 6) * 112, y: 208 + Math.floor(j / 6) * 104 };
  }
  if (i >= 26) {
    // Hàng thứ 4 của vườn chính
    return { x: 228 + (i - 26) * 112, y: 586 + 3 * 104 };
  }
  if (i >= 18) {
    const j = i - 18;
    return { x: 686 + (j % 4) * 112, y: 208 + Math.floor(j / 4) * 100 };
  }
  const col = i % 6;
  const row = Math.floor(i / 6);
  return { x: 228 + col * 112, y: 586 + row * 104 };
}

/** Chuồng ở góc trên-phải trong rào (đối xứng với nhà ở góc trên-trái). */
export const PEN = { x: 1820, y: 130, w: 440, h: 430 };
/** Vật nuôi (tối đa 10) đứng thành 2 hàng × 5 trước nhà kho (nhà kho sát góc trên-phải của chuồng). */
export function animalPos(i: number) {
  const col = i % 5;
  const row = Math.floor(i / 5);
  return { x: PEN.x + 50 + col * 85, y: PEN.y + 255 + row * 115 };
}

/** Ao ở góc dưới-trái (dưới vườn chính). x, y là tâm. */
export const FARM_POND = { x: 470, y: 1150, w: 560, h: 250 };

/** Sân lát đá trước dãy nhà ở Khu vui chơi. */
export const FUN_PLAZA = { x: 0, y: 560, w: 2000, h: 286 };
