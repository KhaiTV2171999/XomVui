import Phaser from 'phaser';
import type { Appearance } from '../../../shared/catalog';
import type { Building, Portal } from '../../../shared/zones';
import { ensureAvatarTexture } from './PlayerSprite';
import * as T from './textures';

export const FONT = '"Baloo 2", "Segoe UI", system-ui, sans-serif';
export const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

type S = Phaser.Scene;
type Obj = Phaser.GameObjects.GameObject;

const transientObjects = new WeakMap<S, Set<Obj>>();

/** Theo dõi hiệu ứng ngắn để dọn cả khi chuyển bản đồ. */
export function transient<T extends Obj>(scene: S, obj: T): T {
  let objects = transientObjects.get(scene);
  if (!objects) {
    objects = new Set();
    transientObjects.set(scene, objects);
    scene.events.once('shutdown', () => clearTransient(scene));
  }
  objects.add(obj);
  obj.once('destroy', () => objects!.delete(obj));
  return obj;
}

export function clearTransient(scene: S) {
  transientObjects.get(scene)?.forEach((obj) => obj.destroy());
  transientObjects.get(scene)?.clear();
}

export function farmParticles(scene: S, x: number, y: number, kind: 'water' | 'harvest' | 'plant') {
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    const p = transient(scene, scene.add.ellipse(x, y, kind === 'water' ? 4 : 5, kind === 'water' ? 7 : 5,
      kind === 'water' ? 0xbce7f1 : kind === 'plant' ? 0xadd47d : 0xffde86).setDepth(y + 100));
    scene.tweens.add({
      targets: p, x: x + Math.cos(angle) * (18 + i % 3 * 7), y: y - 25 + Math.sin(angle) * 17,
      alpha: 0, scale: .2, duration: 480 + i * 35, ease: 'Sine.easeOut', onComplete: () => p.destroy(),
    });
  }
}

/**
 * Số đo chữ cho sẵn: nếu không có, Phaser phải đo chiều cao chữ bằng getImageData
 * cho mỗi kiểu chữ mới → chậm lúc tải khu.
 */
export function fontMetrics(size: number) {
  return { fontSize: Math.ceil(size * 1.32), ascent: Math.ceil(size * 1.02), descent: Math.ceil(size * 0.3) };
}

export function text(scene: S, x: number, y: number, str: string, size = 16, color = '#3b2f4a', extra: Phaser.Types.GameObjects.Text.TextStyle = {}) {
  return scene.add.text(x, y, str, {
    fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold', metrics: fontMetrics(size), ...extra,
  }).setOrigin(0.5).setResolution(2);
}

export function emoji(scene: S, x: number, y: number, str: string, size = 32) {
  return scene.add.text(x, y, str, { fontFamily: EMOJI_FONT, fontSize: `${size}px`, metrics: fontMetrics(size) }).setOrigin(0.5).setResolution(2);
}

/** Đặt một hình có gốc ở chân (x, y), thứ tự vẽ theo y. */
export function prop(scene: S, key: string, x: number, y: number, out: Obj[], opts: { scale?: number; sway?: boolean; flip?: boolean; depth?: number } = {}) {
  const img = scene.add.image(x, y, key).setOrigin(0.5, 0.96).setDepth(opts.depth ?? y);
  if (opts.scale) img.setScale(opts.scale);
  if (opts.flip) img.setFlipX(true);
  out.push(img);
  return img;
}

export function tree(scene: S, x: number, y: number, out: Obj[], kind: T.TreeKind = 'oak', scale = 1) {
  return prop(scene, T.treeTexture(scene, kind), x, y, out, { scale, sway: true, flip: (x * 7 + y) % 2 === 0 });
}
export function bush(scene: S, x: number, y: number, out: Obj[], flower?: string) {
  return prop(scene, T.bushTexture(scene, flower), x, y, out);
}
export function flowers(scene: S, x: number, y: number, out: Obj[], color: string) {
  return prop(scene, T.flowersTexture(scene, color), x, y, out);
}

export function horizontalFence(scene: S, x0: number, x1: number, y: number, out: Obj[]) {
  const ts = scene.add.tileSprite(x0, y, x1 - x0, 60, 'fence_h').setOrigin(0, 0.92).setDepth(y);
  out.push(ts);
}
export function verticalFence(scene: S, x: number, y0: number, y1: number, out: Obj[]) {
  const ts = scene.add.tileSprite(x, y0, 24, y1 - y0, 'fence_v').setOrigin(0.5, 0).setDepth(y0 + 1);
  out.push(ts);
}

