import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { call } from '../net';
import { ChatMessage, set, useStore } from '../store';
import { Modal } from './common';

function timeLabel(at: number) {
  const d = new Date(at);
  const now = new Date();
  const hm = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return hm;
  return `${d.getDate()}/${d.getMonth() + 1} ${hm}`;
}

/** Hộp thư: danh sách bạn bè bên trái, khung trò chuyện bên phải. */
export function MessengerPanel() {
  const friends = useStore((s) => s.friends.friends);
  const chatWith = useStore((s) => s.chatWith);
  const unread = useStore((s) => s.unread);
  const [last, setLast] = useState<Record<number, ChatMessage>>({});

  useEffect(() => {
    call('pm:overview', {}, { silent: true }).then((r) => r.ok && setLast(r.last));
  }, [chatWith]);

  const sorted = [...friends].sort((a, b) =>
    (unread[b.id] ?? 0) - (unread[a.id] ?? 0)
    || (last[b.id]?.at ?? 0) - (last[a.id]?.at ?? 0)
    || Number(!!b.online) - Number(!!a.online));

  const close = () => set({ panel: null, chatWith: null });

  return (
    <Modal title="💬 Tin nhắn" onClose={close} wide className="messenger-modal">
      <div className={`messenger ${chatWith ? 'has-chat' : ''}`}>
        <div className="msg-list">
          {sorted.length === 0 && <p className="empty">Chưa có bạn bè. Kết bạn để nhắn tin nhé!</p>}
          {sorted.map((f) => (
            <button key={f.id} className={`msg-friend ${chatWith?.id === f.id ? 'active' : ''}`}
              onClick={() => set({ chatWith: { id: f.id, name: f.name } })}>
              <span className="msg-ava">{f.name.slice(0, 1).toUpperCase()}<span className={`dot ${f.online ? 'on' : ''}`} /></span>
              <span className="msg-friend-text">
                <b>{f.name}</b>
                <small>{last[f.id] ? last[f.id].text : f.online ? 'Đang online' : 'Offline'}</small>
              </span>
              {(unread[f.id] ?? 0) > 0 && <span className="badge static">{unread[f.id]}</span>}
            </button>
          ))}
        </div>
        {chatWith ? <Conversation key={chatWith.id} friendId={chatWith.id} name={chatWith.name} />
          : <div className="msg-empty">Chọn một người bạn để bắt đầu trò chuyện 💬</div>}
      </div>
    </Modal>
  );
}

function Conversation({ friendId, name }: { friendId: number; name: string }) {
  const meId = useStore((s) => s.me?.id);
  const messages = useStore((s) => s.chats[friendId]);
  const online = useStore((s) => !!s.friends.friends.find((f) => f.id === friendId)?.online);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [more, setMore] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Tải lịch sử (và đánh dấu đã đọc) khi mở
  useEffect(() => {
    call('pm:history', { with: friendId }).then((r) => {
      if (!r.ok) return;
      set((s) => ({ chats: { ...s.chats, [friendId]: r.messages }, unread: { ...s.unread, [friendId]: 0 } }));
      setMore(r.messages.length >= 40);
    });
    inputRef.current?.focus();
  }, [friendId]);

  useLayoutEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [messages?.length]);

  async function loadOlder() {
    if (!messages?.length) return;
    const r = await call('pm:history', { with: friendId, before: messages[0].id });
    if (!r.ok) return;
    const el = logRef.current;
    const prevH = el?.scrollHeight ?? 0;
    set((s) => ({ chats: { ...s.chats, [friendId]: [...r.messages, ...(s.chats[friendId] ?? [])] } }));
    setMore(r.messages.length >= 40);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevH; });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const r = await call('pm', { to: friendId, text: t });
    setSending(false);
    if (r.ok) setText('');
    inputRef.current?.focus();
  }

  return (
    <div className="msg-chat">
      <div className="msg-head">
        <button className="icon-btn msg-back" onClick={() => set({ chatWith: null })} aria-label="Quay lại">←</button>
        <b>{name}</b>
        <small>{online ? '🟢 Đang online' : '⚪ Offline · sẽ nhận được khi vào game'}</small>
      </div>
      <div className="msg-log" ref={logRef}>
        {more && messages && messages.length > 0 && <button className="btn small msg-more" onClick={loadOlder}>Tải tin cũ hơn</button>}
        {!messages && <p className="empty">Đang tải…</p>}
        {messages && messages.length === 0 && <p className="empty">Hãy gửi lời chào tới {name} 👋</p>}
        {messages?.map((m, i) => {
          const mine = m.from === meId;
          const showTime = i === 0 || m.at - messages[i - 1].at > 5 * 60_000;
          return (
            <div key={m.id}>
              {showTime && <div className="msg-time">{timeLabel(m.at)}</div>}
              <div className={`msg-row ${mine ? 'mine' : ''}`}>
                <div className="msg-bubble" title={timeLabel(m.at)}>{m.text}</div>
              </div>
            </div>
          );
        })}
      </div>
      <form className="msg-input" onSubmit={submit}>
        <input ref={inputRef} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder={`Nhắn cho ${name}…`} />
        <button className="btn primary" disabled={!text.trim() || sending}>Gửi</button>
      </form>
    </div>
  );
}
