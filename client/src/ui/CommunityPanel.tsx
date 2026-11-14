// Cư dân, Bảng tin, dải chạy chữ và thông báo lao động công ích
import { useEffect, useState } from 'react';
import type { Appearance } from '../../../shared/catalog';
import { call } from '../net';
import { confirmBox, fmt, get, NewsItem, set, toast, useStore } from '../store';
import { AvatarPreview, Modal } from './common';

interface Resident {
  id: number; name: string; level: number; appearance: Appearance; joined: number;
  online: boolean; zone: string | null; friend: string | null;
}

const ZONE_NAMES: Record<string, string> = { park: 'Công viên', fun: 'Khu vui chơi' };
const zoneLabel = (z: string | null) => (!z ? '' : z.startsWith('farm:') ? 'ở nông trại' : `ở ${ZONE_NAMES[z] ?? z}`);

function ago(at: number) {
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}

/** Bảng "Cư dân": danh sách cư dân (chạm để xem / kết bạn) và Bảng tin cộng đồng. */
export function ResidentsPanel() {
  const [tab, setTab] = useState<'list' | 'news'>(() => (get().resTab === 'news' ? 'news' : 'list'));
  const newsUnread = useStore((s) => s.newsUnread);
  useEffect(() => { if (tab === 'news') set({ newsUnread: 0 }); }, [tab, newsUnread]);

  return (
    <Modal title="🏘️ Cư dân Xóm Vui" onClose={() => set({ panel: null })} wide className="res-modal">
      <div className="res-tabs">
        <button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>👥 Cư dân</button>
        <button className={tab === 'news' ? 'on' : ''} onClick={() => setTab('news')}>
          📰 Bảng tin{newsUnread > 0 && tab !== 'news' && <span className="badge static">{newsUnread}</span>}
        </button>
      </div>
      {tab === 'list' ? <ResidentList /> : <NewsBoard />}
    </Modal>
  );
}

function ResidentList() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ residents: Resident[]; total: number; online: number } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      call('residents:list', { q }, { silent: true }).then((r) => r.ok && setData(r as never));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="res-body">
      <div className="res-head">
        <input className="res-search" placeholder="🔍 Tìm cư dân theo tên..." value={q} onChange={(e) => setQ(e.target.value)} />
        {data && <span className="res-count">🟢 {data.online} online · {data.total} cư dân</span>}
      </div>
      {!data ? <p className="empty">Đang tải…</p>
        : data.residents.length === 0 ? <p className="empty">Không tìm thấy cư dân nào</p>
        : (
          <div className="res-scroll">
            {([['🟢 Đang online', data.residents.filter((r) => r.online)], ['🏡 Cư dân khác', data.residents.filter((r) => !r.online)]] as const).map(([title, list]) => list.length > 0 && (
              <section key={title} className="res-sec">
                <h4 className="res-sec-title">{title} <small>{list.length}</small></h4>
                <div className="res-grid">
                  {list.map((r) => <ResidentCard key={r.id} r={r} onFriend={(st) => setData((d) => d && { ...d, residents: d.residents.map((x) => (x.id === r.id ? { ...x, friend: st } : x)) })} />)}
                </div>
              </section>
            ))}
          </div>
        )}
    </div>
  );
}

