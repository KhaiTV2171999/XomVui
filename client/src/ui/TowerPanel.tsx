import { SayBubble } from './GameChat';
import { useEffect, useRef, useState } from 'react';
import type { Appearance } from '../../../shared/catalog';
import { drop, floors as floorsOf, hangX, newTower, swayAt, swingOf, TowerState, TW, WIND_FROM, windAt } from '../../../shared/tower';
import { bus, call, send } from '../net';
import { confirmBox, fmt, set, toast, useStore } from '../store';
import { sfx } from '../sound';
import { AvatarPreview } from './common';
import { GameChatButton } from './GameChat';

// ============================================================ Kiểu dữ liệu

interface BoardRow { id: number; name: string; best: number; floors: number; appearance: Appearance }
interface Mine { best: number; floors: number; plays: number; rank: number | null }
interface RoomPlayer { id: number; name: string; appearance: Appearance; score?: number; floors?: number; lives?: number; over?: boolean; combo?: number }
interface RoomView {
  id: number; stake: number; hostId: number; phase: 'waiting' | 'countdown' | 'playing' | 'done';
  seed: number; startAt: number; endsAt: number; winnerId: number | null; now: number; players: RoomPlayer[];
}
interface LobbyRoom { id: number; stake: number; host: string; hostAppearance: Appearance }
interface DropOut { ok: boolean; score: number; floors: number; lives: number; combo: number; over: boolean; end?: string; best?: number; record?: boolean; rank?: number | null }

// ============================================================ Bảng chính

/** Khu "Xây nhà cao tầng": sảnh (chơi đơn xếp hạng + solo 2 người) và màn chơi. */
export function TowerPanel() {
  const coins = useStore((s) => s.me?.coins ?? 0);
  const meId = useStore((s) => s.me?.id ?? 0);
  const [view, setView] = useState<'lobby' | 'solo' | 'duel'>('lobby');
  const [soloSeed, setSoloSeed] = useState(0);
  const [room, setRoom] = useState<RoomView | null>(null);

  useEffect(() => {
    const off = bus.on('tw:room', (r: RoomView) => setRoom((cur) => (cur && cur.id !== r.id ? cur : r)));
    return () => { off(); };
  }, []);
  useEffect(() => () => { send('tw:quit'); send('tw:leave'); }, []);
  useEffect(() => { if (room && room.phase !== 'waiting') setView('duel'); }, [room?.phase]);

  const close = () => set({ panel: null });
  const back = () => set({ panel: 'games' });

  async function playSolo() {
    const r = await call('tw:solo');
    if (r.ok) { setSoloSeed(r.seed); setView('solo'); }
  }
  function leaveDuel() {
    const live = room && (room.phase === 'playing' || room.phase === 'countdown');
    const go = () => { send('tw:leave'); setRoom(null); setView('lobby'); };
    if (live) confirmBox('Rời trận bây giờ sẽ bị xử thua. Rời phòng?', go); else go();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && view === 'lobby') close(); }}>
      <div className="arcade sky tw-view">
        <div className="arcade-head">
          <button className="btn small felt-back" onClick={view === 'lobby' ? back : view === 'solo' ? () => { send('tw:quit'); setView('lobby'); } : leaveDuel} aria-label="Quay lại">
            ←<span className="back-label"> {view === 'lobby' ? 'Khu giải trí' : 'Sảnh'}</span>
          </button>
          <h2 className="neon">🏗️ XÂY NHÀ CAO TẦNG</h2>
          <GameChatButton />
          <span className="arcade-coins">💰 {fmt(coins)} xu</span>
          <button className="icon-btn arcade-close" onClick={close} aria-label="Đóng">✕</button>
        </div>
        {view === 'lobby' && <Lobby onSolo={playSolo} room={room} setRoom={setRoom} meId={meId} />}
        {view === 'solo' && <SoloGame key={soloSeed} seed={soloSeed} onAgain={playSolo} onExit={() => setView('lobby')} />}
        {view === 'duel' && room && <DuelGame room={room} meId={meId} onExit={() => { send('tw:leave'); setRoom(null); setView('lobby'); }} />}
      </div>
    </div>
  );
}

