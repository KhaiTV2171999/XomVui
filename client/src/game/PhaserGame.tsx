import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { WorldScene } from './WorldScene';
import { BusScene } from './BusScene';
import { DPR } from './dpr';

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
      render: { antialias: true, roundPixels: false },
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
    return () => { ro.disconnect(); game.destroy(true); };
  }, []);

  return <div ref={ref} className="phaser-root" />;
}
