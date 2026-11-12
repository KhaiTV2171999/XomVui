import { useEffect, useMemo, useState } from 'react';
import type { Appearance } from '../../../shared/catalog';
import { analyze, beats, Combo, COMBO_NAMES, RANKS, rankOf, suitOf, SUITS } from '../../../shared/tienlen';
import { bus, call, send } from '../net';
import { confirmBox, fmt, set, useStore } from '../store';
import { AvatarPreview, Modal } from './common';
import { sfx } from '../sound';

interface SeatPub { name: string; kind: 'human' | 'bot'; userId: number | null; appearance: Appearance; count: number; passed: boolean }
interface TableState {
  id: number; stake: number; hostId: number; playing: boolean; turn: number; turnEndsAt: number; now: number;
  current: { combo: Combo; seat: number } | null; mySeat: number; myHand: number[];
  seats: (SeatPub | null)[]; log: string[];
  result: { winner: string; rows: { name: string; delta: number; left: number[] }[] } | null;
}
interface LobbyRow { id: number; stake: number; playing: boolean; count: number; host: string }

export function Card({ c, selected, onClick, small }: { c: number; selected?: boolean; onClick?: () => void; small?: boolean }) {
  const red = suitOf(c) >= 2;
  return (
    <div className={`card ${red ? 'red' : ''} ${selected ? 'sel' : ''} ${small ? 'small' : ''}`} onClick={onClick}>
      <span className="rank">{RANKS[rankOf(c)]}</span>
      <span className="suit">{SUITS[suitOf(c)]}</span>
      <span className="suit-big">{SUITS[suitOf(c)]}</span>
    </div>
  );
}

/** Âm thanh theo diễn biến ván bài. */
function playTableSounds(prev: TableState | null, t: TableState) {
  if (!prev) return;
  const played = JSON.stringify(t.current) !== JSON.stringify(prev.current) && t.current;
  if (played) sfx('card');
  if (t.playing && t.turn === t.mySeat && (prev.turn !== t.turn || !prev.playing)) sfx('ding');
  if (t.result && !prev.result) {
    const me = useStore.getState().me?.name;
    const row = t.result.rows.find((r) => me != null && r.name.startsWith(me));
    sfx(row && row.delta > 0 ? 'win' : 'lose');
  }
}

export function TienLenPanel() {
  const meId = useStore((s) => s.me?.id);
  const [lobby, setLobby] = useState<LobbyRow[]>([]);
  const [stakes, setStakes] = useState<number[]>([100, 500, 1000, 5000]);
  const [table, setTable] = useState<TableState | null>(null);

  useEffect(() => {
    call('tl:lobby').then((r) => {
      if (!r.ok) return;
      setLobby(r.tables);
      setStakes(r.stakes);
      setTable(r.table);
    });
    const off1 = bus.on('tl:lobby', setLobby);
    let prev: TableState | null = null;
    const off2 = bus.on('tl:state', (t: TableState) => {
      playTableSounds(prev, t);
      prev = t;
      setTable(t);
    });
    return () => { off1(); off2(); send('tl:closeLobby'); };
  }, []);

  const close = () => {
    if (table?.playing && table.mySeat >= 0) {
      confirmBox('Ván đang diễn ra. Thoát sẽ bị phạt gấp đôi tiền cược. Vẫn thoát?', async () => {
        await call('tl:leave');
        setTable(null);
        set({ panel: null });
      });
      return;
    }
    if (table) call('tl:leave');
    set({ panel: null });
  };

  if (!table) {
    return (
      <Modal title="🃏 CLB Tiến Lên Miền Nam" onClose={close} wide>
        <div className="tl-create">
          <span>Tạo bàn mới:</span>
          {stakes.map((s) => (
            <button key={s} className="btn primary" onClick={() => call('tl:create', { stake: s })}>💰 {fmt(s)}</button>
          ))}
        </div>
        <h4>Các bàn đang mở</h4>
        {lobby.length === 0 && <p className="empty">Chưa có bàn nào. Tạo bàn rồi thêm bot để chơi ngay!</p>}
        <div className="tl-lobby">
          {lobby.map((t) => (
            <div key={t.id} className="tl-room">
              <div className="tl-room-title">Bàn #{t.id} · 💰 {fmt(t.stake)}</div>
              <div className="tl-room-meta">Chủ bàn: {t.host} · {t.count}/4 người {t.playing ? '· đang chơi' : ''}</div>
              <button className="btn small primary" disabled={t.playing || t.count >= 4} onClick={() => call('tl:join', { id: t.id })}>Vào bàn</button>
            </div>
          ))}
        </div>
        <p className="hint">Luật: Tiến lên miền Nam. Người về nhất thắng tiền cược của mỗi người còn lại (bị cóng phạt x2). Heo bị chặt bởi 3 đôi thông / tứ quý.</p>
      </Modal>
    );
  }

  return <TableView table={table} meId={meId!} onClose={close} />;
}

