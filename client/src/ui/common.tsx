import { ReactNode, useEffect, useRef } from 'react';
import type { Appearance } from '../../../shared/catalog';
import { AV_H, AV_W, drawAvatar } from '../avatar/draw';

export function AvatarPreview({ appearance, size = 120, className = '' }: { appearance: Appearance; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.round((size * AV_W) / AV_H);
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    drawAvatar(ctx, appearance, (size / AV_H) * dpr);
  }, [appearance, size, w]);
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

export function Coin({ n }: { n: number }) {
  return <span className="coin">💰 {n.toLocaleString('vi-VN')}</span>;
}
