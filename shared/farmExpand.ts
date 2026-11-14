// Mở rộng nông trại: dọn chướng ngại lấy gỗ / đá, mở khu đất mới.
import { ECON, MAX_PLOTS } from './catalog';

export type AreaId = 'field2' | 'yard';
export interface Rect { x: number; y: number; w: number; h: number }

/** Ruộng mới: trên-giữa nông trại, giữa vườn trên và chuồng (18 ô, 3 hàng × 6). */
export const GARDEN3: Rect = { x: 1130, y: 150, w: 676, h: 319 };
/** Sân xưởng: dưới chuồng — chỗ đặt máy chế biến. */
export const YARD: Rect = { x: 1800, y: 575, w: 470, h: 300 };

export interface AreaDef { id: AreaId; name: string; icon: string; desc: string; rect: Rect; sign: { x: number; y: number } }
export const FARM_AREAS: AreaDef[] = [
  { id: 'field2', name: 'Ruộng mới', icon: '🌾', desc: 'Thêm 18 ô đất trồng', rect: GARDEN3, sign: { x: 1468, y: 300 } },
  { id: 'yard', name: 'Sân xưởng', icon: '🏭', desc: 'Chỗ đặt máy chế biến', rect: YARD, sign: { x: 2035, y: 715 } },
];

/** Giá mở từng khu (chỉnh trong DB, bảng game_settings). */
export function areaCost(id: AreaId) {
  return id === 'field2'
    ? { level: ECON.field2Level, coins: ECON.field2Coins, wood: ECON.field2Wood, stone: ECON.field2Stone }
    : { level: ECON.yardLevel, coins: ECON.yardCoins, wood: ECON.yardWood, stone: ECON.yardStone };
}

export const FIELD2_PLOTS = 18;
/** Số ô đất tối đa theo các khu đã mở. */
export function maxPlots(areas: string[] | undefined) {
  return MAX_PLOTS + (areas?.includes('field2') ? FIELD2_PLOTS : 0);
}
export const MAX_PLOTS_ALL = MAX_PLOTS + FIELD2_PLOTS;

export type ObstacleKind = 'rock' | 'stump' | 'bush';
/** Chướng ngại: trong khu chưa mở (mất hẳn khi mở khu) + vài cái ở rìa vườn ('wild', luôn mọc lại). */
export const OBSTACLES: { id: number; area: AreaId | 'wild'; kind: ObstacleKind; x: number; y: number }[] = [
  { id: 1, area: 'field2', kind: 'stump', x: 1215, y: 240 },
  { id: 2, area: 'field2', kind: 'rock', x: 1730, y: 230 },
  { id: 3, area: 'field2', kind: 'bush', x: 1360, y: 435 },
  { id: 4, area: 'yard', kind: 'rock', x: 1860, y: 640 },
  { id: 5, area: 'yard', kind: 'stump', x: 2215, y: 780 },
  { id: 6, area: 'yard', kind: 'bush', x: 1950, y: 860 },
  { id: 7, area: 'wild', kind: 'stump', x: 1230, y: 760 },
  { id: 8, area: 'wild', kind: 'rock', x: 1380, y: 1130 },
];

export const OBSTACLE_NAME: Record<ObstacleKind, string> = { rock: 'Tảng đá', stump: 'Gốc cây', bush: 'Bụi rậm' };

/** Chướng ngại còn đang mọc (chưa dọn, hoặc đã mọc lại). */
export function obstacleActive(id: number, areas: string[] | undefined, cleared: Record<string, number> | undefined, now = Date.now()) {
  const o = OBSTACLES.find((x) => x.id === id);
  if (!o) return false;
  if (o.area !== 'wild' && areas?.includes(o.area)) return false;
  const t = cleared?.[id];
  return !t || now - t >= ECON.obstacleRegrowH * 3600_000;
}
