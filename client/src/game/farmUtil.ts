import type { AnimalData, PlotData } from '../store';
import { serverNow } from '../store';

export function plotProgress(pl: PlotData, now = serverNow()) {
  if (!pl.crop || !pl.growMs) return 0;
  return Math.min(1, Math.max(0, (now - pl.plantedAt + pl.bonus) / pl.growMs));
}
export function plotStage(pl: PlotData, now = serverNow()) {
  const p = plotProgress(pl, now);
  return p >= 1 ? 3 : Math.floor(p * 3);
}
export function plotRemainMs(pl: PlotData, now = serverNow()) {
  return Math.max(0, pl.growMs - (now - pl.plantedAt + pl.bonus));
}
export function canWater(pl: PlotData) {
  if (!pl.crop) return false;
  const st = plotStage(pl);
  return st < 3 && pl.waterStage !== st;
}
export function animalRemainMs(a: AnimalData, now = serverNow()) {
  if (a.fedAt == null) return -1;
  return Math.max(0, a.fedAt + a.produceMs - now);
}
export function fmtTime(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h) return `${h}g ${m}p`;
  if (m) return `${m}p ${ss.toString().padStart(2, '0')}s`;
  return `${ss}s`;
}
