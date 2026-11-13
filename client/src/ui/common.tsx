import { Component, memo, ReactNode, useEffect, useRef } from 'react';
import type { Appearance } from '../../../shared/catalog';
import { avatarBounds, drawAvatar } from '../avatar/draw';

/** Hình nhân vật: chỉ vẽ lại canvas khi ngoại hình / cỡ thật sự đổi (không vẽ lại vì object mới y hệt). */
export const AvatarPreview = memo(AvatarPreviewImpl, (a, b) =>
  a.size === b.size && a.className === b.className && JSON.stringify(a.appearance) === JSON.stringify(b.appearance));

function AvatarPreviewImpl({ appearance, size = 120, className = '' }: { appearance: Appearance; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const b = avatarBounds(appearance);
  const w = Math.round((size * b.w) / b.h);
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    const k = (size / b.h) * dpr;
    ctx.save();
    ctx.translate(-b.x * k, -b.y * k);
    drawAvatar(ctx, appearance, k);
    ctx.restore();
  }, [appearance, size, w, b.x, b.y, b.h]);
  return <canvas ref={ref} className={className} style={{ width: w, height: size }} />;
}

export function Modal({ title, onClose, children, wide, className = '' }: {
  title: ReactNode; onClose?: () => void; children: ReactNode; wide?: boolean; className?: string;
}) {
  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${wide ? 'wide' : ''} ${className}`}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && <button className="icon-btn" onClick={onClose} aria-label="Đóng">✕</button>}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map(([k, label]) => (
        <button key={k} className={`tab ${value === k ? 'active' : ''}`} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

/** Bắt lỗi của một bảng: bảng đó hiện thông báo, phần còn lại của game vẫn chạy. */
export class PanelBoundary extends Component<{ children: ReactNode; onClose: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('[panel]', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Modal title="⚠️ Có lỗi" onClose={this.props.onClose}>
        <p>Bảng này gặp lỗi và đã được đóng an toàn. Hãy tải lại trang (F5) rồi thử lại.</p>
        <p className="hint">{this.state.error.message}</p>
      </Modal>
    );
  }
}

export function Coin({ n }: { n: number }) {
  return <span className="coin">💰 {n.toLocaleString('vi-VN')}</span>;
}
