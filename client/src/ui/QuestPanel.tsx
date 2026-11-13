import { useEffect, useState } from 'react';
import { ITEMS } from '../../../shared/catalog';
import { CHEST_REWARD, DAILY_QUESTS, QuestReward, QuestState } from '../../../shared/quests';
import { call } from '../net';
import { fmt, set, toast, useStore } from '../store';
import { Modal } from './common';

/** Số món quà đang chờ nhận (nhiệm vụ xong mà chưa nhận + rương). */
export function questClaimable(q: QuestState | null) {
  if (!q) return 0;
  const done = DAILY_QUESTS.filter((d) => (q.progress[d.id] ?? 0) >= d.goal && !q.claimed.includes(d.id)).length;
  const chest = !q.chest && DAILY_QUESTS.every((d) => q.claimed.includes(d.id)) ? 1 : 0;
  return done + chest;
}

function RewardChips({ r }: { r: QuestReward }) {
  return (
    <span className="qs-rewards">
      {r.coins ? <span className="qs-rw qs-coin">💰 {fmt(r.coins)}</span> : null}
      {Object.entries(r.items ?? {}).map(([id, n]) => <span key={id} className="qs-rw">{ITEMS[id]?.icon ?? '🎁'} ×{n}</span>)}
      {r.xp ? <span className="qs-rw qs-xp">⭐ {r.xp} XP</span> : null}
    </span>
  );
}

/** Đếm ngược tới 0h (giờ Việt Nam) — lúc nhiệm vụ làm mới. */
function useResetIn() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const vn = now + 7 * 3600_000;
  const left = 86400_000 - (vn % 86400_000);
  const h = Math.floor(left / 3600_000), m = Math.floor((left % 3600_000) / 60_000);
  return `${h} giờ ${m} phút`;
}

/** Bảng Nhiệm vụ hằng ngày: làm xong nhận quà, nhận đủ thì mở rương bất ngờ. */
export function QuestPanel() {
  const q = useStore((s) => s.quests);
  const [busy, setBusy] = useState<string | null>(null);
  const resetIn = useResetIn();
  useEffect(() => { call('quest:list', {}, { silent: true }).then((r) => r.ok && set({ quests: r.state as never })); }, []);

  const claimedN = q ? DAILY_QUESTS.filter((d) => q.claimed.includes(d.id)).length : 0;
  const allClaimed = claimedN === DAILY_QUESTS.length;

  async function claim(id: string) {
    setBusy(id);
    const r = await call('quest:claim', { id });
    setBusy(null);
    if (r.ok) toast('🎁 Đã nhận quà nhiệm vụ!', 'success');
  }
  async function openChest() {
    setBusy('chest');
    const r = await call('quest:chest');
    setBusy(null);
    if (r.ok) {
      const it = r.item ? ITEMS[r.item as string] : null;
      toast(`🎉 Rương quà: +${fmt(CHEST_REWARD.coins)} xu${it ? ` và ${it.icon} ${it.name}!` : ''}`, 'success');
    }
  }

  return (
    <Modal title="📜 Nhiệm vụ hằng ngày" onClose={() => set({ panel: null })} wide className="quest-modal">
      <div className="qs-head">
        <div className="qs-progress">
          <span><b>{claimedN}/{DAILY_QUESTS.length}</b> nhiệm vụ đã nhận quà</span>
          <div className="qs-bar"><i style={{ width: `${(claimedN / DAILY_QUESTS.length) * 100}%` }} /></div>
        </div>
        <span className="qs-reset">🔄 Làm mới sau {resetIn}</span>
      </div>
      {!q ? <p className="empty">Đang tải…</p> : (
        <div className="qs-list">
          {DAILY_QUESTS.map((d) => {
            const v = Math.min(d.goal, q.progress[d.id] ?? 0);
            const done = v >= d.goal;
            const claimed = q.claimed.includes(d.id);
            return (
              <div key={d.id} className={`qs-item ${done ? 'done' : ''} ${claimed ? 'claimed' : ''}`}>
                <span className="qs-icon">{d.icon}</span>
                <div className="qs-main">
                  <b>{d.title}</b>
                  <small>{d.hint}</small>
                  <div className="qs-line">
                    <div className="qs-bar sm"><i style={{ width: `${(v / d.goal) * 100}%` }} /></div>
                    <span className="qs-count">{v}/{d.goal}</span>
                  </div>
                </div>
                <div className="qs-side">
                  <RewardChips r={d.reward} />
                  {claimed ? <span className="qs-got">✓ Đã nhận</span>
                    : <button className="btn small qs-claim" disabled={!done || busy === d.id} onClick={() => claim(d.id)}>{done ? '🎁 Nhận quà' : 'Chưa xong'}</button>}
                </div>
              </div>
            );
          })}
          <div className={`qs-chest ${allClaimed && !q.chest ? 'ready' : ''} ${q.chest ? 'opened' : ''}`}>
            <span className="qs-chest-ic">{q.chest ? '📭' : '🎁'}</span>
            <div className="qs-main">
              <b>Rương quà cuối ngày</b>
              <small>Nhận quà đủ {DAILY_QUESTS.length} nhiệm vụ để mở: {fmt(CHEST_REWARD.coins)} xu, {CHEST_REWARD.xp} XP và một món đồ bất ngờ bạn chưa có!</small>
            </div>
            {q.chest ? <span className="qs-got">✓ Đã mở</span>
              : <button className="btn qs-claim big" disabled={!allClaimed || busy === 'chest'} onClick={openChest}>{allClaimed ? '✨ Mở rương' : `🔒 ${claimedN}/${DAILY_QUESTS.length}`}</button>}
          </div>
        </div>
      )}
    </Modal>
  );
}