/** Thẻ cư dân: chân dung, cấp, đang ở đâu, nút kết bạn bấm được ngay. */
function ResidentCard({ r, onFriend }: { r: Resident; onFriend: (st: string) => void }) {
  const [busy, setBusy] = useState(false);
  // Chân dung: bỏ xe / đồ cầm cho khung ảnh gọn, chỉ lấy đầu + vai
  const face = { ...r.appearance, ride: null, hand: null };
  const me = r.friend === 'me';
  return (
    <div role="button" tabIndex={0} className={`res-card ${r.online ? 'on' : ''} ${me ? 'me' : ''}`}
      onClick={() => !me && set({ playerCard: r.id })} onKeyDown={(e) => e.key === 'Enter' && !me && set({ playerCard: r.id })}>
      <div className="res-ava">
        <div className="res-face"><AvatarPreview appearance={face} size={104} /></div>
        <span className={`dot ${r.online ? 'on' : ''}`} />
      </div>
      <div className="res-info">
        <b>{r.name}{me && <small className="res-me"> · bạn</small>}</b>
        <span className="res-meta"><span className="res-lv">Lv{r.level}</span>{r.online ? (zoneLabel(r.zone) || 'đang online') : 'offline'}</span>
      </div>
      <div className="res-act" onClick={(e) => e.stopPropagation()}>
        {r.friend === 'accepted' ? <span className="res-tag ok" title="Bạn bè">🤝</span>
          : r.friend === 'pending' ? <span className="res-tag">Đã mời</span>
          : !me ? <button className="res-add" disabled={busy} title="Kết bạn" onClick={async () => {
              setBusy(true);
              const res = await call('friend:request', { userId: r.id });
              setBusy(false);
              if (res.ok) onFriend(res.accepted ? 'accepted' : 'pending');
            }}>➕</button> : null}
      </div>
    </div>
  );
}

