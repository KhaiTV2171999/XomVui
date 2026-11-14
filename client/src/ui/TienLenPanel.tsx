import { GameChatButton, SayBubble } from './GameChat';
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
  result: { winner: string; winnerSeat?: number; rows: { seat?: number; name: string; delta: number; left: number[]; cong?: boolean }[] } | null;
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
    const row = t.result.rows.find((r) => (r.seat != null ? r.seat === t.mySeat : me != null && r.name.startsWith(me)));
    sfx(row && row.delta > 0 ? 'win' : 'lose');
  }
}

export function TienLenPanel() {
  const meId = useStore((s) => s.me?.id);
  const coins = useStore((s) => s.me?.coins ?? 0);
  const [lobby, setLobby] = useState<LobbyRow[]>([]);
  const [stakes, setStakes] = useState<number[]>([10, 50, 100, 500]);
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
    const TIERS: Record<number, { name: string; color: string }> = {
      10: { name: 'Bàn tập', color: '#4cc9f0' },
      50: { name: 'Bình dân', color: '#06d6a0' },
      100: { name: 'Cao thủ', color: '#ef476f' },
      500: { name: 'VIP', color: '#ffb703' },
    };
    const tier = (s: number) => TIERS[s] ?? { name: 'Bàn', color: '#9b72cf' };
    return (
      <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className="arcade felt">
          <div className="arcade-head">
            <button className="btn small felt-back" onClick={() => set({ panel: 'games' })} aria-label="Về Khu giải trí">←<span className="back-label"> Khu giải trí</span></button>
            <h2 className="neon">🃏 CLB TIẾN LÊN</h2>
            <GameChatButton />
            <span className="arcade-coins">💰 {fmt(coins)} xu</span>
            <button className="icon-btn arcade-close" onClick={close} aria-label="Đóng">✕</button>
          </div>

          <div className="felt-section">Chọn mức bàn để mở bàn mới · thua trả theo số lá còn trên tay (cóng ×2)</div>
          <div className="stake-row">
            {stakes.map((s) => {
              const t = tier(s);
              const need = s * 26; // thua cóng: 13 lá × 2
              const enough = coins >= need;
              return (
                <button key={s} className={`stake-chip ${enough ? '' : 'poor'}`} style={{ ['--chip' as string]: t.color }}
                  onClick={() => call('tl:create', { stake: s })} title={enough ? `Mở bàn ${t.name}: ${s} xu mỗi lá` : `Cần ít nhất ${fmt(need)} xu`}>
                  <span className="chip-coin"><b>{s}</b></span>
                  <span className="chip-name">{t.name} · {s} xu/lá</span>
                  <small>{enough ? `cần ${fmt(need)} xu` : `🔒 cần ${fmt(need)} xu`}</small>
                </button>
              );
            })}
          </div>

          <div className="felt-section">Bàn đang mở {lobby.length > 0 && <span className="felt-count">{lobby.length}</span>}</div>
          {lobby.length === 0 ? (
            <div className="felt-empty">
              <div className="tile-art fan">
                {[['A', '♠', false], ['K', '♥', true], ['Q', '♦', true], ['J', '♣', false]].map(([r, s, red], i) => (
                  <span key={i} className={`mini-card ${red ? 'red' : ''}`} style={{ transform: `rotate(${(i - 1.5) * 14}deg) translateY(${Math.abs(i - 1.5) * 5}px)` }}>
                    <b>{r as string}</b><i>{s as string}</i>
                  </span>
                ))}
              </div>
              <p>Chưa có bàn nào đang mở.<br />Chọn một mức bàn ở trên rồi thêm bot để chơi ngay!</p>
            </div>
          ) : (
            <div className="table-list">
              {lobby.map((t) => {
                const full = t.count >= 4;
                const tr = tier(t.stake);
                return (
                  <div key={t.id} className={`mini-table ${t.playing ? 'playing' : ''}`}>
                    <div className="mini-felt">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className={`seat s${i} ${i < t.count ? 'taken' : ''}`}>{i === 0 ? t.host.slice(0, 1).toUpperCase() : i < t.count ? '👤' : ''}</span>
                      ))}
                      <span className="mini-chip" style={{ ['--chip' as string]: tr.color }}>{t.stake}</span>
                    </div>
                    <div className="mini-info">
                      <b>Bàn #{t.id} · {tr.name} · {t.stake} xu/lá</b>
                      <small>Chủ bàn: {t.host} · {t.count}/4 ghế</small>
                      <span className={`table-status ${t.playing ? 'busy' : full ? 'full' : 'open'}`}>
                        {t.playing ? '🔴 Đang chơi' : full ? '⚪ Đã đủ người' : '🟢 Chờ người'}
                      </span>
                    </div>
                    <button className="play-btn small" disabled={t.playing || full} onClick={() => call('tl:join', { id: t.id })}>
                      {t.playing ? 'Đợi ván sau' : full ? 'Đầy' : 'VÀO BÀN ▶'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rules">
            <span>📜 Luật</span>
            <span>Về nhất thắng cược của mỗi người</span>
            <span>Cóng (chưa đánh lá nào) phạt ×2</span>
            <span>3 đôi thông / tứ quý chặt heo</span>
            <span>Thiếu người → thêm bot</span>
          </div>
        </div>
      </div>
    );
  }

  return <TableView table={table} meId={meId!} onClose={close} />;
}

function TableView({ table, meId, onClose }: { table: TableState; meId: number; onClose: () => void }) {
  const [sel, setSel] = useState<number[]>([]);
  const myCoins = useStore((s) => s.me?.coins ?? 0);
  // Độ lệch giờ với server: tính một lần mỗi khi nhận trạng thái bàn mới
  const offset = useMemo(() => table.now - Date.now(), [table.now]);
  useEffect(() => { setSel((s) => s.filter((c) => table.myHand.includes(c))); }, [table.myHand]);

  const isHost = table.hostId === meId;
  const myTurn = table.playing && table.turn === table.mySeat;
  const combo = useMemo(() => analyze(sel), [sel]);
  const canPlay = myTurn && !!combo && beats(combo, table.current?.combo ?? null);

  const toggle = (c: number) => setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  const play = async () => { const r = await call('tl:play', { cards: sel }); if (r.ok) setSel([]); };

  // Kết quả ván vừa xong của từng ghế (bài còn lại + tiền)
  const resultOf = (seat: number) => (table.result?.rows.find((r) => r.seat === seat) ?? null);
  // Sắp xếp vị trí: mình luôn ở dưới
  const rel = (i: number) => (i - Math.max(0, table.mySeat) + 4) % 4;
  const posName = ['bottom', 'right', 'top', 'left'];

  return (
    <div className="modal-backdrop">
     <div className="arcade felt tl-room-view">
      <div className="arcade-head">
        <button className="btn small felt-back" onClick={onClose} aria-label="Rời bàn">←<span className="back-label"> Rời bàn</span></button>
        <h2 className="neon">🃏 BÀN #{table.id}</h2>
        <span className="tl-stake-pill" title="Người thua trả số xu này cho mỗi lá còn trên tay">💰 {table.stake} xu/lá</span>
        <GameChatButton />
        <span className="arcade-coins">💰 {fmt(myCoins)} xu</span>
      </div>
      <div className="tl-table">
        {table.seats.map((s, i) => {
          const pos = posName[rel(i)];
          if (pos === 'bottom') return null;
          return (
            <div key={i} className={`tl-seat ${pos} ${table.playing && table.turn === i ? 'turn' : ''}`}>
              {s ? (
                <>
                  <div className="seat-ava"><AvatarPreview appearance={s.appearance} size={96} /></div>
                  <SayBubble uid={s.userId} />
                  <div className="seat-info">
                    <div className="tl-seat-name">{s.kind === 'bot' ? '🤖 ' : ''}{s.name}</div>
                    {table.playing && <div className="tl-count"><span className="card-back" /> {s.count} lá</div>}
                    {s.passed && table.playing && <div className="tl-passed">Bỏ lượt</div>}
                  </div>
                  {table.playing && table.turn === i && <TimerBar endsAt={table.turnEndsAt} offset={offset} max={s.kind === 'bot' ? 1.5 : 20} />}
                  {isHost && !table.playing && s.kind === 'bot' && !resultOf(i) && (
                    <button className="btn tiny danger" onClick={() => call('tl:removeBot', { seat: i })}>Bỏ bot</button>
                  )}
                  {!table.playing && resultOf(i) && <SeatReveal row={resultOf(i)!} stake={table.stake} />}
                </>
              ) : (
                <div className="tl-empty">
                  <span className="empty-pod">🪑</span>
                  {isHost && !table.playing ? <button className="btn tiny add-bot" onClick={() => call('tl:addBot')}>+ Bot</button> : <small>Ghế trống</small>}
                </div>
              )}
            </div>
          );
        })}

        <div className="tl-center">
          {table.playing && table.current ? (
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
                <div className="tl-win-banner">
                  <b>🏆 {table.result.winner} thắng <span className="tl-win-pot">+{fmt(table.result.rows[0]?.delta ?? 0)} xu</span></b>
                  <small>{table.stake} xu × số lá còn lại · cóng ×2</small>
                </div>
              ) : table.current ? <p>⏳ Đang tính tiền…</p>
                : <p>{isHost ? 'Cần ít nhất 2 người · bấm "+ Bot" ở ghế trống' : 'Đang chờ chủ bàn bắt đầu…'}</p>}
              <div className="tl-end-actions">
                {isHost
                  ? <button className="play-btn big tl-end-btn" onClick={() => call('tl:start')}>▶ {table.result ? 'CHƠI LẠI' : 'BẮT ĐẦU VÁN'}</button>
                  : table.result && <p className="hint">Chờ chủ bàn bắt đầu ván mới…</p>}
                {table.result && <button className="btn felt-back tl-end-btn ghost" onClick={onClose}>🚪 THOÁT BÀN</button>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={`tl-me ${myTurn ? 'turn' : ''}`}>
        <SayBubble uid={table.seats[table.mySeat]?.userId} />
        {myTurn && <TimerBar endsAt={table.turnEndsAt} offset={offset} max={20} />}
        {!table.playing && resultOf(table.mySeat) && resultOf(table.mySeat)!.left.length > 0 && <SeatReveal row={resultOf(table.mySeat)!} stake={table.stake} mine />}
        <div className="tl-hand">
          {table.myHand.map((c) => <Card key={c} c={c} selected={sel.includes(c)} onClick={() => toggle(c)} />)}
          {!table.playing && table.myHand.length === 0 && !table.result && <span className="hint">Bài của bạn sẽ hiện ở đây</span>}
        </div>
        {table.playing && (
          <div className="tl-actions">
            <button className="tl-btn red tl-pass" disabled={!myTurn || !table.current} onClick={() => call('tl:pass')}>Bỏ lượt</button>
            <span className="tl-combo">{sel.length ? (combo ? COMBO_NAMES[combo.type] : 'Không hợp lệ') : myTurn ? 'Tới lượt bạn!' : 'Chờ lượt...'}</span>
            <button className="tl-btn gray" disabled={!sel.length} onClick={() => setSel([])}>Bỏ chọn</button>
            <button className="tl-btn gold" disabled={!canPlay} onClick={play}>ĐÁNH ▶</button>
          </div>
        )}
      </div>
     </div>
    </div>
  );
}

/** Thanh thời gian lượt: tự đếm riêng, không bắt cả bàn (và bài trên tay) vẽ lại liên tục. */
function TimerBar({ endsAt, offset, max }: { endsAt: number; offset: number; max: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);
  const remain = Math.max(0, (endsAt - (now + offset)) / 1000);
  const pct = Math.max(0, Math.min(100, (remain / max) * 100));
  return <div className="timer-bar"><div style={{ width: `${pct}%`, background: pct < 30 ? '#ef476f' : '#06d6a0' }} /></div>;
}

/** Lật bài ngay cạnh ghế khi hết ván: số xu + dải bài mini xếp chồng. */
function SeatReveal({ row, stake, mine }: { row: { delta: number; left: number[]; cong?: boolean }; stake: number; mine?: boolean }) {
  const win = row.left.length === 0;
  if (win) return <div className="tl-reveal win"><b>🏆 +{fmt(row.delta)}</b></div>;
  return (
    <div className={`tl-reveal lose ${mine ? 'mine' : ''}`} title={`Còn ${row.left.length} lá × ${stake} xu${row.cong ? ' × 2 (cóng)' : ''}`}>
      <b>−{fmt(Math.abs(row.delta))}</b>
      <small>{row.cong ? 'Cóng · ' : ''}{row.left.length} lá</small>
      {!mine && (
        <span className="tl-mini-cards">
          {row.left.map((c) => <i key={c} className={suitOf(c) >= 2 ? 'red' : ''}>{RANKS[rankOf(c)]}<em>{SUITS[suitOf(c)]}</em></i>)}
        </span>
      )}
    </div>
  );
}
