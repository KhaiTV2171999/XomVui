import { useEffect, useMemo, useRef, useState } from 'react';
import type { Appearance } from '../../../shared/catalog';
import { bus, call, send } from '../net';
import { confirmBox, fmt, get as getStore, set, set as setStore, useStore } from '../store';
import { AvatarPreview } from './common';
import { GameChatButton, SayBubble } from './GameChat';
import { VoiceMesh } from '../voice';
import { MicTest } from './MicTest';
import { toast } from '../store';

/** Luật gửi tiếng: phòng chờ/kết thúc ai cũng nói; ngày & bỏ phiếu: người còn sống; đêm: Sói chỉ nói với Sói. */
function canSpeakTo(room: WRoom, peerId: number) {
  const me = room.me;
  if (!me) return false;
  if (room.phase === 'lobby' || room.phase === 'end') return true;
  if (!me.alive) return false;
  if (room.phase === 'night') return me.role === 'wolf' && room.players.find((p) => p.id === peerId)?.role === 'wolf';
  return true;
}

/** Phần điều khiển thoại đưa xuống giao diện (join = mở bước kiểm tra mic) */
type VoiceUi = { joined: boolean; micOn: boolean; setMicOn: (v: boolean) => void; speaking: Set<number>; join: () => void; leave: () => void };

/** Thoại nhóm trong làng (WebRTC). */
function useVoice(room: WRoom | null, meId: number) {
  const mesh = useRef<VoiceMesh | null>(null);
  const [joined, setJoined] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [speaking, setSpeaking] = useState<Set<number>>(new Set());
  const roomRef = useRef(room);
  roomRef.current = room;

  useEffect(() => bus.on('ww:voice:signal', ({ from, data }) => { mesh.current?.handleSignal(from, data); }) as unknown as () => void, []);
  useEffect(() => () => { mesh.current?.stop(); mesh.current = null; send('ww:voice:leave'); }, []);
  // Rời phòng → tắt thoại
  useEffect(() => { if (!room && mesh.current) { mesh.current.stop(); mesh.current = null; setJoined(false); } }, [room]);
  // Đêm xuống: Sói tự động mở mic để bàn bạc với bầy
  useEffect(() => {
    if (room?.phase === 'night' && room.me?.role === 'wolf' && room.me.alive) setMicOn(true);
  }, [room?.phase, room?.day, room?.me?.role, room?.me?.alive]);
  // Đồng bộ người nghe/nói theo luật mỗi khi trạng thái làng đổi
  useEffect(() => {
    if (!room || !mesh.current) return;
    mesh.current.sync(room.voice, (id) => canSpeakTo(room, id), micOn);
  }, [room, micOn]);

  async function join(deviceId?: string) {
    if (!navigator.mediaDevices?.getUserMedia) { toast('Trình duyệt không hỗ trợ micro (cần mở bằng HTTPS)', 'error'); return; }
    const m = new VoiceMesh(meId, [], (to, data) => send('ww:voice:signal', { to, data }), setSpeaking);
    try { await m.start(deviceId); } catch { toast('🎤 Chưa được cấp quyền micro — hãy cho phép trong trình duyệt', 'error'); return; }
    const r = await call('ww:voice:join');
    if (!r.ok) { m.stop(); return; }
    m.setIce(r.iceServers);
    mesh.current = m;
    setJoined(true);
    setMicOn(true);
    if (roomRef.current) m.sync(roomRef.current.voice, (id) => canSpeakTo(roomRef.current!, id), true);
  }
  function leave() {
    mesh.current?.stop();
    mesh.current = null;
    setJoined(false);
    send('ww:voice:leave');
  }
  return { joined, micOn, setMicOn, speaking, join, leave };
}