function NewsBoard() {
  const news = useStore((s) => s.news);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    call('news:list', {}, { silent: true }).then((r) => {
      if (r.ok) set({ news: r.news as NewsItem[], newsUnread: 0 });
      setLoaded(true);
    });
  }, []);
  const bails = useStore((s) => s.bails);
  const meId = useStore((s) => s.me?.id);
  const bailBox = bails.length > 0 && (
    <div className="bail-list">
      <h4>🙏 Đang xin bảo lãnh</h4>
      {bails.map((b) => (
        <div key={b.id} className="bail-row">
          <span className="bail-ic">🧹</span>
          <div className="bail-info"><b>{b.name}</b><small>còn {Math.max(1, Math.ceil((b.until - Date.now()) / 60000))} phút lao động công ích</small></div>
          {b.id === meId ? <span className="chip">Lời xin của bạn</span>
            : <button className="btn small bail-pay" onClick={() => confirmBox(`Nộp ${fmt(b.price)} xu bảo lãnh cho ${b.name}? (tiền nộp cho hệ thống)`, async () => {
                const r = await call('bail:pay', { id: b.id });
                if (r.ok) toast(`🤝 Đã bảo lãnh cho ${b.name}`, 'success');
              })}>🤝 Bảo lãnh · {fmt(b.price)}</button>}
        </div>
      ))}
    </div>
  );
  if (!loaded && !news.length) return <>{bailBox}<p className="empty">Đang tải…</p></>;
  if (!news.length) return <>{bailBox}<p className="empty">Bảng tin chưa có gì 📭</p></>;
  // (Tin quá 3 ngày được server tự xoá)
  return (
    <div className="news-list">
      {bailBox}
      {news.map((n) => (
        <div key={n.id} className={`news-item ${n.kind}`}>
          <span className="news-icon">{n.kind === 'police' ? '🚨' : n.kind === 'newbie' ? '🎉' : n.kind === 'bail' ? '🤝' : '📢'}</span>
          <div className="news-text">
            <p>{n.text.replace(/^(🚨|🎉|📢|🙏|🤝)\s*/u, '')}</p>
            <small>{ago(n.at)}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Dải thông báo khi đang lao động công ích (đếm ngược). */
export function JailBanner() {
  const until = useStore((s) => s.me?.jailUntil ?? null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  const asked = useStore((s) => s.bails.some((b) => b.id === s.me?.id));
  if (!until || until <= now) return null;
  const s = Math.ceil((until - now) / 1000);
  const mm = Math.floor(s / 60), ss = s % 60;
  return (
    <div className="jail-banner" role="status">
      🧹 Đang lao động công ích ở Công viên · còn <b>{mm}:{String(ss).padStart(2, '0')}</b>
      <small>Không được về nhà hay vào khu giải trí</small>
      {asked ? <small className="bail-sent">🙏 Đã xin bảo lãnh — chờ cư dân giúp đỡ</small>
        : <button className="btn tiny bail-ask" onClick={async () => {
            const r = await call('bail:request');
            if (r.ok) toast(`🙏 Đã đăng lời xin bảo lãnh (${fmt(r.price as number)} xu) lên Bảng tin`, 'success');
          }}>🙏 Xin bảo lãnh</button>}
    </div>
  );
}

/** Dải chạy chữ Bảng tin ở giữa phía trên màn hình — chạm để mở Bảng tin. */
const TICKER_PLAYS = 3;
/** Tin chỉ lên dải chạy chữ trong 1 giờ đầu (sau đó vẫn xem được trong Bảng tin). */
const TICKER_MAX_AGE = 3600_000;
const PLAYS_KEY = 'xv_ticker_plays';
function loadPlays(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(PLAYS_KEY) || '{}'); } catch { return {}; }
}
function savePlays(p: Record<string, number>) {
  try { localStorage.setItem(PLAYS_KEY, JSON.stringify(p)); } catch { /* bỏ qua */ }
}

/** Dải chạy chữ Bảng tin ở giữa phía trên màn hình — mỗi tin chạy 3 lượt rồi tự ẩn (vẫn còn trong Bảng tin). */
export function NewsTicker() {
  const news = useStore((s) => s.news);
  const panel = useStore((s) => s.panel);
  const [plays, setPlays] = useState<Record<string, number>>(loadPlays);
  useEffect(() => {
    call('news:list', {}, { silent: true }).then((r) => { if (r.ok && !get().news.length) set({ news: r.news as NewsItem[] }); });
  }, []);
  // Chỉ tin trong 1 giờ gần nhất, chưa chạy đủ 3 lượt (tối đa 4 tin một lúc).
  // Danh sách tin đang chạy được "chốt" lại: tin mới chờ vòng sau, không làm vòng đang chạy bị khởi động lại.
  const fresh = news.filter((n) => Date.now() - n.at < TICKER_MAX_AGE && (plays[n.id] ?? 0) < TICKER_PLAYS);
  const [lockedIds, setLockedIds] = useState<string>('');
  const locked = lockedIds ? lockedIds.split(',') : [];
  const lockedItems = fresh.filter((n) => locked.includes(String(n.id)));
  const items = lockedItems.length ? lockedItems : fresh.slice(0, 4);
  const itemsKey = items.map((n) => n.id).join(',');
  useEffect(() => { if (itemsKey !== lockedIds) setLockedIds(itemsKey); }, [itemsKey, lockedIds]);
  if (!items.length || panel) return null;
  const text = items.map((n) => n.text).join('     •     ');
  const dur = Math.max(18, text.length * 0.18); // giây — tin dài chạy lâu hơn, tốc độ đọc đều
  // Mỗi vòng chạy xong = mỗi tin đang hiện được tính thêm 1 lượt
  const onLap = () => {
    setPlays((prev) => {
      const next = { ...prev };
      for (const n of items) next[n.id] = (next[n.id] ?? 0) + 1;
      // dọn bớt tin cũ khỏi bộ nhớ
      const keep = new Set(news.map((n) => String(n.id)));
      for (const k of Object.keys(next)) if (!keep.has(k)) delete next[k];
      savePlays(next);
      return next;
    });
    setLockedIds(''); // hết vòng: lấy lại danh sách (tin mới được vào)
  };
  return (
    <button className="news-ticker" onClick={() => set({ panel: 'residents', resTab: 'news', newsUnread: 0 })} aria-label="Mở Bảng tin">
      <span className="news-ticker-tag">📰<span className="news-ticker-label"> Bảng tin</span></span>
      <span className="news-ticker-win">
        <span key={itemsKey} className="news-ticker-track" style={{ animationDuration: `${dur}s` }} onAnimationIteration={onLap}>
          <span>{text}</span><span aria-hidden>{text}</span>
        </span>
      </span>
    </button>
  );
}