export function signLabel(scene: S, x: number, y: number, label: string, out: Obj[], depth: number) {
  T.signTexture(scene);
  const board = scene.add.image(x, y, 'signboard').setDepth(depth);
  const t = text(scene, x, y - 3, label, 21, '#5a3a2a').setDepth(depth + 1);
  board.setDisplaySize(Math.max(150, t.width + 44), 50);
  out.push(board, t);
  return { board, t };
}

export function building(scene: S, b: Building, onClick: () => void, out: Obj[]) {
  const key = T.buildingTexture(scene, b.style, b.w, b.h);
  const img = scene.add.image(b.x + b.w / 2, b.y + b.h + 20, key).setOrigin(0.5, 1).setDepth(b.y + b.h);
  out.push(img);
  const signY = b.style === 'arcade' ? b.y + b.h * 0.13 : b.y + b.h * 0.36 + 10;
  const { board, t } = signLabel(scene, b.x + b.w / 2, signY, `${b.icon} ${b.label}`, out, b.y + b.h + 1);
  const scaleX = board.scaleX, scaleY = board.scaleY;
  // Vùng chạm: thân toà nhà (bỏ phần mái trong suốt phía trên). Không dùng pixelPerfect — phải đọc điểm ảnh từ GPU liên tục, rất tốn pin.
  const fw = img.frame.width, fh = img.frame.height;
  img.setInteractive({ hitArea: new Phaser.Geom.Rectangle(fw * 0.06, fh * 0.12, fw * 0.88, fh * 0.88), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
  img.on('pointerover', () => { img.setTint(0xfff6e0); scene.tweens.killTweensOf([board, t]); scene.tweens.add({ targets: board, scaleX: scaleX * 1.03, scaleY: scaleY * 1.03, duration: 140 }); scene.tweens.add({ targets: t, scale: 1.03, duration: 140 }); });
  img.on('pointerout', () => { img.clearTint(); scene.tweens.killTweensOf([board, t]); scene.tweens.add({ targets: board, scaleX, scaleY, duration: 140 }); scene.tweens.add({ targets: t, scale: 1, duration: 140 }); });
  img.on('pointerdown', onClick);
}

export function portalSign(scene: S, p: Portal, onClick: () => void, out: Obj[]) {
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const glow = scene.add.ellipse(cx, cy, p.w + 50, Math.min(p.h, 120), 0xfff3b0, 0.4).setDepth(-700);
  scene.tweens.add({ targets: glow, alpha: 0.28, scale: 1.05, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  out.push(glow);
  const left = p.x < 100;
  const sx = left ? p.x + 110 : p.x - 50;
  const sy = cy - 40;
  const post = scene.add.rectangle(sx, sy + 28, 8, 60, 0x8b5e3c).setDepth(sy + 60);
  out.push(post);
  signLabel(scene, sx, sy, left ? `⬅ ${p.label}` : `${p.label} ➡`, out, sy + 61);
  const z = scene.add.zone(cx, cy, p.w + 30, p.h + 20).setInteractive({ useHandCursor: true }).setDepth(-600);
  z.on('pointerdown', onClick);
  out.push(z);
}

export function pondLife(scene: S, p: { x: number; y: number; w: number; h: number }, out: Obj[]) {
  const r = T.rng(p.x * 13 + p.y);
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2, d = 0.45 + r() * 0.4;
    const lx = p.x + Math.cos(a) * (p.w / 2) * d, ly = p.y + Math.sin(a) * (p.h / 2) * d;
    out.push(scene.add.image(lx, ly, 'lily').setDepth(-850).setAngle(r() * 360).setScale(0.8 + r() * 0.5));
    if (i % 3 === 0) out.push(scene.add.image(lx + 4, ly - 6, 'lotus').setDepth(-849));
  }
  for (const [dx, dy] of [[-0.48, -0.25], [0.44, -0.35], [-0.42, 0.3], [0.5, 0.15]]) {
    out.push(scene.add.image(p.x + dx * p.w, p.y + dy * p.h + 10, 'reeds').setOrigin(0.5, 1).setDepth(p.y + dy * p.h + 10));
  }
  // vịt bơi
  for (let i = 0; i < 2; i++) {
    const duck = scene.add.image(p.x - p.w * 0.25 + i * 60, p.y - 20 + i * 40, T.animalTexture(scene, 'duck')).setScale(.4).setOrigin(.5, .85).setDepth(-840);
    const swim = () => {
      const a = Math.random() * Math.PI * 2, d = Math.random() * 0.6;
      const tx = p.x + Math.cos(a) * (p.w / 2) * d, ty = p.y + Math.sin(a) * (p.h / 2) * d;
      duck.setFlipX(tx < duck.x);
      scene.tweens.add({ targets: duck, x: tx, y: ty, duration: 4000 + Math.random() * 3000, ease: 'Sine.easeInOut', onComplete: swim });
    };
    swim();
    out.push(duck);
  }
}

export function butterflies(scene: S, area: { x: number; y: number; w: number; h: number }, n: number, out: Obj[]) {
  for (let i = 0; i < n; i++) {
    const b = scene.add.image(area.x + Math.random() * area.w, area.y + Math.random() * area.h, 'butterfly').setDepth(8500);
    if (i % 2) b.setTint(0xfff3a0);
    // Vỗ cánh chậm, biên độ nhỏ (đỡ nhấp nháy)
    scene.tweens.add({ targets: b, scaleX: 0.6, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const fly = () => {
      scene.tweens.add({
        targets: b, x: area.x + Math.random() * area.w, y: area.y + Math.random() * area.h,
        duration: 3000 + Math.random() * 3000, ease: 'Sine.easeInOut', onComplete: fly,
      });
    };
    fly();
    out.push(b);
  }
}

export function cloudShadows(scene: S, w: number, h: number, out: Obj[]) {
  for (let i = 0; i < 4; i++) {
    const c = scene.add.image(Math.random() * w, Math.random() * h, 'cloud_shadow').setDepth(8000).setAlpha(0.1).setScale(1.4 + Math.random());
    const drift = () => {
      c.x = -400; c.y = Math.random() * h;
      scene.tweens.add({ targets: c, x: w + 400, duration: 60000 + Math.random() * 40000, onComplete: drift });
    };
    scene.tweens.add({ targets: c, x: w + 400, duration: ((w + 400 - c.x) / (w + 800)) * 80000, onComplete: drift });
    out.push(c);
  }
}

export function chimneySmoke(scene: S, x: number, y: number, out: Obj[]) {
  scene.time.addEvent({
    delay: 600, loop: true, callback: () => {
      const s = transient(scene, scene.add.image(x, y, 'smoke').setDepth(9500).setScale(0.35).setAlpha(0.4));
      scene.tweens.add({ targets: s, y: y - 80, x: x + 20 + Math.random() * 15, scale: 1.2, alpha: 0, duration: 3600, onComplete: () => s.destroy() });
    },
  });
  void out;
}

// ===================================================================== XE BUÝT

export class BusSprite extends Phaser.GameObjects.Container {
  body2: Phaser.GameObjects.Image;
  wheels: Phaser.GameObjects.Image[];
  passenger: Phaser.GameObjects.Image | null = null;

  constructor(scene: S, x: number, y: number) {
    super(scene, x, y);
    T.busTextures(scene);
    const shadowE = scene.add.ellipse(0, -2, T.BUS_W - 30, 18, 0x000000, 0.22);
    this.body2 = scene.add.image(0, 0, 'bus_body').setOrigin(0.5, 1);
    this.wheels = [-100, 100].map((wx) => scene.add.image(wx, -22, 'bus_wheel'));
    this.add([shadowE, this.body2, ...this.wheels]);
    scene.add.existing(this);
  }

  setPassenger(a: Appearance | null) {
    this.passenger?.destroy();
    this.passenger = null;
    if (!a) return;
    this.passenger = this.scene.add.image(22, -118, ensureAvatarTexture(this.scene, a), 'f0').setOrigin(0.5, 0).setScale(0.36);
    this.addAt(this.passenger, 1);
  }

  driveTo(x: number, duration: number, ease: string) {
    return new Promise<void>((resolve) => {
      let lastX = this.x;
      this.scene.tweens.add({
        targets: this, x, duration, ease,
        onUpdate: () => {
          const dx = this.x - lastX;
          lastX = this.x;
          this.wheels.forEach((w) => (w.rotation += dx / 23));
          this.body2.y = Math.sin(this.x / 18) * 0.8;
        },
        onComplete: () => resolve(),
      });
    });
  }
}
