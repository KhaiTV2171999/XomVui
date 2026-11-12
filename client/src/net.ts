import { SERVER_URL } from './config';
import { io, Socket } from 'socket.io-client';
import { addChat, get, set, toast } from './store';
import type { FarmData, Me, PlayerPub, ZoneInfo } from './store';
import type { Appearance } from '../../shared/catalog';

type Handler = (data: any) => void;

/** Bus sự kiện giữa mạng và Phaser scene. */
class Bus {
  private map = new Map<string, Set<Handler>>();
  on(ev: string, fn: Handler) {
    if (!this.map.has(ev)) this.map.set(ev, new Set());
    this.map.get(ev)!.add(fn);
    return () => this.map.get(ev)!.delete(fn);
  }
  emit(ev: string, data?: unknown) {
    this.map.get(ev)?.forEach((fn) => fn(data));
  }
}
export const bus = new Bus();

let socket: Socket | null = null;

export function connect(token: string) {
  socket?.disconnect();
  const opts = { auth: { token }, transports: ['websocket', 'polling'] };
  socket = SERVER_URL ? io(SERVER_URL, opts) : io(opts);

  socket.on('connect', () => set({ connected: true }));
  socket.on('disconnect', () => set({ connected: false }));
  socket.on('connect_error', (err) => {
    if (err.message === 'unauthorized') logout();
  });
  socket.on('kicked', (msg: string) => {
    set({ fatal: msg });
    socket?.disconnect();
  });

  socket.on('me', (me: Me) => set({ me }));
  socket.on('toast', ({ msg, kind }) => toast(msg, kind));
  socket.on('friends', (friends) => set({ friends }));

  socket.on('zone:state', (z: ZoneInfo) => {
    if (z.farm) set({ timeOffset: z.farm.now - Date.now() });
    set({ zone: z, farm: z.farm, farmTool: 'auto' });
    addChat({ kind: 'system', text: `Bạn đã đến ${z.name}` });
    bus.emit('zone', z);
  });
  socket.on('player:join', (p: PlayerPub) => bus.emit('join', p));
  socket.on('player:leave', (d: { id: number }) => bus.emit('leave', d));
  socket.on('player:move', (d: { id: number; x: number; y: number }) => bus.emit('move', d));
  socket.on('player:appearance', (d: { id: number; appearance: Appearance }) => bus.emit('appearance', d));
  socket.on('player:chat', (d: { id: number; name: string; text: string }) => {
    addChat({ kind: 'chat', name: d.name, text: d.text });
    bus.emit('chat', d);
  });
  socket.on('pm', (d: { from: number; fromName: string; toName: string; text: string }) => {
    const mine = d.from === get().me?.id;
    addChat({ kind: 'pm', name: mine ? `Bạn → ${d.toName}` : `${d.fromName} → Bạn`, text: d.text });
  });
  socket.on('farm:update', ({ ownerId, farm }: { ownerId: number; farm: FarmData }) => {
    if (get().zone?.ownerId !== ownerId) return;
    set({ farm, timeOffset: farm.now - Date.now() });
    bus.emit('farm', farm);
  });

  // Các sự kiện của mini-game được panel tự lắng nghe.
  for (const ev of ['bc:state', 'bc:result', 'tl:state', 'tl:lobby', 'farm:dogchase']) {
    socket.on(ev, (d) => bus.emit(ev, d));
  }
}

/** Đi tới khu khác (có cảnh xe buýt nếu phù hợp). */
export function travel(zone: string) {
  bus.emit('travel', zone);
}

export function logout() {
  localStorage.removeItem('xv_token');
  socket?.disconnect();
  socket = null;
  set({ token: null, me: null, zone: null, connected: false });
}

export interface Res { ok: boolean; error?: string; [k: string]: any }

/** Gửi lệnh và chờ server trả lời. Tự hiện thông báo lỗi. */
export function call(event: string, data: unknown = {}, opts: { silent?: boolean } = {}): Promise<Res> {
  return new Promise((resolve) => {
    if (!socket) return resolve({ ok: false, error: 'Mất kết nối' });
    socket.timeout(8000).emit(event, data, (err: unknown, res: Res) => {
      if (err) res = { ok: false, error: 'Máy chủ không phản hồi' };
      if (!res.ok && !opts.silent) toast(res.error ?? 'Có lỗi', 'error');
      resolve(res);
    });
  });
}

export function send(event: string, data: unknown = {}) {
  socket?.emit(event, data);
}
