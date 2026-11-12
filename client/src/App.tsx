import { useEffect } from 'react';
import { connect } from './net';
import { useStore } from './store';
import { AuthScreen } from './ui/AuthScreen';
import { CreateCharacter } from './ui/Wardrobe';
import { HUD } from './ui/HUD';
import { PhaserGame } from './game/PhaserGame';

export function App() {
  const token = useStore((s) => s.token);
  const me = useStore((s) => s.me);
  const fatal = useStore((s) => s.fatal);

  useEffect(() => {
    if (token) connect(token);
  }, [token]);

  if (fatal) {
    return (
      <div className="center-screen">
        <div className="auth-card">
          <h2>⚠️ {fatal}</h2>
          <button className="btn primary big" onClick={() => location.reload()}>Kết nối lại</button>
        </div>
      </div>
    );
  }
  if (!token) return <AuthScreen />;
  if (!me) return <div className="center-screen"><div className="loader">🌱 Đang vào Xóm Vui...</div></div>;
  if (!me.created) return <CreateCharacter />;
  return (
    <div className="game">
      <PhaserGame />
      <HUD />
    </div>
  );
}
