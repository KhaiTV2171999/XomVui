import { FormEvent, useEffect, useRef, useState } from 'react';
import { send } from '../net';
import { set, useStore } from '../store';
import { keepFocus, MessengerBody } from './MessengerPanel';

/** Nút 💬 trên thanh tiêu đề các màn khu giải trí — kèm số tin nhắn bạn bè chưa đọc. */
export function GameChatButton() {
  const unread = useStore((s) => Object.values(s.unread).reduce((a, b) => a + b, 0));
  const open = useStore((s) => s.gameChat);
  return (
    <button className="icon-btn arcade-chat" aria-label="Trò chuyện" title="Trò chuyện"
      onClick={() => set({ gameChat: open ? null : unread > 0 ? 'friends' : 'community' })}>
      💬{unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
    </button>
  );
}

/** Ngăn chat trượt ra từ bên phải, nằm đè lên bàn chơi (không rời ván). */
export function GameChatDrawer() {
  const tab = useStore((s) => s.gameChat);
  const unread = useStore((s) => Object.values(s.unread).reduce((a, b) => a + b, 0));
  if (!tab) return null;
  const close = () => set({ gameChat: null, chatWith: null });
  return (
    <div className="gchat-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <aside className="gchat" role="dialog" aria-label="Trò chuyện">
        <div className="gchat-head">
          <div className="gchat-tabs">
            <button className={tab === 'community' ? 'on' : ''} onClick={() => set({ gameChat: 'community' })}>🌏 Cộng đồng</button>
            <button className={tab === 'friends' ? 'on' : ''} onClick={() => set({ gameChat: 'friends' })}>
              👥 Bạn bè{unread > 0 && <span className="badge static">{unread}</span>}
            </button>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Đóng">✕</button>
        </div>
        <div className="gchat-body">{tab === 'community' ? <CommunityChat /> : <MessengerBody />}</div>
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
        {chat.map((m) => (
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
