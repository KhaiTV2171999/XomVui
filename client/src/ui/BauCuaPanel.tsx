import { GameChatButton, SayBubble } from './GameChat';
import { memo, useEffect, useRef, useState } from 'react';
import { bus, call, send } from '../net';
import { fmt, set, toast, useStore } from '../store';
import { AvatarPreview, Modal } from './common';
import type { Appearance } from '../../../shared/catalog';
import { sfx } from '../sound';

export const BC_SYMBOLS = [
  { name: 'Bầu', icon: '🍐', color: '#c7f9cc' },
  { name: 'Cua', icon: '🦀', color: '#ffd6d6' },
  { name: 'Tôm', icon: '🦐', color: '#ffe5d0' },
  { name: 'Cá', icon: '🐟', color: '#d0ebff' },
  { name: 'Gà', icon: '🐓', color: '#fff3bf' },
  { name: 'Nai', icon: '🦌', color: '#e9d8c4' },
];

interface BcState {
  round: number; phase: 'betting' | 'rolling' | 'result'; endsAt: number; now: number;
  totals: number[]; dice: number[] | null; history: number[][]; viewers: number; players: number;
  lastWinners: { name: string; win: number }[];
  seated?: { id: number; name: string; appearance: Appearance; bet: number }[];
}

export function BauCuaPanel() {
  const coins = useStore((s) => s.me?.coins ?? 0);
  const meId = useStore((s) => s.me?.id);
  const [st, setSt] = useState<BcState | null>(null);
  const [myBets, setMyBets] = useState([0, 0, 0, 0, 0, 0]);
  const [chips, setChips] = useState<number[]>([10, 50, 100, 500, 1000, 5000]);
  const [chip, setChip] = useState(100);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<{ win: number; net: number } | null>(null);
  const roundRef = useRef(0);
  const pendingRef = useRef(0);

  useEffect(() => {
    const apply = (s: BcState) => {
      setOffset(s.now - Date.now());
      if (s.round !== roundRef.current) {
        roundRef.current = s.round;
        if (s.phase === 'betting') { setMyBets([0, 0, 0, 0, 0, 0]); setResult(null); }
      }
      setSt(s);
    };
    call('bc:join').then((r) => {
      if (!r.ok) return;
      roundRef.current = r.state.round;
      apply(r.state);
      setMyBets(r.myBets);
      setChips(r.chips);
    });
    const off1 = bus.on('bc:state', apply);
    const off2 = bus.on('bc:result', (r: { win: number; net: number }) => {
      setResult(r);
      if (r.net > 0) sfx('win'); else if (r.net < 0) sfx('lose');
      if (r.net > 0) toast(`🎉 Bầu cua: bạn thắng +${fmt(r.net)} xu`, 'success');
      else if (r.net < 0) toast(`Bầu cua: bạn thua ${fmt(-r.net)} xu`, 'error');
    });
    return () => { off1(); off2(); send('bc:leave'); };
  }, []);

  if (!st) return <Modal title="🎲 Bầu Cua Tôm Cá" onClose={() => set({ panel: null })}><p>Đang vào bàn...</p></Modal>;

  const betting = st.phase === 'betting';
  const myTotal = myBets.reduce((a, b) => a + b, 0);
  const hits = st.dice && st.phase === 'result' ? st.dice : [];

  // Đặt cược hiện ngay (không chờ server); server từ chối thì hoàn lại.
  async function bet(i: number) {
    if (!betting || chip > coins) return;
    const amount = chip;
    setMyBets((b) => b.map((v, k) => (k === i ? v + amount : v)));
    pendingRef.current++;
    const r = await call('bc:bet', { symbol: i, amount });
    pendingRef.current--;
    if (!r.ok) setMyBets((b) => b.map((v, k) => (k === i ? Math.max(0, v - amount) : v)));
    // Chạm liên tục: chỉ lấy số của server khi không còn lượt cược nào đang chờ (tránh số nhảy lùi)
    else if (pendingRef.current === 0) setMyBets(r.myBets);
  }
  async function clear() {
    const r = await call('bc:clear');
    if (r.ok) setMyBets(r.myBets);
  }

  const pot = st.totals.reduce((a, b) => a + b, 0);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) set({ panel: null }); }}>
      <div className="arcade velvet">
        <div className="arcade-head">
          <button className="btn small felt-back" onClick={() => set({ panel: 'games' })} aria-label="Về Khu giải trí">←<span className="back-label"> Khu giải trí</span></button>
          <h2 className="neon">🎲 BẦU CUA TÔM CÁ</h2>
          <GameChatButton />
          <span className="arcade-coins">💰 {fmt(coins)} xu</span>
          <button className="icon-btn arcade-close" onClick={() => set({ panel: null })} aria-label="Đóng">✕</button>
        </div>

        {/* Người đang ngồi ở bàn — cùng chơi một ván */}
        {(st.seated?.length ?? 0) > 0 && <BcPlayers seated={st.seated!} meId={meId} />}

        <div className="bc-stage">
          {/* Đồng hồ đếm ngược */}
          <BcTimer phase={st.phase} endsAt={st.endsAt} offset={offset} />

          {/* Đĩa + bát úp */}
          <div className="bc-plate2">
            <BcDice phase={st.phase} dice={st.dice} />
            <div className={`bowl ${st.phase === 'result' ? 'lifted' : st.phase === 'rolling' ? 'shaking' : ''}`} />
            <div className="bc-call">
              {betting ? 'Đặt cược đi nào!' : st.phase === 'rolling' ? 'Lắc lắc lắc…' : result
                ? (result.net > 0 ? <span className="win">🎉 Bạn thắng +{fmt(result.net)} xu</span>
                  : result.net < 0 ? <span className="lose">Thua {fmt(-result.net)} xu</span> : 'Hoà vốn')
                : 'Mở bát!'}
            </div>
          </div>

          {/* Thống kê */}
          <div className="bc-stats">
            <div><span>👀</span><b>{st.viewers}</b><small>đang xem</small></div>
            <div><span>🎯</span><b>{st.players}</b><small>người cược</small></div>
            <div><span>💰</span><b>{fmt(pot)}</b><small>trên bàn</small></div>
          </div>
        </div>

        <div className="bc-board2">
          {BC_SYMBOLS.map((s, i) => {
            const hitCount = hits.filter((d) => d === i).length;
            return (
              <button key={s.name} className={`bc-tile ${betting ? '' : 'disabled'} ${hitCount ? 'hit' : ''}`} onClick={() => bet(i)}>
                {hitCount > 0 && <span className="hit-tag">×{hitCount}</span>}
                <span className="medal">{s.icon}</span>
                <span className="tile-label">{s.name}</span>
                <span className="tile-pot">💰 {fmt(st.totals[i])}</span>
                {myBets[i] > 0 && <span className="my-chip">{fmt(myBets[i])}</span>}
              </button>
            );
          })}
        </div>

        <div className="bc-bar">
          <div className="chips">
            {chips.map((c) => (
              <button key={c} className={`chip-btn c${c} ${chip === c ? 'active' : ''}`} disabled={c > coins} onClick={() => setChip(c)}>
                {c >= 1000 ? `${c / 1000}K` : c}
              </button>
            ))}
          </div>
          <div className="bc-mine-total">
            <small>Bạn cược</small><b>{fmt(myTotal)}</b>
            {betting && myTotal > 0 && <button className="tl-btn red small" onClick={clear}>Rút</button>}
          </div>
        </div>

        <div className="bc-foot">
          <div className="bc-hist">
            {st.history.slice(0, 8).map((h, i) => (
              <span key={i} className={`hist ${i === 0 ? 'latest' : ''}`}>{h.map((d) => BC_SYMBOLS[d].icon).join('')}</span>
            ))}
          </div>
          <span className="rules-chip">Ra 1 mặt ăn 1 · 2 mặt ăn 2 · 3 mặt ăn 3</span>
        </div>
        {st.lastWinners.length > 0 && st.phase === 'result' && (
          <div className="bc-winners2">🏆 {st.lastWinners.map((w) => `${w.name} +${fmt(w.win)}`).join(' · ')}</div>
        )}
      </div>
    </div>
  );
}

