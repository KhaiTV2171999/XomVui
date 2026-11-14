import { FormEvent, useEffect, useRef, useState } from 'react';
import { send } from '../net';
import { get, set, useStore } from '../store';
import { call } from '../net';
import { keepFocus, MessengerBody } from './MessengerPanel';

/** Nút 💬 trên thanh tiêu đề các màn khu giải trí — kèm số tin nhắn bạn bè chưa đọc. */
export function GameChatButton() {
  const pm = useStore((s) => Object.values(s.unread).reduce((a, b) => a + b, 0));
  const open = useStore((s) => s.gameChat);
  const unread = pm;
  return (
    <button className="icon-btn arcade-chat" aria-label="Trò chuyện" title="Trò chuyện"
      onClick={() => set({ gameChat: open ? null : pm > 0 ? 'friends' : gameOf(get().panel) ? 'table' : 'community' })}>
      💬{unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
    </button>
  );
}

/** Ngăn chat trượt ra từ bên phải, nằm đè lên bàn chơi (không rời ván). */
export function GameChatDrawer() {
  const tab = useStore((s) => s.gameChat);
  const unread = useStore((s) => Object.values(s.unread).reduce((a, b) => a + b, 0));
  const game = useStore((s) => gameOf(s.panel));
  if (!tab) return null;
  const close = () => set({ gameChat: null, chatWith: null });
  return (
    <div className="gchat-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <aside className="gchat" role="dialog" aria-label="Trò chuyện">
        <div className="gchat-head">
          <div className="gchat-tabs">
            {game && (
              <button className={tab === 'table' ? 'on' : ''} onClick={() => set({ gameChat: 'table' })}>
                🎲 Tại bàn
              </button>
            )}
            <button className={tab === 'community' ? 'on' : ''} onClick={() => set({ gameChat: 'community' })}>🌏 Cộng đồng</button>
            <button className={tab === 'friends' ? 'on' : ''} onClick={() => set({ gameChat: 'friends' })}>
              👥 Bạn bè{unread > 0 && <span className="badge static">{unread}</span>}
            </button>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Đóng">✕</button>
        </div>
        <div className="gchat-body">{tab === 'table' && game ? <TableChat game={game} /> : tab === 'friends' ? <MessengerBody /> : <CommunityChat />}</div>
      </aside>
    </div>
  );
}

function CommunityChat() {
  const chat = useStore((s) => s.chat);
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [chat]);
  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    send('chat', { text: t });
    setText('');
  }
  return (
    <div className="gchat-community">
      <div className="gchat-log" ref={logRef}>
        {chat.length === 0 && <p className="empty">Chưa có tin nhắn nào. Chào mọi người đi! 👋</p>}
        {chat.filter((m) => m.scope !== 'local').map((m) => (
          <div key={m.id} className={`chat-line ${m.kind}`}>{m.name && <b>{m.name}: </b>}{m.text}</div>
        ))}
      </div>
      <form className="chat-input" onSubmit={submit}>
        <input value={text} maxLength={120} onChange={(e) => setText(e.target.value)} placeholder="Nói gì đó với mọi người..." />
        <button className="btn small primary" onPointerDown={keepFocus} onMouseDown={keepFocus}>Gửi</button>
      </form>
    </div>
  );
}

/** Đang ở màn game nào (để chat tại bàn). */
function gameOf(panel: string | null): string | null {
  return panel === 'tienlen' || panel === 'tower' || panel === 'werewolf' || panel === 'baucua' ? panel : null;
}

const GAME_PLACE: Record<string, string> = { tienlen: 'bàn', tower: 'phòng', werewolf: 'làng', baucua: 'bàn bầu cua' };

const QUICK = ['👋', '😂', '😎', '😭', '😡', '👍', '🔥', '🎉', 'GG!', 'Nhanh lên!', 'Chơi tiếp không?', 'Hay quá!', 'Đợi mình chút', 'Cảm ơn nhé!'];

/** Chat tại bàn: chỉ hiện bong bóng trên đầu người chơi trong màn game (không có khung tin nhắn). */
function TableChat({ game }: { game: string }) {
  const [text, setText] = useState('');
  async function say(t: string) {
    t = t.trim();
    if (!t) return;
    const r = await call('chat:game', { text: t, game });
    if (r.ok) { setText(''); set({ gameChat: null }); } // đóng lại để thấy bong bóng của mình
  }
  return (
    <div className="gchat-community table-say">
      <div className="table-say-hint"><span>💬</span><p>Tin nhắn hiện thành <b>bong bóng trên đầu bạn</b> — chỉ người cùng {GAME_PLACE[game]} thấy.</p></div>
      <h5 className="table-say-h">Biểu cảm nhanh</h5>
      <div className="table-say-emo">
        {QUICK.filter((q) => !/[a-zA-ZÀ-ỹ]/.test(q)).map((q) => <button key={q} type="button" onClick={() => say(q)}>{q}</button>)}
      </div>
      <h5 className="table-say-h">Câu nói nhanh</h5>
      <div className="table-say-quick">
        {QUICK.filter((q) => /[a-zA-ZÀ-ỹ]/.test(q)).map((q) => <button key={q} type="button" onClick={() => say(q)}>{q}</button>)}
      </div>
      <form className="chat-input" onSubmit={(e: FormEvent) => { e.preventDefault(); say(text); }}>
        <input value={text} maxLength={80} onChange={(e) => setText(e.target.value)} placeholder="Nói gì đó..." autoFocus />
        <button className="btn small primary" onPointerDown={keepFocus} onMouseDown={keepFocus}>Nói</button>
      </form>
    </div>
  );
}

/** Bong bóng câu nói gần nhất của một người chơi (chat tại bàn) — tự tắt sau 5 giây. */
export function SayBubble({ uid }: { uid: number | null | undefined }) {
  const say = useStore((s) => (uid != null ? s.tableSay[uid] : undefined));
  const [, tick] = useState(0);
  useEffect(() => {
    if (!say) return;
    const left = say.at + 5000 - Date.now();
    if (left <= 0) return;
    const t = setTimeout(() => tick((x) => x + 1), left);
    return () => clearTimeout(t);
  }, [say]);
  if (!say || Date.now() - say.at > 5000) return null;
  return <span key={say.at} className="say-bubble">{say.text}</span>;
}
