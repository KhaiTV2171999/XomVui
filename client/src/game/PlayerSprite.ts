import Phaser from 'phaser';
import type { Appearance } from '../../../shared/catalog';
import { AV_H, AV_W, appearanceKey, drawAvatar, IDLE, WALK } from '../avatar/draw';
import { sfx } from '../sound';
import { FONT, fontMetrics } from './mapArt';

const TEX_SCALE = 2;
const DISPLAY_SCALE = 0.62;
export const WALK_SPEED = 230;
const FRAME_MS = 115;

/** Bảng khung hình: hàng trên = nhìn trước (f0..f4), hàng dưới = nhìn sau (b0..b4); cột 0 = đứng yên. */
export function ensureAvatarTexture(scene: Phaser.Scene, a: Appearance) {
  const key = appearanceKey(a);
  if (!scene.textures.exists(key)) {
    const fw = AV_W * TEX_SCALE;
    const fh = AV_H * TEX_SCALE;
    const tex = scene.textures.createCanvas(key, fw * 5, fh * 2)!;
    const ctx = tex.getContext();
    [false, true].forEach((back, row) => {
      [IDLE, ...WALK].forEach((pose, col) => {
        ctx.save();
        ctx.translate(col * fw, row * fh);
        drawAvatar(ctx, a, TEX_SCALE, { pose, back });
        ctx.restore();
        tex.add(`${back ? 'b' : 'f'}${col}`, 0, col * fw, row * fh, fw, fh);
      });
    });
    tex.refresh();
  }
  return key;
}

export class PlayerSprite extends Phaser.GameObjects.Container {
  id: number;
  body2: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  bubble: Phaser.GameObjects.Container | null = null;
  bubbleTimer: Phaser.Time.TimerEvent | null = null;
  moveTween: Phaser.Tweens.Tween | null = null;
  walkTimer: Phaser.Time.TimerEvent | null = null;
  facingBack = false;
  frameIdx = 0;
  isMe: boolean;

  constructor(scene: Phaser.Scene, p: { id: number; name: string; level: number; appearance: Appearance; x: number; y: number }, isMe: boolean) {
    super(scene, p.x, p.y);
    this.id = p.id;
    this.isMe = isMe;
    this.body2 = scene.add.image(0, 0, ensureAvatarTexture(scene, p.appearance), 'f0').setOrigin(0.5, 0.96).setScale(DISPLAY_SCALE);
    const h = AV_H * TEX_SCALE * DISPLAY_SCALE;
    this.label = scene.add.text(0, -h - 4, `${p.name}  ·  Lv${p.level}`, {
      fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', metrics: fontMetrics(14),
      color: isMe ? '#fff3b0' : '#ffffff', stroke: '#3b2f4a', strokeThickness: 4,
    }).setOrigin(0.5).setResolution(2);
    this.add([this.body2, this.label]);
    this.setDepth(p.y);
    this.setSize(AV_W * TEX_SCALE * DISPLAY_SCALE * 0.7, h);
    this.setInteractive(new Phaser.Geom.Rectangle(-24, -h, 48, h), Phaser.Geom.Rectangle.Contains);
    if (!isMe) this.input!.cursor = 'pointer';
    scene.add.existing(this);
  }

  setAppearance(a: Appearance) {
    this.body2.setTexture(ensureAvatarTexture(this.scene, a), this.frameName());
  }

  private frameName() {
    return `${this.facingBack ? 'b' : 'f'}${this.walkTimer ? 1 + (this.frameIdx % 4) : 0}`;
  }

  walkTo(x: number, y: number, onDone?: () => void) {
    this.moveTween?.stop();
    const dx = x - this.x;
    const dy = y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) { this.stopWalk(); onDone?.(); return; }
    if (Math.abs(dx) > 4) this.body2.setFlipX(dx < 0);
    // đi lên (ra xa người xem) → quay lưng
    this.facingBack = dy < 0 && Math.abs(dy) > Math.abs(dx) * 0.6;
    this.startWalk();
    this.moveTween = this.scene.tweens.add({
      targets: this, x, y,
      duration: (dist / WALK_SPEED) * 1000,
      onUpdate: () => this.setDepth(this.y),
      onComplete: () => {
        this.moveTween = null;
        this.stopWalk();
        onDone?.();
      },
    });
  }

  private startWalk() {
    if (!this.walkTimer) {
      this.frameIdx = 0;
      this.walkTimer = this.scene.time.addEvent({
        delay: FRAME_MS, loop: true, callback: () => {
          if (!this.active) return;
          this.frameIdx++;
          this.body2.setFrame(this.frameName());
          // bước chân chạm đất: bụi + tiếng bước (chỉ nhân vật của mình mới có tiếng)
          if (this.frameIdx % 2 === 0) {
            this.dust();
            if (this.isMe) sfx('step');
          }
        },
      });
    }
    this.body2.setFrame(this.frameName());
  }

  private stopWalk() {
    this.walkTimer?.remove();
    this.walkTimer = null;
    if (this.active) this.body2.setFrame(this.frameName());
  }

  private dust() {
    const scene = this.scene;
    const p = scene.add.ellipse(this.x + (Math.random() - 0.5) * 14, this.y - 2, 10, 5, 0xe8dcc0, 0.7).setDepth(this.y - 1);
    scene.tweens.add({ targets: p, scale: 2.2, alpha: 0, y: p.y - 6, duration: 420, ease: 'Sine.easeOut', onComplete: () => p.destroy() });
  }

  destroy(fromScene?: boolean) {
    this.walkTimer?.remove();
    this.walkTimer = null;
    super.destroy(fromScene);
  }

  say(textStr: string) {
    this.bubble?.destroy();
    this.bubbleTimer?.remove();
    const t = this.scene.add.text(0, 0, textStr, {
      fontFamily: FONT, fontSize: '15px', color: '#3b2f4a', metrics: fontMetrics(15), wordWrap: { width: 190, useAdvancedWrap: true }, align: 'center',
    }).setOrigin(0.5).setResolution(2);
    const w = Math.max(40, t.width + 22);
    const h = t.height + 14;
    const g = this.scene.add.graphics();
    g.fillStyle(0xffffff, 0.97).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    g.fillTriangle(-7, h / 2 - 1, 7, h / 2 - 1, 0, h / 2 + 9);
    g.lineStyle(2, 0xd8c8e8, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    const top = this.label.y - 16 - h / 2;
    this.bubble = this.scene.add.container(0, top, [g, t]);
    this.add(this.bubble);
    this.bubble.setScale(0.3);
    this.scene.tweens.add({ targets: this.bubble, scale: 1, duration: 180, ease: 'Back.easeOut' });
    sfx('pop');
    this.bubbleTimer = this.scene.time.delayedCall(5000, () => {
      if (!this.bubble) return;
      const b = this.bubble;
      this.scene.tweens.add({ targets: b, alpha: 0, duration: 300, onComplete: () => b.destroy() });
      this.bubble = null;
    });
  }
}
