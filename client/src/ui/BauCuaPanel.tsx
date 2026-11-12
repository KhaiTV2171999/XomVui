import { useEffect, useRef, useState } from 'react';
import { bus, call, send } from '../net';
import { fmt, set, toast, useStore } from '../store';
import { Modal } from './common';
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
}

export function BauCuaPanel() {
  const coins = useStore((s) => s.me?.coins ?? 0);
  const [st, setSt] = useState<BcState | null>(null);
  const [myBets, setMyBets] = useState([0, 0, 0, 0, 0, 0]);
  const [chips, setChips] = useState<number[]>([10, 50, 100, 500, 1000, 5000]);
  const [chip, setChip] = useState(100);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [rollFaces, setRollFaces] = useState([0, 1, 2]);
  const [result, setResult] = useState<{ win: number; net: number } | null>(null);
  const roundRef = useRef(0);

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
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => { off1(); off2(); clearInterval(t); send('bc:leave'); };
  }, []);

  // Hiệu ứng lắc xúc xắc
  useEffect(() => {
    if (st?.phase !== 'rolling') return;
    const t = setInterval(() => setRollFaces([rand6(), rand6(), rand6()]), 90);
    sfx('dice');
    const t2 = setInterval(() => sfx('dice'), 700);
    return () => { clearInterval(t); clearInterval(t2); };
  }, [st?.phase]);

  if (!st) return <Modal title="🎲 Bầu Cua Tôm Cá" onClose={() => set({ panel: null })}><p>Đang vào bàn...</p></Modal>;

  const remain = Math.max(0, Math.ceil((st.endsAt - (now + offset)) / 1000));
  const betting = st.phase === 'betting';
  const myTotal = myBets.reduce((a, b) => a + b, 0);
  const faces = st.phase === 'result' && st.dice ? st.dice : st.phase === 'rolling' ? rollFaces : null;
  const hits = st.dice && st.phase === 'result' ? st.dice : [];

  async function bet(i: number) {
    if (!betting) return;
    const r = await call('bc:bet', { symbol: i, amount: chip });
    if (r.ok) setMyBets(r.myBets);
  }
  async function clear() {
    const r = await call('bc:clear');
    if (r.ok) setMyBets(r.myBets);
  }

  return (
    <Modal title="🎲 Bầu Cua Tôm Cá" onClose={() => set({ panel: null })} wide className="bc-modal">
      <div className="bc-top">
        <div className={`bc-phase ${st.phase}`}>
          {betting ? <>Đặt cược · <b>{remain}s</b></> : st.phase === 'rolling' ? 'Đang lắc...' : 'Kết quả'}
        </div>
        <div className="bc-info">👀 {st.viewers} người xem · 🎯 {st.players} người cược</div>
      </div>

      <div className="bc-bowl">
        <div className={`bc-plate ${st.phase}`}>
          {faces ? faces.map((d, i) => (
            <div key={i} className={`die ${st.phase === 'rolling' ? 'shake' : 'pop'}`} style={{ animationDelay: `${i * 0.08}s` }}>
              {BC_SYMBOLS[d].icon}
            </div>
          )) : <div className="bc-cover">🥣</div>}
        </div>
        {result && st.phase === 'result' && (
          <div className={`bc-result ${result.net > 0 ? 'win' : result.net < 0 ? 'lose' : ''}`}>
            {result.net > 0 ? `+${fmt(result.net)} xu 🎉` : result.net < 0 ? `-${fmt(-result.net)} xu` : 'Hoà vốn'}
          </div>
        )}
      </div>

      <div className="bc-board">
        {BC_SYMBOLS.map((s, i) => {
          const hitCount = hits.filter((d) => d === i).length;
          return (
            <button key={s.name} className={`bc-cell ${betting ? '' : 'disabled'} ${hitCount ? 'hit' : ''}`} style={{ background: s.color }} onClick={() => bet(i)}>
              <span className="bc-icon">{s.icon}</span>
              <span className="bc-name">{s.name}{hitCount > 1 ? ` x${hitCount}` : ''}</span>
              <span className="bc-total">Tổng: {fmt(st.totals[i])}</span>
              {myBets[i] > 0 && <span className="bc-mine">💰 {fmt(myBets[i])}</span>}
            </button>
          );
        })}
      </div>

      <div className="bc-controls">
        <div className="chips">
          {chips.map((c) => (
            <button key={c} className={`chip-btn c${c} ${chip === c ? 'active' : ''}`} disabled={c > coins} onClick={() => setChip(c)}>
              {c >= 1000 ? `${c / 1000}K` : c}
            </button>
          ))}
        </div>
        <div className="bc-mytotal">
          Cược: <b>{fmt(myTotal)}</b>
          {betting && myTotal > 0 && <button className="btn small" onClick={clear}>Rút cược</button>}
        </div>
      </div>

      <div className="bc-history">
        <span>Lịch sử:</span>
        {st.history.slice(0, 8).map((h, i) => (
          <span key={i} className="hist">{h.map((d) => BC_SYMBOLS[d].icon).join('')}</span>
        ))}
      </div>
      {st.lastWinners.length > 0 && st.phase === 'result' && (
        <div className="bc-winners">🏆 {st.lastWinners.map((w) => `${w.name} +${fmt(w.win)}`).join(' · ')}</div>
      )}
      <p className="hint">Mỗi con xuất hiện trên xúc xắc trả 1 lần tiền cược (xuất hiện 2 lần trả x2, 3 lần trả x3). Chỉ dùng xu ảo trong game.</p>
    </Modal>
  );
}

function rand6() {
  return Math.floor(Math.random() * 6);
}
