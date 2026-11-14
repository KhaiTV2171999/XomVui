import { ITEMS } from '../../../shared/catalog';
import { AreaId, areaCost, FARM_AREAS, OBSTACLES, obstacleActive } from '../../../shared/farmExpand';
import { ECON } from '../../../shared/catalog';
import { call } from '../net';
import { confirmBox, fmt, set, toast, useStore } from '../store';
import { Modal } from './common';

/** Bảng Mở rộng nông trại: điều kiện mở từng khu + hướng dẫn dọn chướng ngại lấy gỗ, đá. */
export function ExpandPanel() {
  useStore((s) => s.catalogVer);
  const me = useStore((s) => s.me)!;
  const farm = useStore((s) => s.farm);
  const pick = useStore((s) => s.expandArea);
  const areas = farm?.areas ?? [];
  const wood = me.inventory['mat:wood'] ?? 0;
  const stone = me.inventory['mat:stone'] ?? 0;
  const left = OBSTACLES.filter((o) => obstacleActive(o.id, areas, farm?.cleared)).length;

  async function unlock(id: AreaId) {
    const a = FARM_AREAS.find((x) => x.id === id)!;
    const c = areaCost(id);
    confirmBox(`Mở ${a.icon} ${a.name} với ${fmt(c.coins)} xu, ${c.wood} gỗ và ${c.stone} đá?`, async () => {
      const r = await call('farm:unlockArea', { id });
      if (r.ok) { toast(`🎉 Đã mở ${a.name}!`, 'success'); set({ panel: null }); }
    });
  }

  return (
    <Modal title="🗺️ Mở rộng nông trại" onClose={() => set({ panel: null, expandArea: null })} className="expand-modal">
      <div className="ex-mats">
        <span className="ex-mat">{ITEMS['mat:wood'].icon} Gỗ <b>{wood}</b></span>
        <span className="ex-mat">{ITEMS['mat:stone'].icon} Đá <b>{stone}</b></span>
        <button className="btn small" onClick={() => set({ panel: 'shop', shopTab: 'mat' })}>🛒 Mua gỗ, đá</button>
        <small>Dọn đá, gốc cây, bụi rậm trên nông trại để lấy thêm · còn {left} chỗ dọn được · mọc lại sau {ECON.obstacleRegrowH} giờ</small>
      </div>
      <div className="ex-list">
        {FARM_AREAS.map((a) => {
          const c = areaCost(a.id);
          const open = areas.includes(a.id);
          const ok = { lv: me.level >= c.level, coin: me.coins >= c.coins, wood: wood >= c.wood, stone: stone >= c.stone };
          const all = ok.lv && ok.coin && ok.wood && ok.stone;
          return (
            <div key={a.id} className={`ex-area ${open ? 'open' : ''} ${pick === a.id ? 'picked' : ''}`}>
              <span className="ex-icon">{a.icon}</span>
              <div className="ex-main">
                <b>{a.name}</b>
                <small>{a.desc}</small>
                {!open && (
                  <div className="ex-reqs">
                    <span className={ok.lv ? 'ok' : 'no'}>⭐ Cấp {c.level}</span>
                    <span className={ok.coin ? 'ok' : 'no'}>💰 {fmt(c.coins)}</span>
                    <span className={ok.wood ? 'ok' : 'no'}>{ITEMS['mat:wood'].icon} {wood}/{c.wood}</span>
                    <span className={ok.stone ? 'ok' : 'no'}>{ITEMS['mat:stone'].icon} {stone}/{c.stone}</span>
                  </div>
                )}
              </div>
              {open ? <span className="ex-done">✓ Đã mở</span>
                : <button className="btn ex-btn" disabled={!all} onClick={() => unlock(a.id)}>{all ? '🔓 Mở khu' : '🔒 Chưa đủ'}</button>}
            </div>
          );
        })}
      </div>
      <p className="ex-tip">💡 Chạm vào đá / gốc cây / bụi rậm trên nông trại để dọn. Bụi rậm đôi khi rơi ra hạt giống!</p>
    </Modal>
  );
}
