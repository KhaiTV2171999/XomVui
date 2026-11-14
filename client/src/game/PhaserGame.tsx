import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { WorldScene } from './WorldScene';
import { BusScene } from './BusScene';
import { DPR, IS_MOBILE } from './dpr';
import { setFpsBooster } from './fps';
import { useStore } from '../store';

/** Khung hình/giây khi đứng yên trên điện thoại */
const IDLE_FPS = 30;

export function PhaserGame() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current!;
    // Vẽ ở độ phân giải thật của màn hình (DPR) rồi thu nhỏ bằng CSS → nét trên màn Retina/2K.
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: el,
      backgroundColor: '#8fd18b',
      scale: {
        mode: Phaser.Scale.NONE,
        width: el.clientWidth * DPR,
        height: el.clientHeight * DPR,
        zoom: 1 / DPR,
      },
      render: { antialias: true, roundPixels: false, powerPreference: IS_MOBILE ? 'low-power' : 'default' },
      // Điện thoại: mặc định 30 khung hình/giây (đứng yên vẫn mượt), tự lên 60 khi chạm / đang đi — mát máy, đỡ tốn pin
      fps: IS_MOBILE ? { target: 60, limit: IDLE_FPS } : { target: 60 },
      // Chỉ nhận chuột/chạm trên chính canvas: bấm vào bảng UI phía trên không lọt xuống thế giới game.
      input: { windowEvents: false },
      scene: [WorldScene, BusScene],
    });
    const onResize = () => {
      const w = el.clientWidth * DPR, h = el.clientHeight * DPR;
      // Bỏ qua nếu kích thước không đổi (resize tạo lại framebuffer WebGL, rất tốn).
      if (!w || !h || (w === game.scale.width && h === game.scale.height)) return;
      game.scale.resize(w, h);
      game.scale.setZoom(1 / DPR);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    // Tốc độ khung hình thích ứng (chỉ trên điện thoại)
    let boostTimer = 0;
    const setLimit = (fps: number) => {
      const loop = game.loop as unknown as { fpsLimit: number; hasFpsLimit: boolean; _limitRate: number };
      loop.fpsLimit = fps;
      loop.hasFpsLimit = fps > 0;
      loop._limitRate = fps > 0 ? 1000 / fps : 0;
    };
    const boost = (ms = 2500) => {
      if (!IS_MOBILE) return;
      if (!boostTimer) setLimit(0);
      clearTimeout(boostTimer);
      boostTimer = window.setTimeout(() => { boostTimer = 0; setLimit(IDLE_FPS); }, ms);
    };
    setFpsBooster(boost);
    el.addEventListener('pointerdown', () => boost(), { passive: true });

    // Điện thoại: mở bảng nào cũng che gần hết thế giới game →
    // cho Phaser ngủ (không vẽ) để máy mát, đỡ tốn pin và giao diện mượt hơn.
    const mobile = window.matchMedia('(max-width: 760px), (max-height: 600px)');
    const syncSleep = () => {
      const panel = useStore.getState().panel;
      const hide = mobile.matches && !!panel && panel !== 'bus';
      if (hide && game.loop.running) game.loop.sleep();
      else if (!hide && !game.loop.running) game.loop.wake();
    };
    const unsub = useStore.subscribe((s, p) => { if (s.panel !== p.panel) syncSleep(); });
    mobile.addEventListener('change', syncSleep);
    return () => { clearTimeout(boostTimer); setFpsBooster(null); unsub(); mobile.removeEventListener('change', syncSleep); ro.disconnect(); game.destroy(true); };
  }, []);

  return <div ref={ref} className="phaser-root" />;
}
