// Máy chế biến ở Sân xưởng: nguyên liệu → hàng chế biến (bán giá cao, dùng cho đơn hàng).
import { YARD } from './farmExpand';

export interface MachineDef {
  id: string; name: string; icon: string; level: number;
  cost: { coins: number; wood: number; stone: number };
  inputs: Record<string, number>; output: string; sec: number; xp: number;
}

export const MACHINES: MachineDef[] = [
  { id: 'oven', name: 'Lò nướng', icon: '🔥', level: 5, cost: { coins: 4000, wood: 4, stone: 2 }, inputs: { 'crop:ngo': 4, 'prod:trung': 1 }, output: 'good:banhngo', sec: 300, xp: 12 },
  { id: 'press', name: 'Máy làm mứt', icon: '⚙️', level: 6, cost: { coins: 6000, wood: 5, stone: 3 }, inputs: { 'crop:dau': 4 }, output: 'good:mutdau', sec: 600, xp: 18 },
  { id: 'dairy', name: 'Máy bơ sữa', icon: '🥛', level: 6, cost: { coins: 8000, wood: 6, stone: 4 }, inputs: { 'prod:sua': 3 }, output: 'good:phomai', sec: 900, xp: 24 },
  { id: 'loom', name: 'Khung dệt', icon: '🧵', level: 8, cost: { coins: 12000, wood: 8, stone: 6 }, inputs: { 'prod:len': 3 }, output: 'good:aolen', sec: 1500, xp: 40 },
];
export const MACHINE = Object.fromEntries(MACHINES.map((m) => [m.id, m])) as Record<string, MachineDef>;

/** Trạng thái một máy trong farm.machines */
export interface MachineState { job: { at: number; done: number } | null }

/** Vị trí đặt máy trên Sân xưởng */
export function machinePos(i: number) {
  // Lưới 2 × 2, mỗi máy một bệ riêng
  const col = i % 2, row = Math.floor(i / 2);
  return { x: YARD.x + YARD.w / 2 + (col ? 115 : -115), y: YARD.y + 120 + row * 140 };
}
