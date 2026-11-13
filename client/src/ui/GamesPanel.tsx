import { GameChatButton } from './GameChat';
import { useEffect, useState } from 'react';
import { call } from '../net';
import { fmt, set, useStore } from '../store';
import { BC_SYMBOLS } from './BauCuaPanel';

interface Overview {
  now: number;
  baucua: { phase: 'betting' | 'rolling' | 'result'; endsAt: number; players: number; pot: number; last: number[] | null; winners: { name: string; win: number }[] };
  tienlen: { tables: number; playing: number; players: number };
}

/** Sảnh "Khu giải trí": thông tin trực tiếp từng trò, chọn trò để chơi. */
export function GamesPanel() {
  const coins = useStore((s) => s.me?.coins ?? 0);
  const [ov, setOv] = useState<Overview | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const load = () => call('games:overview', {}, { silent: true }).then((r) => {
      if (!r.ok) return;
      setOv(r as unknown as Overview);
      setOffset(r.now - Date.now());
    });
    load();
    const poll = setInterval(load, 2000);
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, []);

  const close = () => set({ panel: null });
  const bc = ov?.baucua;
  const tl = ov?.tienlen;
  const secs = bc ? Math.max(0, Math.ceil((bc.endsAt - (now + offset)) / 1000)) : 0;
  const winners = bc?.winners ?? [];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="arcade">
        <div className="arcade-bulbs" aria-hidden>{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ animationDelay: `${(i % 4) * 0.25}s` }} />)}</div>
        <div className="arcade-head">
          <h2 className="neon">🎪 KHU GIẢI TRÍ</h2>
          <GameChatButton />
          <span className="arcade-coins">💰 {fmt(coins)} xu</span>
          <button className="icon-btn arcade-close" onClick={close} aria-label="Đóng">✕</button>
        </div>

        <div className="ticker">
          <div className="ticker-track">
            {(winners.length ? winners : [{ name: 'Xóm Vui', win: 0 }]).concat(winners.length ? winners : []).map((w, i) => (
              <span key={i}>{w.win ? <>🏆 <b>{w.name}</b> vừa thắng <b className="gold">+{fmt(w.win)} xu</b></> : '🎉 Chào mừng tới Khu giải trí — thử vận may nào!'}</span>
            ))}
          </div>
        </div>

        <div className="arcade-grid">
          {/* Bầu cua */}
          <button className="game-tile baucua" onClick={() => set({ panel: 'baucua' })}>
            <span className="ribbon hot">HOT</span>
            <div className="tile-art">
              {(bc?.last ?? [0, 1, 3]).map((d, i) => (
                <span key={i} className={`dice ${bc?.phase === 'rolling' ? 'rolling' : ''}`} style={{ animationDelay: `${i * 0.12}s` }}>{BC_SYMBOLS[d].icon}</span>
              ))}
            </div>
            <div className="tile-name">Bầu Cua Tôm Cá</div>
            <div className="tile-live">
              {!bc ? 'Đang tải…'
                : bc.phase === 'betting' ? <><span className="live-dot" />Đang nhận cược · <b>{secs}s</b></>
                : bc.phase === 'rolling' ? <>🎲 Đang lắc bát…</>
                : <>✨ Đang trả thưởng</>}
            </div>
            <div className="tile-stats">
              <span>👥 {bc?.players ?? 0} người cược</span>
              <span>💰 {fmt(bc?.pot ?? 0)} xu trên bàn</span>
            </div>
            <span className="play-btn">CHƠI NGAY ▶</span>
          </button>

          {/* Tiến lên */}
          <button className="game-tile tienlen" onClick={() => set({ panel: 'tienlen' })}>
            <span className="ribbon new">BOT</span>
            <div className="tile-art fan">
              {[['A', '♠', false], ['K', '♥', true], ['Q', '♦', true], ['2', '♣', false]].map(([r, s, red], i) => (
                <span key={i} className={`mini-card ${red ? 'red' : ''}`} style={{ transform: `rotate(${(i - 1.5) * 14}deg) translateY(${Math.abs(i - 1.5) * 5}px)` }}>
                  <b>{r as string}</b><i>{s as string}</i>
                </span>
              ))}
            </div>
            <div className="tile-name">Tiến Lên Miền Nam</div>
            <div className="tile-live">
              {tl && tl.playing > 0 ? <><span className="live-dot" />{tl.playing} ván đang diễn ra</> : '🃏 Mở bàn, có bot chơi cùng'}
            </div>
            <div className="tile-stats">
              <span>🪑 {tl?.tables ?? 0} bàn đang mở</span>
              <span>👥 {tl?.players ?? 0} người chơi</span>
            </div>
            <span className="play-btn">CHƠI NGAY ▶</span>
          </button>

          {[['🀄', 'Phỏm'], ['⭕', 'Cờ Caro']].map(([icon, name]) => (
            <div key={name} className="game-tile soon">
              <span className="ribbon soon">SẮP RA MẮT</span>
              <div className="tile-art"><span className="soon-icon">{icon}</span></div>
              <div className="tile-name">{name}</div>
              <div className="tile-live">🔒 Đang xây dựng</div>
              <span className="play-btn locked">SẮP CÓ</span>
            </div>
          ))}
        </div>
        <p className="arcade-note">Chỉ dùng xu ảo trong game · không nạp, không đổi ra tiền thật</p>
      </div>
    </div>
  );
}
