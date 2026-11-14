import { FormEvent, useEffect, useRef, useState } from 'react';
import { ANIMALS, CROPS, ECON, MAX_PLOTS } from '../../../shared/catalog';
import { animalRemainMs, canWater, plotStage } from '../game/farmUtil';
import { logout, send, travel } from '../net';
import { fmt, get, Panel, set, toast, useStore } from '../store';
import { AvatarPreview, Coin, Modal, PanelBoundary } from './common';
import { ShopPanel } from './ShopPanel';
import { WardrobePanel } from './Wardrobe';
import { BoutiquePanel } from './StorePanels';
import { QuestPanel, questClaimable } from './QuestPanel';
import { ExpandPanel } from './ExpandPanel';
import { WorkshopPanel } from './WorkshopPanel';
import { loadOrders, OrdersPanel } from './OrdersPanel';
import { FriendsPanel, InventoryPanel, PlayerCard } from './SocialPanels';
import { BauCuaPanel } from './BauCuaPanel';
import { TienLenPanel } from './TienLenPanel';
import { GamesPanel } from './GamesPanel';
import { keepFocus, MessengerPanel } from './MessengerPanel';
import { BusStopPanel } from './BusStopPanel';
import { GameChatDrawer } from './GameChat';
import { JailBanner, NewsTicker, ResidentsPanel } from './CommunityPanel';
import { GiftDialog } from './GiftDialog';
import { TowerPanel } from './TowerPanel';
import { WerewolfInvite, WerewolfPanel } from './WerewolfPanel';
import { audioPrefs, onAudioPrefs, toggleMusic, toggleSfx } from '../sound';

export function HUD() {
  const panel = useStore((s) => s.panel);
  const playerCard = useStore((s) => s.playerCard);
  const gift = useStore((s) => s.gift);
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
      <JailBanner />
      <WerewolfInvite />
      <Toasts />
      <ConnectionBanner />
      <PanelBoundary key={panel ?? 'none'} onClose={() => set({ panel: null })}>
      {panel === 'shop' && <ShopPanel />}
      {panel === 'wardrobe' && <WardrobePanel />}
      {panel === 'boutique' && <BoutiquePanel />}
      {panel === 'quests' && <QuestPanel />}
      {panel === 'expand' && <ExpandPanel />}
      {panel === 'workshop' && <WorkshopPanel />}
      {panel === 'orders' && <OrdersPanel />}
      {(panel === 'kho' || panel === 'inventory') && <InventoryPanel tab="kho" />}
      {panel === 'tui' && <InventoryPanel tab="tui" />}
      {panel === 'residents' && <ResidentsPanel />}
      {panel === 'friends' && <FriendsPanel />}
      {panel === 'messages' && <MessengerPanel />}
      {panel === 'map' && <BusStopPanel title="🗺️ Bản đồ Xóm Vui" />}
      {panel === 'games' && <GamesPanel />}
      {panel === 'bus' && <BusStopPanel />}
      {panel === 'baucua' && <BauCuaPanel />}
      {panel === 'tienlen' && <TienLenPanel />}
      {panel === 'tower' && <TowerPanel />}
      {panel === 'werewolf' && <WerewolfPanel />}
      </PanelBoundary>
      {(panel === 'games' || panel === 'baucua' || panel === 'tienlen' || panel === 'tower' || panel === 'werewolf') && <GameChatDrawer />}
      {playerCard != null && <PlayerCard />}
      {gift && <GiftDialog />}
      <ConfirmBox />
    </div>
  );
}

