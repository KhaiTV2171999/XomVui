import { FormEvent, useEffect, useRef, useState } from 'react';
import { ANIMALS, CROPS, stealFloor } from '../../../shared/catalog';
import { animalRemainMs, canWater, plotStage } from '../game/farmUtil';
import { call, logout, send, travel } from '../net';
import { fmt, get, Panel, set, toast, useStore } from '../store';
import { AvatarPreview, Coin, Modal, PanelBoundary } from './common';
import { ShopPanel } from './ShopPanel';
import { WardrobePanel } from './Wardrobe';
import { FriendsPanel, InventoryPanel, PlayerCard } from './SocialPanels';
import { BauCuaPanel } from './BauCuaPanel';
import { TienLenPanel } from './TienLenPanel';
import { GamesPanel } from './GamesPanel';
import { MessengerPanel } from './MessengerPanel';
import { BusStopPanel } from './BusStopPanel';
import { audioPrefs, onAudioPrefs, toggleMusic, toggleSfx } from '../sound';

export function HUD() {
  const panel = useStore((s) => s.panel);
  const playerCard = useStore((s) => s.playerCard);
  const zone = useStore((s) => s.zone);
  const traveling = useStore((s) => s.traveling);
  return (
    <div className={`hud ${zone?.kind === 'farm' ? 'hud-farm' : ''}`}>
      <TopBar />
      <ChatBox />
      <MenuButtons />
      {!traveling && zone?.kind === 'farm' && zone.ownerId === get().me?.id && <FarmToolbar />}
      {!traveling && zone?.kind === 'farm' && zone.ownerId !== get().me?.id && (
        <VisitBar />
      )}
      <Toasts />
      <ConnectionBanner />
      <PanelBoundary key={panel ?? 'none'} onClose={() => set({ panel: null })}>
      {panel === 'shop' && <ShopPanel />}
      {panel === 'wardrobe' && <WardrobePanel />}
      {panel === 'inventory' && <InventoryPanel />}
      {panel === 'friends' && <FriendsPanel />}
      {panel === 'messages' && <MessengerPanel />}
      {panel === 'map' && <BusStopPanel title="🗺️ Bản đồ Xóm Vui" />}
      {panel === 'games' && <GamesPanel />}
      {panel === 'bus' && <BusStopPanel />}
      {panel === 'baucua' && <BauCuaPanel />}
      {panel === 'tienlen' && <TienLenPanel />}
      </PanelBoundary>
      {playerCard != null && <PlayerCard />}
      <ConfirmBox />
    </div>
  );
}

/** Thanh thông tin khi đang ở nông trại người khác. */
function VisitBar() {
  const zone = useStore((s) => s.zone)!;
  const farm = useStore((s) => s.farm);
  const meId = useStore((s) => s.me?.id ?? -1);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  let steal = 0, water = 0;
  for (const pl of farm?.plots ?? []) {
    if (!pl.crop) continue;
    const c = CROPS[pl.crop];
    if (plotStage(pl) === 3) {
      if (!pl.stolenBy.includes(meId) && pl.yieldLeft > stealFloor(c.yield)) steal++;
    } else if (canWater(pl)) water++;
  }
  // Chuồng: sản phẩm vật nuôi lấy trộm được
  for (const an of farm?.animals ?? []) {
    const def = ANIMALS[an.type];
    if (animalRemainMs(an) === 0 && !(an.stolenBy ?? []).includes(meId) && (an.left ?? def.qty) > stealFloor(def.qty)) steal++;
  }
  return (
    <div className="farm-visit">
      <span className="visit-title">👀 Đang thăm nông trại của <b>{zone.ownerName}</b></span>
      <span className={steal ? 'visit-chip hot' : 'visit-chip'}>🖐️ Hái trộm được: <b>{steal}</b></span>
      <span className="visit-chip">💧 Tưới giúp: <b>{water}</b> <small>(+5 xu/lần)</small></span>
      <button className="btn small primary" onClick={() => travel('myfarm')}>🏡 Về nông trại</button>
    </div>
  );
}

function TopBar() {
  const me = useStore((s) => s.me)!;
  const zone = useStore((s) => s.zone);
  const pct = Math.min(100, (me.xp / me.xpNext) * 100);
  return (
    <div className="topbar">
      <div className="me-card" title="Bấm để thay đồ" onClick={() => set({ panel: 'wardrobe' })}>
        <div className="me-ava-wrap">
          <div className="me-avatar"><AvatarPreview appearance={me.appearance} size={58} /></div>
          <span className="me-lv" title={`Cấp ${me.level}`}>{me.level}</span>
        </div>
        <div className="me-info">
          <div className="me-name">{me.name}</div>
          <div className="xp"><div className="xp-fill" style={{ width: `${pct}%` }} /><span>{me.xp}/{me.xpNext} XP</span></div>
        </div>
      </div>
      <div className="top-right">
        {zone && <div className="zone-name">📍 {zone.name}</div>}
        <CoinWithDelta n={me.coins} />
        <SettingsMenu />
      </div>
    </div>
  );
}

