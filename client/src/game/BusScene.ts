import Phaser from 'phaser';
import type { Appearance } from '../../../shared/catalog';
import { sfx, startEngine } from '../sound';
import { DPR } from './dpr';
import { BusSprite, text } from './mapArt';
import { roadSceneTextures } from './textures';

export interface BusSceneData { appearance: Appearance; label: string; onDone: () => void }

/** Cảnh xe buýt chạy trên đường quê, chuyển giữa các khu. */
export class BusScene extends Phaser.Scene {
  layers: { ts: Phaser.GameObjects.TileSprite; speed: number }[] = [];
  clouds: { img: Phaser.GameObjects.Image; speed: number }[] = [];
  bus!: BusSprite;
  dataIn!: BusSceneData;
  w = 0;

  constructor() { super('bus'); }

  init(data: BusSceneData) { this.dataIn = data; this.layers = []; this.clouds = []; }

  create() {
    roadSceneTextures(this);
    // Bố cục theo kích thước CSS, camera phóng theo DPR cho nét.
    const w = this.scale.width / DPR;
    const h = this.scale.height / DPR;
    this.w = w;
    const cam = this.cameras.main;
    cam.setZoom(DPR);
    cam.centerOn(w / 2, h / 2);
    const roadTop = Math.max(h * 0.62, h - 230);

    this.add.image(0, 0, 'sky').setOrigin(0).setDisplaySize(w, h);
    this.add.circle(w * 0.8, h * 0.18, 46, 0xfff3b0);
    const glow = this.add.circle(w * 0.8, h * 0.18, 90, 0xfff3b0, 0.35);
    this.tweens.add({ targets: glow, scale: 1.15, alpha: 0.2, duration: 1500, yoyo: true, repeat: -1 });
    for (let i = 0; i < 6; i++) {
      const img = this.add.image(Math.random() * w, 40 + Math.random() * h * 0.3, 'cloud').setScale(0.5 + Math.random() * 0.7).setAlpha(0.95);
      this.clouds.push({ img, speed: 12 + Math.random() * 20 });
    }
    const add = (key: string, y: number, hgt: number, speed: number) => {
      const ts = this.add.tileSprite(0, y, w, hgt, key).setOrigin(0, 0);
      this.layers.push({ ts, speed });
    };
    add('hills_far', roadTop - 260, 300, 25);
    add('hills_mid', roadTop - 230, 300, 70);
    add('road_strip', roadTop, 170, 520);
    this.add.rectangle(0, roadTop + 170, w, h, 0x7fb85a).setOrigin(0);

    this.bus = new BusSprite(this, w * 0.5, roadTop + 132);
    this.bus.setPassenger(this.dataIn.appearance);
    this.tweens.add({ targets: this.bus, y: this.bus.y - 2, duration: 180, yoyo: true, repeat: -1 });

    const cap = text(this, w / 2, 70, `🚌  Đang đến ${this.dataIn.label}`, 26, '#ffffff', { stroke: '#3b2f4a', strokeThickness: 6 });
    let dots = 0;
    this.time.addEvent({ delay: 400, loop: true, callback: () => { dots = (dots + 1) % 4; cap.setText(`🚌  Đang đến ${this.dataIn.label}${'.'.repeat(dots)}`); } });

    const stopEngine = startEngine();
    this.events.once('shutdown', stopEngine);
    cam.fadeIn(300);
    this.time.delayedCall(2700, () => sfx('horn'));
    this.time.delayedCall(3000, () => {
      cam.fadeOut(300);
      this.time.delayedCall(300, () => this.dataIn.onDone());
    });
  }

  update(_t: number, dt: number) {
    const s = dt / 1000;
    // xe đi sang trái → cảnh vật trôi sang phải
    for (const l of this.layers) l.ts.tilePositionX -= l.speed * s;
    for (const c of this.clouds) {
      c.img.x += c.speed * s;
      if (c.img.x > this.w + 150) c.img.x = -150;
    }
    this.bus.wheels.forEach((wh) => (wh.rotation -= (520 * s) / 23));
  }
}