// ============================================================ Sảnh

function Lobby({ onSolo, room, setRoom, meId }: { onSolo: () => void; room: RoomView | null; setRoom: (r: RoomView | null) => void; meId: number }) {
  const [board, setBoard] = useState<{ top: BoardRow[]; me: Mine } | null>(null);
  const [rooms, setRooms] = useState<LobbyRoom[]>([]);
  const [stakes, setStakes] = useState<number[]>([0, 100, 500, 1000]);
  const coins = useStore((s) => s.me?.coins ?? 0);

  useEffect(() => {
    call('tw:board', {}, { silent: true }).then((r) => r.ok && setBoard(r as never));
    call('tw:lobby', {}, { silent: true }).then((r) => { if (r.ok) { setRooms(r.rooms); setStakes(r.stakes); } });
    const off = bus.on('tw:lobby', (list: LobbyRoom[]) => setRooms(list));
    return () => { off(); send('tw:unlobby'); };
  }, []);

  async function create(stake: number) {
    const r = await call('tw:create', { stake });
    if (r.ok) setRoom(r.room);
  }
  async function join(id: number) {
    const r = await call('tw:join', { id });
    if (r.ok) setRoom(r.room);
  }

  const waitingMine = room && room.phase === 'waiting';
  return (
    <div className="tw-lobby">
      <section className="tw-card solo">
        <div className="tw-card-head"><h3>🏆 Chơi đơn xếp hạng</h3>
          {board?.me && board.me.best > 0 && <span className="tw-mine">Kỷ lục: <b>{fmt(board.me.best)}</b> · hạng #{board.me.rank}</span>}
        </div>
        <p className="tw-howto">Cần cẩu thả tầng nhà đung đưa — <b>chạm để thả</b>. Thả thẳng tắp được <b>Hoàn hảo</b> &amp; combo. Lệch quá thì rơi (3 mạng), nhà nghiêng quá sẽ đổ!</p>
        <button className="play-btn big" onClick={onSolo}>▶ CHƠI NGAY</button>
        <div className="tw-board">
          {!board ? <p className="empty">Đang tải…</p> : board.top.length === 0 ? <p className="empty">Chưa có ai — hãy là người đầu tiên! 🏗️</p> : board.top.map((r, i) => (
            <div key={r.id} className={`tw-row ${r.id === meId ? 'me' : ''}`}>
              <span className={`tw-rank r${i + 1}`}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
              <span className="tw-ava"><AvatarPreview appearance={r.appearance} size={44} /></span>
              <span className="tw-name">{r.name}</span>
              <span className="tw-floors">{r.floors} tầng</span>
              <b className="tw-score">{fmt(r.best)}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="tw-card duel">
        <div className="tw-card-head"><h3>⚔️ Solo 2 người</h3><span className="tw-mine">90 giây · điểm cao hơn thắng</span></div>
        {waitingMine ? (
          <div className="tw-waiting">
            <div className="tw-spinner">🏗️</div>
            <p>Đang chờ đối thủ vào phòng #{room!.id}{room!.stake ? ` · cược ${fmt(room!.stake)} xu` : ' · đấu vui'}…</p>
            <button className="btn" onClick={() => { send('tw:leave'); setRoom(null); }}>Huỷ phòng</button>
          </div>
        ) : (
          <>
            <p className="tw-sub">Mở phòng mới (mỗi người đặt cược, thắng ăn cả):</p>
            <div className="tw-stakes">
              {stakes.map((s) => (
                <button key={s} className="tw-stake" disabled={s > coins} onClick={() => create(s)}>
                  {s ? <>💰 {fmt(s)}</> : <>🎈 Đấu vui</>}
                </button>
              ))}
            </div>
            <p className="tw-sub">Phòng đang chờ:</p>
            <div className="tw-rooms">
              {rooms.length === 0 ? <p className="empty">Chưa có phòng nào — mở một phòng để rủ bạn nhé!</p> : rooms.map((r) => (
                <div key={r.id} className="tw-room">
                  <span className="tw-ava"><AvatarPreview appearance={r.hostAppearance} size={44} /></span>
                  <span className="tw-name">{r.host}</span>
                  <span className="tw-floors">{r.stake ? `💰 ${fmt(r.stake)}` : '🎈 Đấu vui'}</span>
                  <button className="play-btn small" disabled={r.stake > coins} onClick={() => join(r.id)}>VÀO ⚔️</button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ============================================================ Ván chơi đơn

function SoloGame({ seed, onAgain, onExit }: { seed: number; onAgain: () => void; onExit: () => void }) {
  const [hud, setHud] = useState({ score: 0, floors: 0, lives: TW.LIVES, combo: 0 });
  const [over, setOver] = useState<DropOut | null>(null);
  return (
    <div className="tw-stage">
      <TowerCanvas seed={seed} startAt={0} onLocal={setHud}
        onDrop={async (dt) => {
          const r = (await call('tw:drop', { dt }, { silent: true })) as DropOut;
          if (r.ok && r.over) { setOver(r); if (r.record) sfx('levelup'); }
          return r;
        }} />
      <GameHud {...hud} />
      {over && (
        <div className="tw-result">
          <h3>{over.end === 'topple' ? '💥 Nhà đổ rồi!' : '🏁 Hết lượt!'}</h3>
          <div className="tw-big">{fmt(over.score)} <small>điểm</small></div>
          <p>{over.floors} tầng{over.record ? ' · 🎉 Kỷ lục mới!' : over.best ? ` · kỷ lục ${fmt(over.best)}` : ''}{over.rank ? ` · hạng #${over.rank}` : ''}</p>
          <div className="tw-result-btns">
            <button className="play-btn big" onClick={onAgain}>↻ CHƠI LẠI</button>
            <button className="btn" onClick={onExit}>Bảng xếp hạng</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================ Trận solo 2 người

function DuelGame({ room, meId, onExit }: { room: RoomView; meId: number; onExit: () => void }) {
  const [hud, setHud] = useState({ score: 0, floors: 0, lives: TW.LIVES, combo: 0 });
  const offset = useRef(room.now - Date.now());
  useEffect(() => { offset.current = room.now - Date.now(); }, [room.now]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  const opp = room.players.find((p) => p.id !== meId);
  const me = room.players.find((p) => p.id === meId);
  const sNow = now + offset.current;
  const count = Math.ceil((room.startAt - sNow) / 1000);
  const left = Math.max(0, Math.ceil((room.endsAt - sNow) / 1000));
  const pot = room.stake * room.players.length;

  return (
    <div className="tw-stage">
      {room.seed > 0 && (
        <TowerCanvas key={room.id} seed={room.seed} startAt={room.startAt - offset.current} stopped={room.phase === 'done'} onLocal={setHud}
          onDrop={async (dt) => (await call('tw:drop', { dt }, { silent: true })) as DropOut} />
      )}
      <GameHud {...hud} />
      <div className="tw-say-me"><SayBubble uid={meId} /></div>
      <div className="tw-duelbar">
        <div className="tw-opp">
          <SayBubble uid={opp?.id} />
          <span className="tw-ava"><AvatarPreview appearance={opp?.appearance ?? me!.appearance} size={44} /></span>
          <div><b>{opp?.name ?? '…'}</b><small>{opp?.floors ?? 0} tầng · {fmt(Math.max(0, opp?.score ?? 0))} điểm · {'❤️'.repeat(Math.max(0, opp?.lives ?? 0))}{opp?.over ? ' · xong' : ''}</small></div>
        </div>
        <div className={`tw-timer ${left <= 10 ? 'hot' : ''}`}>⏱ {left}s</div>
        {pot > 0 && <div className="tw-pot">💰 {fmt(pot)}</div>}
      </div>
      {room.phase === 'countdown' && count > 0 && <div className="tw-count">{count}</div>}
      {room.phase === 'done' && (
        <div className="tw-result">
          <h3>{room.winnerId == null ? '🤝 Hoà!' : room.winnerId === meId ? '🏆 Bạn thắng!' : '😢 Bạn thua'}</h3>
          <div className="tw-vs">
            {room.players.map((p) => (
              <div key={p.id} className={`tw-vs-p ${p.id === room.winnerId ? 'win' : ''}`}>
                <span className="tw-ava"><AvatarPreview appearance={p.appearance} size={56} /></span>
                <b>{p.id === meId ? 'Bạn' : p.name}</b>
                <span>{fmt(Math.max(0, p.score ?? 0))} điểm · {p.floors ?? 0} tầng</span>
              </div>
            ))}
          </div>
          {pot > 0 && <p>{room.winnerId == null ? 'Hoàn lại tiền cược' : `Người thắng nhận ${fmt(pot)} xu`}</p>}
          <div className="tw-result-btns"><button className="play-btn big" onClick={onExit}>VỀ SẢNH</button></div>
        </div>
      )}
    </div>
  );
}

function GameHud({ score, floors, lives, combo }: { score: number; floors: number; lives: number; combo: number }) {
  return (
    <div className="tw-hud">
      <div className="tw-hud-box"><small>Tầng</small><b>{floors}</b></div>
      <div className="tw-hud-box"><small>Điểm</small><b>{fmt(Math.max(0, score))}</b></div>
      <div className="tw-hud-box lives">{Array.from({ length: TW.LIVES }, (_, i) => <span key={i} className={i < lives ? '' : 'lost'}>❤️</span>)}</div>
      {combo >= 2 && <div className="tw-combo">🔥 Combo ×{combo}</div>}
    </div>
  );
}

// ============================================================ Màn chơi (canvas)

/** Tầng đang treo cao hơn đỉnh toà nhà bao nhiêu tầng */
const HOOK_GAP = 2.4;

const PALETTE = [
  ['#ffb3c7', '#e0839d'], ['#b5ead7', '#7cc7a8'], ['#ffe29a', '#e0b85a'], ['#c7d8ff', '#8fa8e0'], ['#e2c6ff', '#b28ee0'], ['#ffd1a8', '#e3a06d'],
];

interface FallAnim { x: number; y: number; vy: number; rot: number; vr: number; kind: 'land' | 'perfect' | 'miss'; targetY: number; t0: number; sway: number }
interface FloatText { text: string; x: number; y: number; t0: number; color: string }

/**
 * Canvas trò chơi: tự mô phỏng (shared/tower) để phản hồi tức thì; mỗi lần thả gửi dt lên server chấm điểm.
 * startAt: thời điểm (giờ máy) bắt đầu cho tầng đầu tiên xuất hiện (0 = ngay).
 */
function TowerCanvas({ seed, startAt, stopped, onDrop, onLocal }: {
  seed: number; startAt: number; stopped?: boolean;
  onDrop: (dt: number) => Promise<DropOut>;
  onLocal: (h: { score: number; floors: number; lives: number; combo: number }) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stoppedRef = useRef(!!stopped);
  stoppedRef.current = !!stopped;

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    const st: TowerState = newTower(seed);
    let spawnAt = Math.max(performance.now(), performance.now() + (startAt ? startAt - Date.now() : 0));
    let fall: FallAnim | null = null;
    const texts: FloatText[] = [];
    let camY = 0;
    let raf = 0;
    let shake = 0;
    /** Độ lắc đang hiển thị + phần bù để chuyển mượt khi số tầng đổi (không bị giật lệch) */
    let shownSway = 0, swayCorr = 0;
    // Vệt gió & lá bay (chỉ để nhìn — sức gió thật nằm trong shared/tower)
    const streaks = Array.from({ length: 26 }, (_, i) => ({ x: Math.random(), y: Math.random(), len: 0.5 + Math.random(), leaf: i % 4 === 0, spin: Math.random() * 6 }));
    let lastT = performance.now();
    const clouds = Array.from({ length: 7 }, (_, i) => ({ x: (i * 173) % 900 - 450, y: 200 + i * 230, s: 0.6 + (i % 3) * 0.25 }));

    const push = () => onLocal({ score: st.score, floors: floorsOf(st), lives: st.lives, combo: st.combo });

    function size() {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
    }
    size();
    const ro = new ResizeObserver(size);
    ro.observe(cv);

    function tap() {
      if (stoppedRef.current || st.over || fall) return;
      const now = performance.now();
      if (now < spawnAt) return;
      const dt = now - spawnAt;
      if (dt < TW.MIN_DT) return;
      const n = st.blocks.length;
      const x = hangX(seed, n, dt);
      const hookY = topY() + TW.H * HOOK_GAP; // đo trước khi thêm tầng mới
      const res = drop(st, dt)!;
      fall = { x: res.kind === 'miss' ? x : res.x, y: hookY, vy: 0, rot: 0, vr: 0, kind: res.kind, targetY: (n + 1) * TW.H, t0: now, sway: res.sway };
      if (res.kind === 'miss') { fall.vr = (x > 0 ? 1 : -1) * 0.06; sfx('error'); }
      onDrop(dt).then((r) => {
        if (r.ok && (r.score !== st.score || r.floors !== floorsOf(st))) {
          // Hiếm khi lệch (mạng chậm): lấy số của server cho HUD
          onLocal({ score: r.score, floors: r.floors, lives: r.lives, combo: r.combo });
        }
      });
    }
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); tap(); } };
    cv.addEventListener('pointerdown', tap);
    window.addEventListener('keydown', onKey);

    // y (đơn vị thế giới, hướng lên) của đỉnh toà nhà
    const topY = () => (st.blocks.length + 1) * TW.H;

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const W = cv.width, H = cv.height;
      const scale = Math.min(W / (TW.W * 3.3), H / (TW.H * 7.2));
      // Rơi
      if (fall) {
        fall.vy += 0.9;
        fall.y -= fall.vy * 0.06 * TW.H / 4;
        fall.rot += fall.vr;
        const landed = fall.kind !== 'miss' && fall.y <= fall.targetY;
        if (landed || fall.y < camY - TW.H * 8) {
          if (fall.kind === 'perfect') { sfx('coin'); texts.push({ text: st.combo >= 2 ? `Hoàn hảo! ×${st.combo}` : 'Hoàn hảo!', x: fall.x, y: fall.targetY + TW.H, t0: now, color: '#ffd166' }); shake = 6; }
          else if (fall.kind === 'land') { sfx('plant'); shake = 3; }
          else texts.push({ text: `−1 ❤️`, x: 0, y: topY() + TW.H * 2, t0: now, color: '#ff6b8b' });
          // Tầng vừa đáp: giữ đúng chỗ nó rơi xuống, rồi chuyển mượt sang nhịp lắc mới
          swayCorr = shownSway - swayAt(st, st.t);
          fall = null;
          push();
          if (st.over) { sfx(st.end === 'topple' ? 'lose' : 'error'); if (st.end === 'topple') shake = 14; }
          spawnAt = now + 120;
        }
      }
      // Camera: luôn thấy tầng đang treo ở gần mép trên (+ vài tầng trên cùng của toà nhà bên dưới)
      const viewH = (H / scale) * 0.92;
      const target = Math.max(0, topY() + TW.H * (HOOK_GAP + 1.6) - viewH);
      camY += (target - camY) * 0.08;

      // ---- Vẽ ----
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const h = floorsOf(st);
      const t = Math.min(1, h / 45);
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, mix('#7cc6fe', '#2b2d6e', t));
      sky.addColorStop(1, mix('#d8f3ff', '#ffb38a', Math.min(1, t * 1.4)));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      if (t > 0.55) { // sao đêm
        ctx.fillStyle = `rgba(255,255,255,${(t - 0.55) * 1.6})`;
        for (let i = 0; i < 40; i++) ctx.fillRect(((i * 97) % 1000) / 1000 * W, ((i * 53) % 600) / 1000 * H, 2, 2);
      }
      const sx = (x: number) => W / 2 + x * scale + (shake ? (Math.random() - 0.5) * shake : 0);
      const sy = (y: number) => H - (y - camY) * scale - H * 0.08;
      shake *= 0.85; if (shake < 0.3) shake = 0;

      // Mây (thị sai)
      for (const c of clouds) {
        const cy = sy(c.y + camY * 0.5);
        const cx = ((c.x + now * 0.01 * c.s) % 1100 + 1100) % 1100 - 550;
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        for (const [dx, dy, r] of [[0, 0, 26], [24, 6, 20], [-24, 6, 18]]) {
          ctx.beginPath(); ctx.arc(W / 2 + (cx + dx) * scale * 0.9, cy + dy * scale, r * scale * c.s, 0, Math.PI * 2); ctx.fill();
        }
      }
      // Nhà phố xa (thị sai, tông nhạt)
      for (let i = -6; i <= 6; i++) {
        const bh = 120 + ((i * 7919) % 5 + 5) % 5 * 60;
        const bx = i * 95;
        const by = sy(camY * 0.6) + 0;
        ctx.fillStyle = `rgba(120,140,200,${0.18 + t * 0.15})`;
        ctx.fillRect(W / 2 + (bx - 38) * scale * 0.8, by - bh * scale * 0.8, 76 * scale * 0.8, bh * scale * 0.8 + H);
      }
      // Mặt đất
      const gy = sy(0);
      ctx.fillStyle = '#8bc96b'; ctx.fillRect(0, gy, W, H);
      ctx.fillStyle = '#6fae52'; ctx.fillRect(0, gy, W, 6 * scale);

      // Toà nhà (rung nhẹ theo độ lệch trọng tâm)
      // Ngọn lắc theo đồng hồ lắc chung (đứng yên khi tầng đang rơi) — đúng như server dùng để chấm
      const hanging = !fall && !st.over && !stoppedRef.current && now >= spawnAt;
      // Đang rơi: giữ nguyên độ lắc lúc thả (toà nhà "đứng chờ" tầng rơi xuống)
      const sway = fall ? fall.sway : swayAt(st, st.t + (hanging ? now - spawnAt : 0)) + swayCorr;
      swayCorr *= 0.88; if (Math.abs(swayCorr) < 0.05) swayCorr = 0;
      shownSway = sway;
      const nShown = st.blocks.length - (fall && fall.kind !== 'miss' ? 1 : 0); // không tính tầng đang rơi
      drawBlock(ctx, sx(0), sy(TW.H), scale, -1, false); // tầng trệt
      st.blocks.forEach((bx, i) => {
        if (fall && fall.kind !== 'miss' && i === st.blocks.length - 1) return; // tầng này đang rơi xuống
        const k = (i + 1) / Math.max(1, nShown); // nền đứng yên, ngọn lắc đủ biên độ
        drawBlock(ctx, sx(bx + sway * k), sy((i + 2) * TW.H), scale, i, false);
      });

      // Cần cẩu + tầng đang treo
      const hookY = topY() + TW.H * HOOK_GAP;
      if (!st.over && !stoppedRef.current) {
        const ready = now >= spawnAt;
        const dt = ready ? now - spawnAt : 0;
        const n = st.blocks.length;
        const hx = fall ? 0 : hangX(seed, n, dt);
        const amp = swingOf(seed, n).amp;
        const ropeTop = sy(hookY + TW.H * 4.5);
        if (!fall && ready) {
          const ang = (hx / amp) * 0.14;
          ctx.strokeStyle = '#4a4e69'; ctx.lineWidth = 3 * scale;
          // Nghiêng quanh TÂM tầng (tâm luôn đúng vị trí x dùng để chấm điểm → thả ra không bị "nhảy")
          const cyMid = sy(hookY + TW.H / 2);
          const half = (TW.H / 2) * scale + 10 * scale;
          const ax = sx(hx) + Math.sin(ang) * half, ay = cyMid - Math.cos(ang) * half; // móc trên đỉnh đã nghiêng
          ctx.beginPath(); ctx.moveTo(sx(0), ropeTop); ctx.lineTo(ax, ay); ctx.stroke();
          ctx.save(); ctx.translate(sx(hx), cyMid); ctx.rotate(ang); ctx.translate(-sx(hx), -cyMid);
          drawBlock(ctx, sx(hx), sy(hookY + TW.H), scale, n, true);
          ctx.restore();
        } else if (!ready) {
          ctx.strokeStyle = '#4a4e69'; ctx.lineWidth = 3 * scale;
          ctx.beginPath(); ctx.moveTo(sx(0), ropeTop); ctx.lineTo(sx(0), sy(hookY + TW.H * 1.8)); ctx.stroke();
        }
      }
      if (fall) {
        ctx.save(); ctx.translate(sx(fall.x), sy(fall.y)); ctx.rotate(fall.rot); ctx.translate(-sx(fall.x), -sy(fall.y));
        drawBlock(ctx, sx(fall.x), sy(fall.y + TW.H), scale, st.blocks.length - (fall.kind === 'miss' ? 0 : 1), false);
        ctx.restore();
      }
      // Chữ nổi
      for (let i = texts.length - 1; i >= 0; i--) {
        const f = texts[i], a = 1 - (now - f.t0) / 1100;
        if (a <= 0) { texts.splice(i, 1); continue; }
        ctx.globalAlpha = a;
        ctx.font = `900 ${Math.round(22 * scale)}px Baloo 2, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 5 * scale; ctx.strokeStyle = 'rgba(40,30,60,.8)'; ctx.fillStyle = f.color;
        const yy = sy(f.y) - (now - f.t0) * 0.04 * scale;
        ctx.strokeText(f.text, sx(f.x), yy); ctx.fillText(f.text, sx(f.x), yy);
        ctx.globalAlpha = 1;
      }
      // ---- Gió ----
      const T = st.t + (hanging ? now - spawnAt : 0);
      const wind = floorsOf(st) >= WIND_FROM ? windAt(seed, T) : 0;
      const dts = Math.min(50, now - lastT) / 1000; lastT = now;
      if (Math.abs(wind) > 0.08) {
        const a = Math.min(1, Math.abs(wind) * 1.4);
        for (const p of streaks) {
          p.x += wind * dts * (0.5 + p.len * 0.6);
          p.y += dts * 0.03 * Math.sin(now / 500 + p.spin);
          if (p.x > 1.1) { p.x = -0.1; p.y = Math.random(); } else if (p.x < -0.1) { p.x = 1.1; p.y = Math.random(); }
          const px = p.x * W, py = p.y * H;
          if (p.leaf) {
            ctx.save(); ctx.globalAlpha = a; ctx.translate(px, py); ctx.rotate(now / 300 + p.spin);
            ctx.fillStyle = p.spin > 3 ? '#8bd17c' : '#ffb3c7';
            ctx.beginPath(); ctx.ellipse(0, 0, 6 * scale, 3 * scale, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          } else {
            ctx.strokeStyle = `rgba(255,255,255,${0.55 * a})`; ctx.lineWidth = 2 * scale; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - Math.sign(wind) * 40 * p.len * scale * a, py); ctx.stroke();
          }
        }
        // chỉ báo gió
        const label = `💨 Gió ${wind < 0 ? '←' : '→'} ${Math.abs(wind) > 0.66 ? 'mạnh' : Math.abs(wind) > 0.33 ? 'vừa' : 'nhẹ'}`;
        ctx.font = `800 ${Math.round(15 * scale)}px Baloo 2, sans-serif`; ctx.textAlign = 'center';
        const tw = ctx.measureText(label).width + 20 * scale;
        ctx.fillStyle = 'rgba(29,47,107,.65)'; roundRect(ctx, W / 2 - tw / 2, H * 0.11, tw, 26 * scale, 13 * scale); ctx.fill();
        ctx.fillStyle = Math.abs(wind) > 0.66 ? '#ffd166' : '#ffffff';
        ctx.fillText(label, W / 2, H * 0.11 + 18 * scale);
      } else if (floorsOf(st) >= WIND_FROM) {
        ctx.font = `800 ${Math.round(13 * scale)}px Baloo 2, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.fillText('🍃 Lặng gió', W / 2, H * 0.11 + 16 * scale);
      }
      if (!st.over && !stoppedRef.current && now < spawnAt - 200) {
        ctx.font = `900 ${Math.round(18 * scale)}px Baloo 2, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        ctx.fillText('Chuẩn bị…', W / 2, H * 0.3);
      }
    }
    raf = requestAnimationFrame(frame);
    push();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); cv.removeEventListener('pointerdown', tap); window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  return <canvas ref={ref} className="tw-canvas" aria-label="Chạm để thả tầng nhà" />;
}

/** Vẽ một tầng nhà pastel: thân, mái hiên, cửa sổ sáng đèn. y = mép trên (toạ độ màn hình). */
function drawBlock(ctx: CanvasRenderingContext2D, cx: number, top: number, s: number, idx: number, hanging: boolean) {
  const w = TW.W * s, h = TW.H * s;
  const x = cx - w / 2;
  const [body, edge] = idx < 0 ? ['#f4e3c1', '#c9a46a'] : PALETTE[((idx % PALETTE.length) + PALETTE.length) % PALETTE.length];
  // bóng
  ctx.fillStyle = 'rgba(0,0,0,.12)'; roundRect(ctx, x + 3 * s, top + 4 * s, w, h, 8 * s); ctx.fill();
  ctx.fillStyle = body; roundRect(ctx, x, top, w, h, 8 * s); ctx.fill();
  ctx.lineWidth = 2.5 * s; ctx.strokeStyle = edge; ctx.stroke();
  // ban công / gờ tầng
  ctx.fillStyle = edge; roundRect(ctx, x - 4 * s, top + h - 9 * s, w + 8 * s, 7 * s, 3 * s); ctx.fill();
  if (idx < 0) {
    // tầng trệt: cửa ra vào
    ctx.fillStyle = '#8a5a3b'; roundRect(ctx, cx - 15 * s, top + h - 48 * s, 30 * s, 39 * s, 6 * s); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(cx + 8 * s, top + h - 28 * s, 2.5 * s, 0, Math.PI * 2); ctx.fill();
  }
  // cửa sổ: khối vuông → 2 hàng × 2 cửa (tầng trệt: hàng dưới là cửa ra vào ở giữa)
  const ww = 26 * s, wh = 28 * s;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      if (idx < 0 && row === 1) continue;
      const wx = x + (w / 4) * (col === 0 ? 1 : 3) - ww / 2, wy = top + 12 * s + row * 46 * s;
      const lit = ((idx * 5 + row * 2 + col) % 4) !== 0;
      ctx.fillStyle = '#fffaf0'; roundRect(ctx, wx - 2 * s, wy - 2 * s, ww + 4 * s, wh + 4 * s, 5 * s); ctx.fill();
      ctx.fillStyle = lit ? '#ffe9a8' : '#a8c8e8'; roundRect(ctx, wx, wy, ww, wh, 4 * s); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(wx + 3 * s, wy + 3 * s, 4 * s, wh - 6 * s);
      ctx.strokeStyle = edge; ctx.lineWidth = 1.5 * s;
      ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
    }
  }
  // gờ giữa hai hàng cửa
  ctx.fillStyle = edge; ctx.globalAlpha = 0.5; ctx.fillRect(x + 6 * s, top + 50 * s, w - 12 * s, 3 * s); ctx.globalAlpha = 1;
  // chậu hoa nhỏ trên gờ
  if (idx >= 0 && idx % 2 === 0) {
    ctx.fillStyle = '#ff7eb6'; ctx.beginPath(); ctx.arc(x + w - 14 * s, top + h - 13 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6fae52'; ctx.fillRect(x + w - 15 * s, top + h - 11 * s, 2 * s, 3 * s);
  }
  if (hanging) {
    // móc cẩu
    ctx.strokeStyle = '#4a4e69'; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.moveTo(cx - 18 * s, top); ctx.lineTo(cx, top - 10 * s); ctx.lineTo(cx + 18 * s, top); ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}

export function towerToast(msg: string) { toast(msg); }