/** Số xu + hiệu ứng "+50" / "-20" bay lên khi xu thay đổi. */
function CoinWithDelta({ n }: { n: number }) {
  const prev = useRef(n);
  const [floats, setFloats] = useState<{ id: number; d: number }[]>([]);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const d = n - prev.current;
    prev.current = n;
    if (!d) return;
    const id = Date.now() + Math.random();
    setFloats((f) => [...f.slice(-3), { id, d }]);
    setPulse(true);
    const t1 = setTimeout(() => setPulse(false), 300);
    const t2 = setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [n]);
  return (
    <div className={`coin-wrap ${pulse ? 'pulse' : ''}`}>
      <Coin n={n} />
      {floats.map((f) => (
        <span key={f.id} className={`coin-float ${f.d > 0 ? 'up' : 'down'}`}>{f.d > 0 ? '+' : ''}{fmt(f.d)}</span>
      ))}
    </div>
  );
}

/**
 * Bật toàn màn hình rồi khoá hướng ngang (Android Chrome hỗ trợ; iPhone Safari không cho khoá hướng).
 * Phải gọi từ một cú bấm của người dùng.
 */
async function fullscreenLandscape() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  try {
    if (!document.fullscreenElement) await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
  } catch { /* trình duyệt không cho toàn màn hình */ }
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  try {
    if (!orientation?.lock) throw new Error('unsupported');
    await orientation.lock('landscape');
  } catch {
    toast('Máy không cho tự xoay ngang: hãy tắt khoá xoay màn hình rồi xoay ngang điện thoại', 'info');
  }
}

/** Nút ⚙️: gom nhạc nền, âm thanh và đăng xuất vào một menu nhỏ. */
function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => onAudioPrefs(() => force((x) => x + 1)), []);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [open]);
  return (
    <div className="settings" ref={ref}>
      <button className="icon-btn light" title="Cài đặt" aria-expanded={open} onClick={() => setOpen(!open)}>⚙️</button>
      {open && (
        <div className="settings-pop">
          <button onClick={toggleMusic}><span>{audioPrefs.music ? '🎵' : '🔇'}</span>Nhạc nền<b>{audioPrefs.music ? 'Bật' : 'Tắt'}</b></button>
          <button onClick={toggleSfx}><span>{audioPrefs.sfx ? '🔊' : '🔈'}</span>Âm thanh<b>{audioPrefs.sfx ? 'Bật' : 'Tắt'}</b></button>
          <button onClick={() => { setOpen(false); void fullscreenLandscape(); }}><span>📱</span>Toàn màn hình + xoay ngang</button>
          <button className="danger" onClick={logout}><span>⎋</span>Đăng xuất</button>
        </div>
      )}
    </div>
  );
}

function MenuButtons() {
  const incoming = useStore((s) => s.friends.incoming.length);
  const unreadTotal = useStore((s) => Object.values(s.unread).reduce((a, b) => a + b, 0));
  const [expanded, setExpanded] = useState(false);
  const zone = useStore((s) => s.zone);
  const meId = useStore((s) => s.me?.id);
  const onMyFarm = zone?.zone === `farm:${meId}`;
  // Menu thay đổi theo khu: cửa hàng nông trại chỉ có ở nông trại của mình.
  // [panel, icon, nhãn, màu nút]
  const btns: [Panel | 'farm', string, string, string][] = [
    ['map', '🗺️', 'Bản đồ', '#4cc9f0'],
    ...(onMyFarm
      ? [['shop', '🌱', 'Cửa hàng', '#80c35a'] as [Panel, string, string, string]]
      : [['farm', '🏡', 'Về nông trại', '#80c35a'] as ['farm', string, string, string]]),
    ['inventory', '🎒', 'Túi đồ', '#ff9f43'],
    ['messages', '💬', 'Tin nhắn', '#38bdf8'],
    ['friends', '👥', 'Bạn bè', '#a78bfa'],
  ];
  const badgeOf = (k: Panel | 'farm') => (k === 'friends' ? incoming : k === 'messages' ? unreadTotal : 0);
  return (
    <div className={`world-menu ${expanded ? 'expanded' : ''}`}>
      <button className="menu-toggle" aria-label="Menu trò chơi" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span aria-hidden="true">{expanded ? '✕' : '☰'}</span>
        {incoming + unreadTotal > 0 && !expanded && <span className="badge">{incoming + unreadTotal}</span>}
      </button>
      <div className="menu-buttons">
      {btns.map(([k, icon, label, color]) => (
        <button key={label} className="menu-btn" style={{ ['--c' as string]: color }} onClick={() => {
          if (k === 'farm') travel('myfarm');
          else set({ panel: k });
          setExpanded(false);
        }}>
          <span className="menu-icon">{icon}</span>
          <span className="menu-label">{label}</span>
          {badgeOf(k) > 0 && <span className="badge">{badgeOf(k)}</span>}
        </button>
      ))}
      </div>
    </div>
  );
}

