import { travel } from '../net';
import { set, useStore } from '../store';
import { Modal } from './common';
import { WorldMap } from './WorldMap';

/** Bản đồ chọn điểm đến (mở khi đứng ở trạm xe buýt hoặc bấm nút Bản đồ). */
export function BusStopPanel({ title = '🚌 Trạm xe buýt · Chọn điểm đến' }: { title?: string }) {
  const friends = useStore((s) => s.friends.friends);
  const go = (id: string) => { set({ panel: null }); travel(id); };
  const extra = friends.slice(4);
  return (
    <Modal title={title} onClose={() => set({ panel: null })} wide className="map-modal">
      <WorldMap onPick={go} />
      {extra.length > 0 && (
        <div className="map-more">
          <span>Nông trại bạn bè khác:</span>
          {extra.map((f) => (
            <button key={f.id} className="btn small" onClick={() => go(`farm:${f.id}`)}>🏡 {f.name}</button>
          ))}
        </div>
      )}
    </Modal>
  );
}