type Role = 'wolf' | 'seer' | 'guard' | 'villager';
type Phase = 'lobby' | 'night' | 'day' | 'vote' | 'end';
interface WPlayer {
  id: number; name: string; appearance: Appearance; bot: boolean; alive: boolean; left: boolean;
  role: Role | null; votes: number; votedFor: number | null; wolfPick: number | null;
}
interface WMsg { from: number; name: string; text: string; kind: 'day' | 'wolf' | 'sys'; at: number }
interface WRoom {
  id: number; hostId: number; phase: Phase; day: number; endsAt: number; now: number; winner: 'wolf' | 'village' | null;
  players: WPlayer[];
  me: { role: Role | null; alive: boolean; action: number | null; lastGuard: number | null; seer: { target: number; wolf: boolean; day: number }[] } | null;
  chat: WMsg[];
  ready: number[];
  voice: number[];
}
interface LobbyRoom { id: number; host: string; count: number; max: number }

const ROLE: Record<Role, { icon: string; name: string; desc: string; act?: string }> = {
  wolf: { icon: '🐺', name: 'Sói', desc: 'Ban đêm cùng bầy chọn một người để cắn. Ban ngày giả làm dân lành!', act: 'Chọn người để cắn' },
  seer: { icon: '🔮', name: 'Tiên tri', desc: 'Mỗi đêm soi một người để biết có phải Sói không.', act: 'Chọn người để soi' },
  guard: { icon: '🛡️', name: 'Bảo vệ', desc: 'Mỗi đêm che chở một người khỏi Sói (không trùng 2 đêm liền).', act: 'Chọn người để bảo vệ' },
  villager: { icon: '👨‍🌾', name: 'Dân làng', desc: 'Ban đêm ngủ ngon. Ban ngày cùng mọi người tìm ra Sói!' },
};
const PHASE: Record<Phase, string> = { lobby: '🏡 Phòng chờ', night: '🌙 Ban đêm', day: '☀️ Ban ngày', vote: '🗳️ Bỏ phiếu', end: '🏁 Kết thúc' };

/** Ma Sói: sảnh phòng + bàn chơi. */
export function WerewolfPanel() {
  const coins = useStore((s) => s.me?.coins ?? 0);
  const meId = useStore((s) => s.me?.id ?? 0);
  const [room, setRoom] = useState<WRoom | null>(null);
  const voice = useVoice(room, meId);
  const [micTest, setMicTest] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  // Vừa nhận lời mời → vào làng đó
  useEffect(() => {
    const id = getStore().wwJoinId;
    if (id != null) { setStore({ wwJoinId: null }); call('ww:join', { id }); }
  }, []);
  // Vào làng lần đầu trong phiên → mời kiểm tra micro
  useEffect(() => {
    if (!room || voice.joined) return;
    try { if (sessionStorage.getItem('xv_ww_mictest')) return; sessionStorage.setItem('xv_ww_mictest', '1'); } catch { /* bỏ qua */ }
    setMicTest(true);
  }, [room?.id]);
  const voiceUi: VoiceUi = { ...voice, join: () => setMicTest(true) };

  useEffect(() => {
    const off = bus.on('ww:room', (r: WRoom) => setRoom(r));
    return () => { off(); send('ww:leave'); };
  }, []);

  const close = () => set({ panel: null });
  const inGame = room && room.phase !== 'lobby' && room.phase !== 'end' && room.me?.alive;
  const leaveRoom = () => {
    const go = () => { send('ww:leave'); setRoom(null); };
    if (inGame) confirmBox('Rời làng giữa ván? Bạn sẽ bị tính là đã chết.', go); else go();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !room) close(); }}>
      <div className={`arcade night ww-view ${room?.phase === 'night' ? 'is-night' : ''}`}>
        <div className="arcade-head">
          <button className="btn small felt-back" onClick={room ? leaveRoom : () => set({ panel: 'games' })} aria-label="Quay lại">
            ←<span className="back-label"> {room ? 'Rời phòng' : 'Khu giải trí'}</span>
          </button>
          <h2 className="neon">🐺 MA SÓI</h2>
          <GameChatButton />
          <span className="arcade-coins">💰 {fmt(coins)} xu</span>
          <button className="icon-btn arcade-close" onClick={close} aria-label="Đóng">✕</button>
        </div>
        {room ? <RoomView room={room} meId={meId} voice={voiceUi} onMicTest={() => setMicTest(true)} onInvite={() => setInviteOpen(true)} /> : <Lobby />}
        {inviteOpen && room && <InviteFriends room={room} onClose={() => setInviteOpen(false)} />}
        {micTest && <MicTest onClose={() => setMicTest(false)} onReady={(id) => { setMicTest(false); if (voice.joined) voice.leave(); voice.join(id); }} />}
      </div>
    </div>
  );
}

