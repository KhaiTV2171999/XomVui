import { SERVER_URL } from '../config';
import { FormEvent, useState } from 'react';
import { set } from '../store';
import { AvatarPreview } from './common';

const DEMO = [
  { skin: 0, hair: 5, hairColor: 5, top: 'cl:tee_pink', bottom: 'cl:shorts_khaki', hat: 'cl:flower_crown', acc: null },
  { skin: 2, hair: 1, hairColor: 0, top: 'cl:hoodie_yellow', bottom: 'cl:pants_denim', hat: 'cl:cap_blue', acc: null },
  { skin: 1, hair: 2, hairColor: 3, top: 'cl:aodai_red', bottom: 'cl:pants_black', hat: 'cl:nonla', acc: null },
];

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await fetch(`${SERVER_URL}/api/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Có lỗi');
      localStorage.setItem('xv_token', data.token);
      set({ token: data.token });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không kết nối được máy chủ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="clouds" aria-hidden />
      <div className="auth-card">
        <div className="logo">
          <span className="logo-main">Xóm Vui</span>
          <span className="logo-sub">Thế giới nhỏ của bạn</span>
        </div>
        <div className="auth-avatars">
          {DEMO.map((a, i) => <AvatarPreview key={i} appearance={a} size={110} className={`bob bob-${i}`} />)}
        </div>
        <form onSubmit={submit}>
          <input placeholder="Tên nhân vật" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={16} autoFocus />
          <input placeholder="Mật khẩu" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="form-error">{error}</div>}
          <button className="btn primary big" disabled={busy}>
            {mode === 'login' ? 'Vào chơi' : 'Tạo tài khoản'}
          </button>
        </form>
        <button className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
        </button>
      </div>
    </div>
  );
}
