import { create } from 'zustand';
import type { Appearance } from '../../shared/catalog';
import type { QuestState } from '../../shared/quests';

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
  /** Đang lao động công ích tới (ms) — null = tự do */
  jailUntil?: number | null;
  offenses?: number;
}

export interface PlayerPub { id: number; name: string; level: number; appearance: Appearance; x: number; y: number; jailed?: boolean }

export interface PlotData {
  crop: string | null; plantedAt: number; bonus: number; growMs: number;
  waterStage: number; yieldLeft: number; stolenBy: number[];
  /** 1 = Đất màu mỡ (sản lượng ×1,5) */
  lvl?: number;
}
export interface AnimalData { type: string; fedAt: number | null; produceMs: number; left?: number; stolenBy?: number[]; lvl?: number }
export interface FarmData { now: number; plots: PlotData[]; animals: AnimalData[]; dog?: boolean; areas?: string[]; cleared?: Record<string, number>; machines?: Record<string, { job: { at: number; done: number } | null }> }

export interface ZoneInfo {
  zone: string; kind: string; name: string; ownerId: number | null; ownerName: string | null;
  players: PlayerPub[]; farm: FarmData | null;
  /** Cảnh sát đang có mặt ở nông trại này (tới khi nào) */
  police?: { until: number } | null;
}

export interface ChatMsg { id: number; kind: 'chat' | 'system' | 'pm' | 'news'; name?: string; text: string; scope?: 'local' }
export interface NewsItem { id: number; kind: string; text: string; userId: number | null; at: number }
export interface Toast { id: number; msg: string; kind: 'info' | 'success' | 'error' }
export interface FriendRow { id: number; name: string; level: number; online?: boolean; zone?: string | null }

export type Panel = null | 'shop' | 'boutique' | 'quests' | 'expand' | 'orders' | 'workshop' | 'inventory' | 'kho' | 'tui' | 'residents' | 'wardrobe' | 'friends' | 'messages' | 'map' | 'games' | 'baucua' | 'tienlen' | 'tower' | 'werewolf' | 'bus';

export interface ChatMessage { id: number; from: number; to: number; text: string; at: number; read: boolean; fromName?: string }

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
  /** Đang mở trò chuyện riêng với ai (trong bảng Tin nhắn). */
  chatWith: { id: number; name: string } | null;
  /** Lịch sử tin nhắn đã tải theo từng người bạn. */
  chats: Record<number, ChatMessage[]>;
  /** Số tin chưa đọc theo từng người bạn. */
  unread: Record<number, number>;
  /** Đang đi xe buýt giữa các khu. */
  traveling: boolean;
  /** Ngăn chat mở ngay trong khu giải trí (không rời bàn chơi). */
  gameChat: null | 'table' | 'community' | 'friends';
  /** Chat tại bàn: chỉ là bong bóng trên đầu người chơi (userId → câu nói gần nhất) */
  tableSay: Record<number, { text: string; at: number }>;
  /** Tăng mỗi khi server gửi bảng giá mới → các bảng đang mở tự vẽ lại. */
  catalogVer: number;
  /** Bảng tin cộng đồng (mới nhất trước) */
  news: NewsItem[];
  /** Số tin mới chưa xem trên Bảng tin */
  newsUnread: number;
  /** Khu đất đang chọn trong bảng Mở rộng */
  expandArea: string | null;
  /** Bảng đơn hàng của mình */
  /** Máy đang xem trong bảng Xưởng */
  workshopMachine: string | null;
  /** Ô vừa gieo, đang chờ server xác nhận (gói cập nhật cũ không được xoá) */
  pendingPlots: Record<number, PlotData>;
  /** Cư dân đang xin bảo lãnh */
  bails: { id: number; name: string; until: number; price: number }[];
  orders: { slots: import('../../shared/orders').OrderSlot[]; offset: number } | null;
  /** Nhiệm vụ hằng ngày */
  quests: QuestState | null;
  /** Mở bảng Cư dân ở tab nào */
  resTab: 'list' | 'news';
  /** Đang mở bảng tặng quà cho ai */
  gift: { id: number; name: string } | null;
  /** Lời mời vào làng Ma Sói đang chờ trả lời */
  wwInvite: { roomId: number; fromId: number; fromName: string; count: number } | null;
  /** Đã nhận lời mời → mở bảng Ma Sói rồi vào làng này */
  wwJoinId: number | null;
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
  chatWith: null,
  chats: {},
  unread: {},
  traveling: false,
  gameChat: null,
  tableSay: {},
  catalogVer: 0,
  news: [],
  newsUnread: 0,
  expandArea: null,
  orders: null,
  workshopMachine: null,
  pendingPlots: {},
  bails: [],
  quests: null,
  resTab: 'list',
  gift: null,
  wwInvite: null,
  wwJoinId: null,
}));

export const set = useStore.setState;
export const get = useStore.getState;
// Chỉ khi chạy dev: cho phép script kiểm thử mở panel trực tiếp
if (import.meta.env.DEV) (window as unknown as { __xv: unknown }).__xv = { set, get };

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

/** Mở bảng Tin nhắn, trò chuyện với một người bạn. */
export function openChat(id: number, name: string) {
  set({ panel: 'messages', chatWith: { id, name }, playerCard: null });
}