function TableView({ table, meId, onClose }: { table: TableState; meId: number; onClose: () => void }) {
  const [sel, setSel] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now());
  const offset = table.now - Date.now();
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  useEffect(() => { setSel((s) => s.filter((c) => table.myHand.includes(c))); }, [table.myHand]);

  const isHost = table.hostId === meId;
  const myTurn = table.playing && table.turn === table.mySeat;
  const combo = useMemo(() => analyze(sel), [sel]);
  const canPlay = myTurn && !!combo && beats(combo, table.current?.combo ?? null);
  const remain = Math.max(0, (table.turnEndsAt - (now + offset)) / 1000);

  const toggle = (c: number) => setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  const play = async () => { const r = await call('tl:play', { cards: sel }); if (r.ok) setSel([]); };

  // Sắp xếp vị trí: mình luôn ở dưới
  const rel = (i: number) => (i - Math.max(0, table.mySeat) + 4) % 4;
  const posName = ['bottom', 'right', 'top', 'left'];

  return (
    <Modal title={`🃏 Bàn #${table.id} · cược ${fmt(table.stake)} xu`} onClose={onClose} wide className="tl-modal">
      <div className="tl-table">
        {table.seats.map((s, i) => {
          const pos = posName[rel(i)];
          if (pos === 'bottom') return null;
          return (
            <div key={i} className={`tl-seat ${pos} ${table.playing && table.turn === i ? 'turn' : ''}`}>
              {s ? (
                <>
                  <AvatarPreview appearance={s.appearance} size={64} />
                  <div className="tl-seat-name">{s.kind === 'bot' ? '🤖 ' : ''}{s.name}</div>
                  {table.playing && <div className="tl-count"><span className="card-back" /> {s.count}</div>}
                  {s.passed && table.playing && <div className="tl-passed">Bỏ lượt</div>}
                  {table.playing && table.turn === i && <TimerBar remain={remain} max={s.kind === 'bot' ? 1.5 : 20} />}
                  {isHost && !table.playing && s.kind === 'bot' && (
                    <button className="btn tiny danger" onClick={() => call('tl:removeBot', { seat: i })}>Bỏ bot</button>
                  )}
                </>
              ) : (
                <div className="tl-empty">
                  Ghế trống
                  {isHost && !table.playing && <button className="btn tiny" onClick={() => call('tl:addBot')}>+ Bot</button>}
                </div>
              )}
            </div>
          );
        })}

        <div className="tl-center">
          {table.current ? (
            <>
              <div className="tl-played">
                {table.current.combo.cards.map((c) => <Card key={c} c={c} small />)}
              </div>
              <div className="tl-played-by">{table.seats[table.current.seat]?.name} · {COMBO_NAMES[table.current.combo.type]}</div>
            </>
          ) : table.playing ? (
            <div className="tl-lead">{table.seats[table.turn]?.name} được đánh tự do</div>
          ) : (
            <div className="tl-waiting">
              {table.result ? (
                <div className="tl-result">
                  <h3>🏆 {table.result.winner} thắng!</h3>
                  {table.result.rows.map((r, i) => (
                    <div key={i} className="tl-result-row">
                      <span>{r.name}</span>
                      <b className={r.delta >= 0 ? 'pos' : 'neg'}>{r.delta >= 0 ? '+' : ''}{fmt(r.delta)}</b>
                      <span className="left-cards">{r.left.map((c) => <Card key={c} c={c} small />)}</span>
                    </div>
                  ))}
                </div>
              ) : <p>Đang chờ chủ bàn bắt đầu...</p>}
              {isHost && <button className="btn primary big" onClick={() => call('tl:start')}>▶ Bắt đầu ván</button>}
            </div>
          )}
        </div>
        <div className="tl-log">{table.log.map((l, i) => <div key={i}>{l}</div>)}</div>
      </div>

      <div className={`tl-me ${myTurn ? 'turn' : ''}`}>
        {myTurn && <TimerBar remain={remain} max={20} />}
        <div className="tl-hand">
          {table.myHand.map((c) => <Card key={c} c={c} selected={sel.includes(c)} onClick={() => toggle(c)} />)}
          {!table.playing && table.myHand.length === 0 && <span className="hint">Bài của bạn sẽ hiện ở đây</span>}
        </div>
        {table.playing && (
          <div className="tl-actions">
            <span className="tl-combo">{sel.length ? (combo ? COMBO_NAMES[combo.type] : 'Không hợp lệ') : myTurn ? 'Tới lượt bạn!' : 'Chờ lượt...'}</span>
            <button className="btn" disabled={!sel.length} onClick={() => setSel([])}>Bỏ chọn</button>
            <button className="btn" disabled={!myTurn || !table.current} onClick={() => call('tl:pass')}>Bỏ lượt</button>
            <button className="btn primary" disabled={!canPlay} onClick={play}>Đánh</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function TimerBar({ remain, max }: { remain: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (remain / max) * 100));
  return <div className="timer-bar"><div style={{ width: `${pct}%`, background: pct < 30 ? '#ef476f' : '#06d6a0' }} /></div>;
}