function ChatBox() {
  const chat = useStore((s) => s.chat);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [chat, open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    send('chat', { text: t });
    setText('');
  }

  const EMOTES = ['😀', '😂', '😍', '😎', '😭', '😡', '👍', '❤️', '🎉', '👋'];
  const [showEmo, setShowEmo] = useState(false);

  return (
    <div className={`chatbox ${open ? 'open' : 'closed'}`}>
      <button className="chat-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '▾ Thu gọn' : '💬 Chat cộng đồng'}</button>
      {open && (
        <>
          <div className="chat-log" ref={logRef}>
            {chat.map((m) => (
              <div key={m.id} className={`chat-line ${m.kind}`}>
                {m.name && <b>{m.name}: </b>}{m.text}
              </div>
            ))}
          </div>
          {showEmo && (
            <div className="emotes">
              {EMOTES.map((e) => <button key={e} onClick={() => { send('chat', { text: e }); setShowEmo(false); }}>{e}</button>)}
            </div>
          )}
          <form className="chat-input" onSubmit={submit}>
            <button type="button" className="emo-btn" onClick={() => setShowEmo(!showEmo)}>😊</button>
            <input ref={inputRef} value={text} maxLength={120} onChange={(e) => setText(e.target.value)} placeholder="Nói gì đó với mọi người..."
              onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); }} />
            <button className="btn small primary">Gửi</button>
          </form>
        </>
      )}
    </div>
  );
}

function FarmToolbar() {
  const tool = useStore((s) => s.farmTool);
  const inv = useStore((s) => s.me!.inventory);
  const level = useStore((s) => s.me!.level);
  const seeds = Object.values(CROPS).filter((c) => (inv[`seed:${c.id}`] ?? 0) > 0);
  return (
    <div className="farm-toolbar" role="region" aria-label="Công cụ nông trại">
      <div className="farm-tools" role="group" aria-label="Chọn công cụ hoặc hạt giống">
      <button className={`tool ${tool === 'auto' ? 'active' : ''}`} aria-pressed={tool === 'auto'} onClick={() => set({ farmTool: 'auto' })} title="Tưới / thu hoạch">
        <span>🖐️</span><small>Chăm cây</small>
      </button>
      {seeds.map((c) => (
        <button key={c.id} className={`tool ${tool === `seed:${c.id}` ? 'active' : ''}`} aria-label={`Gieo ${c.name}, còn ${inv[`seed:${c.id}`]} hạt`} aria-pressed={tool === `seed:${c.id}`} onClick={() => set({ farmTool: `seed:${c.id}` })} title={`Gieo ${c.name}`}>
          <span>{c.icon}</span><small>{c.name}</small><b className="seed-count">{inv[`seed:${c.id}`]}</b>
        </button>
      ))}
      <button className="tool" onClick={() => set({ panel: 'shop', shopTab: 'seed' })} title="Mua hạt giống">
        <span>＋</span><small>Mua hạt</small>
      </button>
      </div>
      <span className="tool-hint" role="status">{tool.startsWith('seed:') ? `Gieo ${CROPS[tool.slice(5)]?.name} · Chạm ô đất trống` : seeds.length ? 'Chạm cây để tưới nước hoặc thu hoạch' : `Hết hạt giống · Ghé cửa hàng để mua thêm · Lv${level}`}</span>
    </div>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}
    </div>
  );
}

function ConfirmBox() {
  const c = useStore((s) => s.confirm);
  if (!c) return null;
  const close = () => set({ confirm: null });
  return (
    <Modal title="Xác nhận" onClose={close} className="confirm">
      <p>{c.text}</p>
      <div className="confirm-actions">
        <button className="btn" onClick={close}>Huỷ</button>
        <button className="btn primary" onClick={() => { close(); c.onYes(); }}>Đồng ý</button>
      </div>
    </Modal>
  );
}

function ConnectionBanner() {
  const connected = useStore((s) => s.connected);
  if (connected) return null;
  return <div className="conn-banner">Đang kết nối lại máy chủ...</div>;
}

export { fmt };