function Lobby() {
  const [rooms, setRooms] = useState<LobbyRoom[]>([]);
  useEffect(() => {
    call('ww:lobby', {}, { silent: true }).then((r) => r.ok && setRooms(r.rooms));
    const off = bus.on('ww:lobby', (l: LobbyRoom[]) => setRooms(l));
    return () => { off(); send('ww:unlobby'); };
  }, []);
  return (
    <div className="ww-lobby">
      <section className="ww-card">
        <h3>🌕 Luật chơi</h3>
        <ul className="ww-rules">
          {(['wolf', 'seer', 'guard', 'villager'] as Role[]).map((r) => <li key={r}><b>{ROLE[r].icon} {ROLE[r].name}:</b> {ROLE[r].desc}</li>)}
        </ul>
        <p className="ww-note">🌙 Đêm 25s → ☀️ Ngày 50s thảo luận → 🗳️ Bỏ phiếu treo cổ 20s. Dân thắng khi hết Sói; Sói thắng khi số Sói bằng số Dân. Phe thắng +30 xu.</p>
      </section>
      <section className="ww-card">
        <h3>🏘️ Các làng đang chờ</h3>
        <button className="play-btn big" onClick={() => call('ww:create')}>＋ MỞ LÀNG MỚI</button>
        <div className="ww-rooms">
          {rooms.length === 0 ? <p className="empty">Chưa có làng nào — mở làng rồi thêm bot để chơi ngay!</p> : rooms.map((r) => (
            <div key={r.id} className="ww-room">
              <span>🏡 Làng của <b>{r.host}</b></span>
              <small>{r.count}/{r.max} người</small>
              <button className="play-btn small" disabled={r.count >= r.max} onClick={() => call('ww:join', { id: r.id })}>VÀO</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function RoomView({ room, meId, voice, onMicTest, onInvite }: { room: WRoom; meId: number; voice: VoiceUi; onMicTest: () => void; onInvite: () => void }) {
  const offset = useRef(room.now - Date.now());
  useEffect(() => { offset.current = room.now - Date.now(); }, [room.now]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const left = room.endsAt ? Math.max(0, Math.ceil((room.endsAt - (now + offset.current)) / 1000)) : 0;
  const me = room.me;
  const isHost = room.hostId === meId;
  const role = me?.role ? ROLE[me.role] : null;

  // Có thể chạm vào ai lúc này?
  const canTarget = (p: WPlayer) => {
    if (!me?.alive || !p.alive) return false;
    if (room.phase === 'vote') return p.id !== meId;
    if (room.phase !== 'night') return false;
    if (me.role === 'wolf') return p.role !== 'wolf';
    if (me.role === 'seer') return p.id !== meId && !me.seer.some((x) => x.target === p.id && x.day === room.day) && !(me.action != null);
    if (me.role === 'guard') return p.id !== me.lastGuard;
    return false;
  };
  const pick = (p: WPlayer) => {
    if (!canTarget(p)) return;
    call(room.phase === 'vote' ? 'ww:vote' : 'ww:act', { target: p.id });
  };

  const hint = room.phase === 'lobby' ? (isHost ? `Cần ít nhất 5 người — thêm bot rồi bấm Bắt đầu (${room.players.length}/10)` : 'Đang chờ chủ phòng bắt đầu…')
    : room.phase === 'end' ? (room.winner === 'village' ? '🎉 Dân làng chiến thắng!' : '🐺 Bầy Sói chiến thắng!')
    : !me?.alive ? '👻 Bạn đã chết — hãy xem tiếp nhé'
    : room.phase === 'night' ? (role?.act ? `${role.act} (chạm vào thẻ)` : '😴 Bạn đang ngủ… chờ trời sáng')
    : room.phase === 'day' ? '🗣️ Thảo luận qua mic để tìm ra Sói'
    : '🗳️ Chạm vào người bạn nghi là Sói';

  const humans = room.players.filter((p) => !p.bot);
  const humansInVoice = humans.filter((p) => room.voice.includes(p.id)).length;
  const seerMap = useMemo(() => new Map((me?.seer ?? []).map((x) => [x.target, x.wolf])), [me?.seer]);

  return (
    <div className="ww-room-view">
      <div className="ww-main">
        <div className={`ww-banner ${room.phase}`}>
          <b>{PHASE[room.phase]}{room.day ? ` · ngày ${room.day}` : ''}</b>
          {left > 0 && <span className={`ww-timer ${left <= 5 ? 'hot' : ''}`}>⏱ {left}s</span>}
          <small>{hint}</small>
        </div>
        <div className="ww-grid">
          {room.players.map((p) => {
            const mine = p.id === meId;
            const targeted = me?.action === p.id;
            const seen = seerMap.get(p.id);
            return (
              <button key={p.id} className={`ww-player ${p.alive ? '' : 'dead'} ${mine ? 'me' : ''} ${canTarget(p) ? 'can' : ''} ${targeted ? 'picked' : ''} ${voice.speaking.has(p.id) ? 'speaking' : ''}`} onClick={() => pick(p)}>
                {room.voice.includes(p.id) && <span className="ww-voice-ic" title="Đang bật thoại">{voice.speaking.has(p.id) ? '🗣️' : '🎧'}</span>}
                <SayBubble uid={p.bot ? null : p.id} />
                <span className="ww-ava"><AvatarPreview appearance={p.appearance} size={64} />{!p.alive && <i className="ww-skull">💀</i>}</span>
                <span className="ww-name">{mine ? 'Bạn' : p.name}</span>
                {p.role && <span className={`ww-role ${p.role}`}>{ROLE[p.role].icon} {ROLE[p.role].name}</span>}
                {!p.role && seen != null && <span className={`ww-role ${seen ? 'wolf' : 'safe'}`}>{seen ? '🐺 Là Sói!' : '✅ Không phải Sói'}</span>}
                {p.votes > 0 && <span className="ww-votes">🗳️ {p.votes}</span>}
                {room.players.some((w) => w.wolfPick === p.id) && <span className="ww-wolfpick">🐺🎯</span>}
                {targeted && <span className="ww-tag">{room.phase === 'vote' ? 'Bạn bỏ phiếu' : me?.role === 'guard' ? '🛡️ Bảo vệ' : me?.role === 'seer' ? '🔮 Đã soi' : '🎯 Đã chọn'}</span>}
                {isHost && room.phase === 'lobby' && p.bot && <span className="ww-kick" onClick={(e) => { e.stopPropagation(); call('ww:removeBot', { id: p.id }); }}>✕</span>}
              </button>
            );
          })}
        </div>
        {room.phase === 'night' && room.me?.role === 'wolf' && room.me.alive && !voice.joined && (
          <button className="ww-wolfmic" onClick={voice.join}>🐺 Bấm để mở mic thì thầm với bầy Sói</button>
        )}
        <div className="ww-actions">
          {room.phase === 'lobby' && (
            <div className="ww-lobby-status">
              <span>👥 {room.players.length}/10 người</span>
              <span className={humansInVoice === humans.length ? 'ok' : ''}>🎧 {humansInVoice}/{humans.length} người đã bật mic</span>
              <small>Mời mọi người vào, cùng nói thử để chắc nghe thấy nhau rồi chủ phòng bắt đầu nhé!</small>
            </div>
          )}
          {room.phase === 'lobby' && (
            <div className={`ww-lobby-btns ${isHost ? 'host' : ''}`}>
              <button className="btn invite-cta" disabled={room.players.length >= 10} onClick={onInvite}>💌 Mời bạn bè</button>
              {isHost && <button className="btn add-bot" disabled={room.players.length >= 10} onClick={() => call('ww:addBot')}>🤖 + Bot</button>}
              <button className={`btn mic-btn ${voice.joined ? 'joined' : 'mic-cta'}`} onClick={onMicTest}>
                {voice.joined ? '🎤 Test lại mic' : '🎤 Test mic'}
              </button>
              {isHost && (
                <button className="btn start-btn" disabled={room.players.length < 5} onClick={() => {
                  const missing = humans.length - humansInVoice;
                  if (missing > 0) confirmBox(`Còn ${missing} người chưa bật mic nên sẽ không nghe/nói được. Vẫn bắt đầu chứ?`, () => call('ww:start'));
                  else call('ww:start');
                }}>▶ Bắt đầu</button>
              )}
            </div>
          )}
          {room.phase === 'end' && isHost && <button className="play-btn big" onClick={() => call('ww:start')}>↻ VÁN MỚI</button>}
          {room.phase === 'day' && me?.alive && (
            <button className={`btn ${room.ready.includes(meId) ? 'primary' : ''}`} onClick={() => call('ww:ready')}>
              {room.ready.includes(meId) ? '✅ Đã sẵn sàng' : '⏩ Bỏ phiếu sớm'} <small>({room.ready.length}/{room.players.filter((p) => p.alive && !p.bot).length})</small>
            </button>
          )}
          {role && room.phase !== 'lobby' && (
            <div className={`ww-mycard ${me?.role}`}>
              <span className="ww-mycard-icon">{role.icon}</span>
              <div><b>Vai của bạn: {role.name}</b><small>{role.desc}</small></div>
            </div>
          )}
        </div>
      </div>
      <WChat room={room} voice={voice} />
    </div>
  );
}

/** Giọng đọc tiếng Việt cho Quản trò (Web Speech). Có thể tắt; nhớ lựa chọn trên máy. */
function useNarratorVoice() {
  const [on, setOn] = useState(() => { try { return localStorage.getItem('xv_ww_tts') !== 'off'; } catch { return true; } });
  const [talking, setTalking] = useState(false);
  const toggle = () => {
    const v = !on;
    setOn(v);
    try { localStorage.setItem('xv_ww_tts', v ? 'on' : 'off'); } catch { /* bỏ qua */ }
    if (!v) window.speechSynthesis?.cancel();
  };
  const say = (text: string) => {
    const ss = window.speechSynthesis;
    if (!on || !ss) return;
    // bỏ emoji trước khi đọc
    const clean = text.replace(/\p{Extended_Pictographic}|️|‍/gu, '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    const vi = ss.getVoices().find((v) => v.lang?.toLowerCase().startsWith('vi'));
    if (vi) u.voice = vi;
    u.lang = 'vi-VN';
    u.rate = 1.02;
    u.pitch = 0.9;
    u.onstart = () => setTalking(true);
    u.onend = () => setTalking(ss.speaking);
    ss.speak(u);
  };
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  return { on, toggle, say, talking };
}

/** Khung Quản trò: chỉ có lời dẫn (người chơi nói chuyện qua mic) + điều khiển thoại. */
function WChat({ room, voice }: { room: WRoom; voice: VoiceUi }) {
  const logRef = useRef<HTMLDivElement>(null);
  const tts = useNarratorVoice();
  const lines = room.chat.filter((m) => m.kind === 'sys');
  const spoken = useRef(-1);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [lines.length]);
  // Đọc các lời dẫn mới (lần đầu mở chỉ đọc câu mới nhất)
  useEffect(() => {
    if (spoken.current < 0) { spoken.current = lines.length - 1; if (lines.length) tts.say(lines[lines.length - 1].text); return; }
    for (let i = spoken.current + 1; i < lines.length; i++) tts.say(lines[i].text);
    spoken.current = lines.length - 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length]);
  const me = room.me;
  const canTalk = room.phase === 'lobby' || room.phase === 'end' || (!!me?.alive && (room.phase !== 'night' || me.role === 'wolf'));
  const voiceHint = !voice.joined ? `${room.voice.length} người đang bật thoại`
    : !canTalk ? (me?.alive === false ? '👻 Người chết chỉ nghe' : '🌙 Ban đêm — mic tạm tắt')
    : room.phase === 'night' ? '🐺 Đang thì thầm với bầy Sói' : voice.micOn ? '🎙️ Mọi người nghe thấy bạn' : '🔇 Mic đang tắt';
  return (
    <aside className="ww-chat">
      <div className="ww-narrator-head">
        <span className={`ww-owl ${tts.talking ? 'talking' : ''}`}>🦉</span>
        <div><b>Quản trò · Cụ Cú</b><small>{tts.talking ? 'đang dẫn truyện…' : 'người dẫn chuyện'}</small></div>
        <button className="icon-btn ww-tts" onClick={tts.toggle} title={tts.on ? 'Tắt giọng đọc' : 'Bật giọng đọc'} aria-label="Giọng đọc">{tts.on ? '🔊' : '🔇'}</button>
      </div>
      <div className="ww-chat-log" ref={logRef}>
        {lines.map((m, i) => (
          <div key={i} className={`ww-say ${i === lines.length - 1 ? 'latest' : ''}`}>{m.text}</div>
        ))}
      </div>
      <div className="ww-voice">
        {!voice.joined
          ? <button className="btn small primary" onClick={voice.join}>🎤 Bật thoại</button>
          : <>
              <button className={`btn small ${voice.micOn ? 'primary' : ''}`} disabled={!canTalk} onClick={() => voice.setMicOn(!voice.micOn)}>{voice.micOn && canTalk ? '🎙️ Mic bật' : '🔇 Mic tắt'}</button>
              <button className="btn small" onClick={voice.leave}>Rời thoại</button>
            </>}
        <small>{voiceHint}</small>
      </div>
    </aside>
  );
}

/** Mời bạn bè vào làng (đang ở phòng chờ) */
function InviteFriends({ room, onClose }: { room: WRoom; onClose: () => void }) {
  const friends = useStore((st) => st.friends.friends);
  const [sent, setSent] = useState<Set<number>>(new Set());
  useEffect(() => { call('friend:list', {}, { silent: true }).then((r) => r.ok && set({ friends: { friends: r.friends, incoming: r.incoming } })); }, []);
  const inRoom = new Set(room.players.map((p) => p.id));
  const list = [...friends].sort((a, b) => Number(!!b.online) - Number(!!a.online));
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal ww-invite-modal">
        <div className="modal-head"><h2>💌 Mời bạn bè vào làng</h2><button className="icon-btn" onClick={onClose} aria-label="Đóng">✕</button></div>
        <div className="modal-body">
          {list.length === 0 ? <p className="empty">Bạn chưa có bạn bè nào — kết bạn ở mục Cư dân nhé!</p> : list.map((f) => (
            <div key={f.id} className="friend-row">
              <span className={`dot ${f.online ? 'on' : ''}`} />
              <span className="friend-name">{f.name} <small>Lv{f.level} · {f.online ? 'đang online' : 'offline'}</small></span>
              {inRoom.has(f.id) ? <span className="chip ok">Đã vào làng</span>
                : <button className="btn small primary" disabled={!f.online || sent.has(f.id)} onClick={async () => {
                    const r = await call('ww:invite', { to: f.id });
                    if (r.ok) setSent((x) => new Set(x).add(f.id));
                  }}>{sent.has(f.id) ? '✓ Đã mời' : 'Mời'}</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Lời mời vào làng bật lên ở bất cứ đâu trong game */
export function WerewolfInvite() {
  const inv = useStore((st) => st.wwInvite);
  if (!inv) return null;
  const accept = () => {
    send('ww:leave');
    send('tw:leave');
    set({ wwInvite: null, wwJoinId: inv.roomId, panel: 'werewolf' });
  };
  return (
    <div className="ww-invite-pop" role="dialog" aria-label="Lời mời Ma Sói">
      <span className="ww-invite-ic">🐺</span>
      <div><b>{inv.fromName}</b> mời bạn vào làng Ma Sói<small>{inv.count} người đang chờ trong phòng</small></div>
      <div className="ww-invite-btns">
        <button className="btn small primary" onClick={accept}>Vào làng ngay</button>
        <button className="btn small" onClick={() => set({ wwInvite: null })}>Để sau</button>
      </div>
    </div>
  );
}
