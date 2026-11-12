import { set } from '../store';
import { Modal } from './common';

const GAMES = [
  { id: 'baucua', icon: '🎲', name: 'Bầu Cua Tôm Cá', desc: 'Bàn chung cho mọi người, đặt cược 20 giây mỗi ván.', color: '#ffe0e6', ready: true },
  { id: 'tienlen', icon: '🃏', name: 'Tiến Lên Miền Nam', desc: 'Tạo bàn 4 người, thiếu người thì thêm bot.', color: '#dff0ff', ready: true },
  { id: 'phom', icon: '🀄', name: 'Phỏm', desc: 'Đang xây dựng.', color: '#f1f1f1', ready: false },
  { id: 'caro', icon: '⭕', name: 'Cờ Caro', desc: 'Đang xây dựng.', color: '#f1f1f1', ready: false },
] as const;

/** Sảnh "Khu giải trí": chọn trò chơi. */
export function GamesPanel() {
  return (
    <Modal title="🎪 Khu giải trí" onClose={() => set({ panel: null })} wide>
      <div className="games-grid">
        {GAMES.map((g) => (
          <button
            key={g.id}
            className={`game-card ${g.ready ? '' : 'soon'}`}
            style={{ background: g.color }}
            disabled={!g.ready}
            onClick={() => g.ready && set({ panel: g.id as 'baucua' | 'tienlen' })}
          >
            <span className="game-icon">{g.icon}</span>
            <span className="game-name">{g.name}</span>
            <span className="game-desc">{g.desc}</span>
            <span className="game-cta">{g.ready ? 'Chơi ngay ▶' : 'Sắp ra mắt'}</span>
          </button>
        ))}
      </div>
      <p className="hint">Chỉ dùng xu ảo trong game, không đổi ra tiền thật.</p>
    </Modal>
  );
}
