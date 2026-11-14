import { useEffect, useState } from 'react';
import { ITEMS } from '../../../shared/catalog';
import { MACHINES } from '../../../shared/workshop';
import { fmtTime } from '../game/farmUtil';
import { call } from '../net';
import { confirmBox, fmt, serverNow, set, toast, useStore } from '../store';
import { sfx } from '../sound';
import { Modal } from './common';

/** Xưởng chế biến: mua máy, bỏ nguyên liệu, chờ rồi lấy hàng (bán giá cao / giao đơn). */
export function WorkshopPanel() {
  useStore((s) => s.catalogVer);
  const me = useStore((s) => s.me)!;
  const farm = useStore((s) => s.farm);
  const focus = useStore((s) => s.workshopMachine);
  const shown = focus ? MACHINES.filter((m) => m.id === focus) : MACHINES;
  const title = shown.length === 1 ? `${shown[0].icon} ${shown[0].name}` : '🏭 Xưởng chế biến';
  const [busy, setBusy] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const inv = me.inventory;
  const yard = farm?.areas?.includes('yard');
  const now = serverNow();

  async function act(ev: string, id: string, ok: (r: Record<string, unknown>) => void) {
    setBusy(id);
    const r = await call(ev, { id });
    setBusy(null);
    if (r.ok) ok(r);
  }

  return (
    <Modal title={title} onClose={() => set({ panel: null, workshopMachine: null })} wide={shown.length > 1} className={`ws-modal ${shown.length === 1 ? 'single' : ''}`}>
      {!yard ? (
        <div className="po-lock">
          <span>🔒</span>
          <div><b>Cần mở Sân xưởng trước</b><small>Mở trong 🗺️ Mở rộng nông trại</small></div>
          <button className="btn primary" onClick={() => set({ panel: 'expand', expandArea: 'yard' })}>🗺️ Mở rộng</button>
        </div>
      ) : (
        <>
          {shown.length > 1 && <p className="od-intro">Bỏ nguyên liệu vào máy, chờ xong rồi lấy hàng — hàng chế biến bán giá cao và hay xuất hiện trong đơn hàng.</p>}
          <div className="ws-grid">
            {shown.map((m) => {
              const st = farm?.machines?.[m.id];
              const out = ITEMS[m.output];
              const job = st?.job;
              const ready = !!job && job.done <= now;
              const enough = Object.entries(m.inputs).every(([it, n]) => (inv[it] ?? 0) >= n);
              const locked = me.level < m.level;
              return (
                <div key={m.id} className={`ws-card ${st ? 'own' : ''} ${ready ? 'ready' : ''}`}>
                  <div className="ws-head"><span className="ws-ic">{m.icon}</span><div><b>{m.name}</b><small>⏱ {fmtTime(m.sec * 1000)} · +{m.xp} XP</small></div></div>
                  <div className="ws-recipe">
                    {Object.entries(m.inputs).map(([it, n]) => (
                      <span key={it} className={`od-item ${(inv[it] ?? 0) >= n ? 'ok' : 'no'}`} title={ITEMS[it]?.name}><i>{ITEMS[it]?.icon}</i>{Math.min(inv[it] ?? 0, n)}/{n}</span>
                    ))}
                    <span className="ws-arrow">→</span>
                    <span className="od-item plain" title={out.name}><i>{out.icon}</i>{out.name}</span>
                  </div>
                  <small className="ws-sell">Bán {fmt(out.sell ?? 0)} xu · đang có {inv[m.output] ?? 0}</small>
                  {!st ? (
                    locked ? <span className="lock-tag">🔒 Cấp {m.level}</span> : (
                      <button className="btn ws-btn buy" disabled={busy === m.id} onClick={() => confirmBox(`Mua ${m.icon} ${m.name}: ${fmt(m.cost.coins)} xu, ${m.cost.wood} gỗ, ${m.cost.stone} đá?`,
                        () => act('machine:buy', m.id, () => { sfx('levelup'); toast(`🏭 Đã lắp ${m.name}!`, 'success'); }))}>
                        💰 {fmt(m.cost.coins)} · 🌲{m.cost.wood} · ⛰️{m.cost.stone}
                      </button>
                    )
                  ) : ready ? (
                    <button className="btn ws-btn go" disabled={busy === m.id} onClick={() => act('machine:collect', m.id, () => { sfx('harvest'); toast(`${out.icon} +1 ${out.name}`, 'success'); })}>🧺 Lấy {out.name}</button>
                  ) : job ? (
                    <div className="ws-prog"><div className="qs-bar"><i style={{ width: `${Math.min(100, ((now - job.at) / (job.done - job.at)) * 100)}%` }} /></div><small>⏳ còn {fmtTime(job.done - now)}</small></div>
                  ) : (
                    <button className="btn ws-btn go" disabled={!enough || busy === m.id} onClick={() => act('machine:start', m.id, () => sfx('plant'))}>{enough ? '▶ Bắt đầu' : 'Thiếu nguyên liệu'}</button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}