function rand6() {
  return Math.floor(Math.random() * 6);
}

/** Đồng hồ đếm ngược: tự đếm riêng, không bắt cả bàn vẽ lại mỗi 200ms. */
function BcTimer({ phase, endsAt, offset }: { phase: BcState['phase']; endsAt: number; offset: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (phase !== 'betting') return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [phase]);
  const betting = phase === 'betting';
  const remain = Math.max(0, Math.ceil((endsAt - (now + offset)) / 1000));
  const ringPct = betting ? Math.min(1, remain / 20) : 0;
  return (
    <div className={`bc-timer ${phase}`}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="44" className="track" />
        <circle cx="50" cy="50" r="44" className="bar" style={{ strokeDasharray: `${276.5 * ringPct} 276.5`, stroke: remain <= 5 ? '#ef476f' : '#ffd166' }} />
      </svg>
      <div className="bc-timer-text">
        {betting ? <><b>{remain}</b><small>giây</small></> : phase === 'rolling' ? <><b>🎲</b><small>đang lắc</small></> : <><b>✨</b><small>kết quả</small></>}
      </div>
    </div>
  );
}

/** Xúc xắc trong đĩa: hiệu ứng lắc chạy riêng trong component này. */
function BcDice({ phase, dice }: { phase: BcState['phase']; dice: number[] | null }) {
  const [rollFaces, setRollFaces] = useState([0, 1, 2]);
  useEffect(() => {
    if (phase !== 'rolling') return;
    const t = setInterval(() => setRollFaces([rand6(), rand6(), rand6()]), 110);
    sfx('dice');
    const t2 = setInterval(() => sfx('dice'), 700);
    return () => { clearInterval(t); clearInterval(t2); };
  }, [phase]);
  const faces = phase === 'result' && dice ? dice : phase === 'rolling' ? rollFaces : null;
  return (
    <div className="dish">
      {faces && faces.map((d, i) => (
        <div key={i} className={`die ${phase === 'rolling' ? 'shake' : 'pop'}`} style={{ animationDelay: `${i * 0.08}s` }}>
          {BC_SYMBOLS[d].icon}
        </div>
      ))}
    </div>
  );
}

/** Hàng người chơi: chỉ vẽ lại khi danh sách / tiền cược thay đổi. */
const BcPlayers = memo(function BcPlayers({ seated, meId }: { seated: NonNullable<BcState['seated']>; meId?: number }) {
  return (
    <div className="bc-players">
      {seated.map((p) => (
        <div key={p.id} className={`bc-player ${p.id === meId ? 'me' : ''}`} title={p.name}>
          <SayBubble uid={p.id} />
          <div className="seat-ava"><AvatarPreview appearance={p.appearance} size={88} /></div>
          <small>{p.id === meId ? 'Bạn' : p.name}</small>
          {p.bet > 0 && <span className="pbet">{p.bet >= 1000 ? `${(p.bet / 1000).toFixed(p.bet % 1000 ? 1 : 0)}K` : p.bet}</span>}
        </div>
      ))}
    </div>
  );
}, (a, b) => a.meId === b.meId && JSON.stringify(a.seated) === JSON.stringify(b.seated));