/** Thanh thông tin khi đang ở nông trại người khác. */
function VisitBar() {
  const zone = useStore((s) => s.zone)!;
  const farm = useStore((s) => s.farm);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  let steal = 0, water = 0;
  for (const pl of farm?.plots ?? []) {
    if (!pl.crop) continue;
    if (plotStage(pl) === 3) {
      if (pl.yieldLeft > 0) steal++;
    } else if (canWater(pl)) water++;
  }
  // Chuồng: sản phẩm vật nuôi lấy trộm được
  for (const an of farm?.animals ?? []) {
    const def = ANIMALS[an.type];
    if (animalRemainMs(an) === 0 && (an.left ?? def.qty) > 0) steal++;
  }
  return (
    <div className="farm-toolbar farm-visit" role="region" aria-label="Thăm nông trại">
      <span className="visit-title" title={`Đang thăm nông trại của ${zone.ownerName}`}>👀 <b>{zone.ownerName}</b></span>
      <span className={steal ? 'visit-chip hot' : 'visit-chip'} title="Số ô/chuồng có thể hái trộm">🖐️ <b>{steal}</b></span>
      <span className="visit-chip" title="Số ô cần tưới giúp (+5 xu mỗi lần)">💧 <b>{water}</b></span>
      <button className="btn small primary visit-home" onClick={() => travel('myfarm')} aria-label="Về nông trại">🏡 Về nhà</button>
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
      {/* Bảng tin chạy chữ: nằm giữa hàng trên cùng */}
      <div className="topbar-mid"><NewsTicker /></div>
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
    ['kho', '🏚️', 'Kho', '#d4a373'],
    ['tui', '🎒', 'Túi đồ', '#ff9f43'],
    ['messages', '💬', 'Tin nhắn', '#38bdf8'],
    ['friends', '👥', 'Bạn bè', '#a78bfa'],
    ['residents', '🏘️', 'Cư dân', '#f4845f'],
    ['quests', '📜', 'Nhiệm vụ', '#f9c74f'],
  ];
  const newsUnread = useStore((s) => s.newsUnread);
  const questReady = useStore((s) => questClaimable(s.quests));
  const badgeOf = (k: Panel | 'farm') => (k === 'friends' ? incoming : k === 'messages' ? unreadTotal : k === 'residents' ? newsUnread : k === 'quests' ? questReady : 0);
  return (
    <div className={`world-menu ${expanded ? 'expanded' : ''}`}>
      <button className="menu-toggle" aria-label="Menu trò chơi" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span aria-hidden="true">{expanded ? '✕' : '☰'}</span>
        {incoming + unreadTotal + newsUnread + questReady > 0 && !expanded && <span className="badge">{incoming + unreadTotal + newsUnread + questReady}</span>}
      </button>
      <div className="menu-buttons">
      {btns.map(([k, icon, label, color]) => (
        <button key={label} className="menu-btn" style={{ ['--c' as string]: color }} onClick={() => {
          if (k === 'farm') travel('myfarm');
          else set(k === 'residents' ? { panel: k, resTab: 'list' } : { panel: k });
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
  // 🌏 Cộng đồng: cả server thấy (khung chat) · 📍 Tại chỗ: chỉ là bong bóng trên đầu nhân vật, người cùng khu thấy
  const [scope, setScope] = useState<'world' | 'local'>(() => {
    try { return localStorage.getItem('xv_chat_scope') === 'local' ? 'local' : 'world'; } catch { return 'world'; }
  });
  const pickScope = (v: 'world' | 'local') => { setScope(v); try { localStorage.setItem('xv_chat_scope', v); } catch { /* bỏ qua */ } };

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [chat, open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    send('chat', { text: t, scope });
    setText('');
  }

  const EMOTES = ['😀', '😂', '😍', '😎', '😭', '😡', '👍', '❤️', '🎉', '👋'];
  const [showEmo, setShowEmo] = useState(false);

  return (
    <div className={`chatbox ${open ? 'open' : 'closed'}`}>
      <button className="chat-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '▾ Thu gọn' : '💬 Trò chuyện'}</button>
      {open && (
        <>
          <div className="chat-log" ref={logRef}>
            {chat.filter((m) => m.scope !== 'local').map((m) => (
              <div key={m.id} className={`chat-line ${m.kind}`}>{m.name && <b>{m.name}: </b>}{m.text}</div>
            ))}
            {scope === 'local' && <div className="chat-line system chat-local-hint">📍 Tin Tại chỗ chỉ hiện thành bong bóng trên đầu nhân vật — người đang ở cùng khu mới thấy.</div>}
          </div>
          {showEmo && (
            <div className="emotes">
              {EMOTES.map((e) => <button key={e} onClick={() => { send('chat', { text: e, scope }); setShowEmo(false); }}>{e}</button>)}
            </div>
          )}
          <div className="chat-scope" role="tablist" aria-label="Phạm vi chat">
            <button type="button" role="tab" aria-selected={scope === 'world'} className={scope === 'world' ? 'on' : ''} onClick={() => pickScope('world')}>🌏 Cộng đồng</button>
            <button type="button" role="tab" aria-selected={scope === 'local'} className={scope === 'local' ? 'on' : ''} onClick={() => pickScope('local')}>📍 Tại chỗ</button>
          </div>
          <form className="chat-input" onSubmit={submit}>
            <button type="button" className="emo-btn" onClick={() => setShowEmo(!showEmo)}>😊</button>
            <input ref={inputRef} value={text} maxLength={120} onChange={(e) => setText(e.target.value)} placeholder={scope === 'world' ? 'Nói với cả xóm...' : 'Nói trên đầu nhân vật...'}
              onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); }} />
            <button className="btn small primary" onPointerDown={keepFocus} onMouseDown={keepFocus}>Gửi</button>
          </form>
        </>
      )}
    </div>
  );
}

function FarmToolbar() {
  useStore((s) => s.catalogVer); // vẽ lại khi bảng giá đổi
  const tool = useStore((s) => s.farmTool);
  const inv = useStore((s) => s.me!.inventory);
  const level = useStore((s) => s.me!.level);
  const seeds = Object.values(CROPS).filter((c) => (inv[`seed:${c.id}`] ?? 0) > 0);
  const plotCount = useStore((s) => s.farm?.plots.length ?? 0);
  // Tải bảng đơn hàng khi về nông trại của mình (và mỗi phút một lần)
  useEffect(() => { loadOrders(); const t = setInterval(loadOrders, 60_000); return () => clearInterval(t); }, []);
  return (
    <div className="farm-toolbar" role="region" aria-label="Công cụ nông trại">
      <div className="farm-tools" role="group" aria-label="Công cụ nông trại">
        {/* Chế độ chạm */}
        <button className={`tool ${tool === 'auto' ? 'active' : ''}`} aria-pressed={tool === 'auto'} onClick={() => set({ farmTool: 'auto' })} title="Tưới / thu hoạch">
          <span>🖐️</span><small>Chăm cây</small>
        </button>
        <button className={`tool mode-up ${tool === 'upgrade' ? 'active' : ''}`} aria-pressed={tool === 'upgrade'} onClick={() => set({ farmTool: tool === 'upgrade' ? 'auto' : 'upgrade' })}
          title="Nâng cấp ô đất hoặc vật nuôi">
          <span>✨</span><small>Nâng cấp</small>
        </button>
        <i className="tool-sep" aria-hidden />
        {/* Hạt giống */}
        {seeds.map((c) => (
          <button key={c.id} className={`tool ${tool === `seed:${c.id}` ? 'active' : ''}`} aria-label={`Gieo ${c.name}, còn ${inv[`seed:${c.id}`]} hạt`} aria-pressed={tool === `seed:${c.id}`} onClick={() => set({ farmTool: `seed:${c.id}` })} title={`Gieo ${c.name}`}>
            <span>{c.icon}</span><small>{c.name}</small><b className="seed-count">{inv[`seed:${c.id}`]}</b>
          </button>
        ))}
      </div>
      <span className="tool-hint" role="status">{tool === 'upgrade' ? `Chạm con vật để nâng cấp ⭐ (thêm sản phẩm, ra nhanh hơn) · ${plotCount < MAX_PLOTS ? `Nâng đất cần mở hết ${MAX_PLOTS} ô (đang có ${plotCount})` : `chạm ô đất để thành ✨ Đất màu mỡ ×${String(ECON.plotUpgradeMult).replace('.', ',')} · ${fmt(ECON.plotUpgradePrice)} xu`}` : tool.startsWith('seed:') ? `Gieo ${CROPS[tool.slice(5)]?.name} · Chạm ô đất trống` : seeds.length ? 'Chạm cây để tưới nước hoặc thu hoạch' : `Hết hạt giống · Ghé cửa hàng để mua thêm · Lv${level}`}</span>
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
