import { create } from 'zustand';
import type { Appearance } from '../../shared/catalog';

export interface Me {
  id: number;
  name: string;
  coins: number;
  xp: number;
  level: number;
  xpNext: number;
  appearance: Appearance;
  created: boolean;
  inventory: Record<string, number>;
}

export interface PlayerPub { id: number; name: string; level: number; appearance: Appearance; x: number; y: number }

export interface PlotData {
  crop: string | null; plantedAt: number; bonus: number; growMs: number;
  waterStage: number; yieldLeft: number; stolenBy: number[];
}
export interface AnimalData { type: string; fedAt: number | null; produceMs: number }
export interface FarmData { now: number; plots: PlotData[]; animals: AnimalData[]; dog?: boolean }

export interface ZoneInfo {
  zone: string; kind: string; name: string; ownerId: number | null; ownerName: string | null;
  players: PlayerPub[]; farm: FarmData | null;
}

export interface ChatMsg { id: number; kind: 'chat' | 'system' | 'pm'; name?: string; text: string }
export interface Toast { id: number; msg: string; kind: 'info' | 'success' | 'error' }
export interface FriendRow { id: number; name: string; level: number; online?: boolean; zone?: string | null }

export type Panel = null | 'shop' | 'inventory' | 'wardrobe' | 'friends' | 'map' | 'games' | 'baucua' | 'tienlen' | 'bus';

interface State {
  token: string | null;
  connected: boolean;
  fatal: string | null;
  me: Me | null;
  zone: ZoneInfo | null;
  farm: FarmData | null;
  timeOffset: number;
  chat: ChatMsg[];
  toasts: Toast[];
  panel: Panel;
  shopTab: string;
  playerCard: number | null;
  farmTool: string;
  confirm: { text: string; onYes: () => void } | null;
  friends: { friends: FriendRow[]; incoming: FriendRow[] };
  pmTarget: { id: number; name: string } | null;
  /** Đang đi xe buýt giữa các khu. */
  traveling: boolean;
}

export const useStore = create<State>(() => ({
  token: localStorage.getItem('xv_token'),
  connected: false,
  fatal: null,
  me: null,
  zone: null,
  farm: null,
  timeOffset: 0,
  chat: [],
  toasts: [],
  panel: null,
  shopTab: 'seed',
  playerCard: null,
  farmTool: 'auto',
  confirm: null,
  friends: { friends: [], incoming: [] },
  pmTarget: null,
  traveling: false,
}));

export const set = useStore.setState;
export const get = useStore.getState;

let uid = 1;
export function toast(msg: string, kind: Toast['kind'] = 'info') {
  const id = uid++;
  set((s) => ({ toasts: [...s.toasts.slice(-4), { id, msg, kind }] }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500);
}

export function addChat(m: Omit<ChatMsg, 'id'>) {
  set((s) => ({ chat: [...s.chat.slice(-80), { ...m, id: uid++ }] }));
}

export function confirmBox(text: string, onYes: () => void) {
  set({ confirm: { text, onYes } });
}

export function openPanel(panel: Panel) {
  set({ panel });
}

export function serverNow() {
  return Date.now() + get().timeOffset;
}

export function fmt(n: number) {
  return n.toLocaleString('vi-VN');
}
