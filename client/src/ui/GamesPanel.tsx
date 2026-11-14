import { GameChatButton } from './GameChat';
import { useEffect, useState } from 'react';
import { call } from '../net';
import { fmt, set, useStore } from '../store';
import { BC_SYMBOLS } from './BauCuaPanel';

interface Overview {
  now: number;
  baucua: { phase: 'betting' | 'rolling' | 'result'; endsAt: number; players: number; pot: number; last: number[] | null; winners: { name: string; win: number }[] };
  tienlen: { tables: number; playing: number; players: number };
  tower?: { duels: number; waiting: number };
  werewolf?: { playing: number; waiting: number };
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
    // Thưa vừa đủ: đếm giây mỗi 1s, hỏi server mỗi 3s (đỡ tốn pin & mạng trên điện thoại)
    const poll = setInterval(load, 3000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
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

        <div className="gc-grid">
          {/* Bầu cua */}
          <button className="gcard baucua" onClick={() => set({ panel: 'baucua' })}>
            <div className="gc-art">
              <span className="gc-badge hot">🔥 HOT</span>
              <div className="gc-dice">
                {(bc?.last ?? [0, 1, 3]).map((d, i) => (
                  <span key={i} className={`dice ${bc?.phase === 'rolling' ? 'rolling' : ''}`} style={{ animationDelay: `${i * 0.12}s` }}>{BC_SYMBOLS[d].icon}</span>
                ))}
              </div>
            </div>
            <div className="gc-body">
              <div className="gc-name">Bầu Cua Tôm Cá</div>
              <div className="gc-tag">Đặt cửa 6 linh vật, lắc bát liên tục</div>
              <div className="gc-row">
                <span className="gc-live">
                  {!bc ? 'Đang tải…'
                    : bc.phase === 'betting' ? <><span className="live-dot" />Nhận cược · <b>{secs}s</b></>
                    : bc.phase === 'rolling' ? <>🎲 Đang lắc bát…</>
                    : <>✨ Trả thưởng</>}
                </span>
                <span className="gc-chip">👥 {bc?.players ?? 0}</span>
                <span className="gc-chip">💰 {fmt(bc?.pot ?? 0)}</span>
              </div>
              <span className="gc-play">CHƠI NGAY ▶</span>
            </div>
          </button>

          {/* Tiến lên */}
          <button className="gcard tienlen" onClick={() => set({ panel: 'tienlen' })}>
            <div className="gc-art">
              <span className="gc-badge">🤖 CÓ BOT</span>
              <div className="gc-fan">
                {[['A', '♠', false], ['K', '♥', true], ['Q', '♦', true], ['2', '♣', false]].map(([r, su, red], i) => (
                  <span key={i} className={`mini-card ${red ? 'red' : ''}`} style={{ transform: `rotate(${(i - 1.5) * 14}deg) translateY(${Math.abs(i - 1.5) * 5}px)` }}>
                    <b>{r as string}</b><i>{su as string}</i>
                  </span>
                ))}
              </div>
            </div>
            <div className="gc-body">
              <div className="gc-name">Tiến Lên Miền Nam</div>
              <div className="gc-tag">Đánh bài 4 người, thiếu người có bot</div>
              <div className="gc-row">
                <span className="gc-live">{tl && tl.playing > 0 ? <><span className="live-dot" />{tl.playing} ván đang chơi</> : '🃏 Mở bàn ngay'}</span>
                <span className="gc-chip">🪑 {tl?.tables ?? 0} bàn</span>
              </div>
              <span className="gc-play">CHƠI NGAY ▶</span>
            </div>
          </button>

          {/* Xây nhà cao tầng */}
          <button className="gcard tower" onClick={() => set({ panel: 'tower' })}>
            <div className="gc-art">
              <span className="gc-badge new">✨ MỚI</span>
              <div className="gc-tower">
                <i className="gc-block b4 swing" /><i className="gc-block b3" /><i className="gc-block b2" /><i className="gc-block b1" />
              </div>
            </div>
            <div className="gc-body">
              <div className="gc-name">Xây Nhà Cao Tầng</div>
              <div className="gc-tag">Thả khối thật chuẩn, xây thật cao</div>
              <div className="gc-row">
                <span className="gc-live">{ov?.tower && ov.tower.duels > 0 ? <><span className="live-dot" />{ov.tower.duels} trận solo</> : '🏆 Xếp hạng'}</span>
                <span className="gc-chip">⚔️ {ov?.tower?.waiting ?? 0} phòng chờ</span>
              </div>
              <span className="gc-play">CHƠI NGAY ▶</span>
            </div>
          </button>

          {/* Ma Sói */}
          <button className="gcard werewolf" onClick={() => set({ panel: 'werewolf' })}>
            <div className="gc-art">
              <span className="gc-badge new">✨ MỚI</span>
              <div className="gc-ww"><span className="moon" /><span className="wolf">🐺</span></div>
            </div>
            <div className="gc-body">
              <div className="gc-name">Ma Sói</div>
              <div className="gc-tag">Giấu vai, đoán sói, nói chuyện bằng mic</div>
              <div className="gc-row">
                <span className="gc-live">{ov?.werewolf && ov.werewolf.playing > 0 ? <><span className="live-dot" />{ov.werewolf.playing} làng đang chơi</> : '🏘️ Mở làng ngay'}</span>
                <span className="gc-chip">👥 5–10</span>
              </div>
              <span className="gc-play">CHƠI NGAY ▶</span>
            </div>
          </button>
        </div>
        <p className="arcade-note">🔜 Sắp ra mắt: Cờ Caro · Chỉ dùng xu ảo trong game, không nạp, không đổi ra tiền thật</p>
      </div>
    </div>
  );
}
