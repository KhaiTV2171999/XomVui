import Phaser from 'phaser';
import { ANIMALS, CROPS, ECON, ITEMS, MAX_ANIMALS, MAX_PLOTS, plotPrice } from '../../../shared/catalog';
import {
  animalPos, FUN_PLAZA, FARM_FENCE, FARM_HOUSE, FARM_POND, GARDEN, GARDEN2, PEN, PLOT_H, PLOT_W, plotPos, ZONES, zoneDefOf,
} from '../../../shared/zones';
import { bus as netBus, call, send } from '../net';
import { confirmBox, fmt, get, set, toast } from '../store';
import type { Panel, PlayerPub, ZoneInfo } from '../store';
import { animalRemainMs, canWater, fmtTime, plotProgress, plotRemainMs, plotStage } from './farmUtil';
import * as art from './mapArt';
import { BusSprite } from './mapArt';
import { PlayerSprite } from './PlayerSprite';
import * as T from './textures';
import { DPR } from './dpr';
import { NavGrid } from './nav';
import { sfx } from '../sound';

type Obj = Phaser.GameObjects.GameObject;

interface PlotView {
  soil: Phaser.GameObjects.Image;
  crop: Phaser.GameObjects.Image;
  status: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics;
  lock: Phaser.GameObjects.Text;
  cropKey: string | null;
}
interface AnimalView {
  icon: Phaser.GameObjects.Image;
  status: Phaser.GameObjects.Text;
  barBg: Phaser.GameObjects.Rectangle;
  bar: Phaser.GameObjects.Rectangle;
  type: string | null;
  wander: Phaser.Tweens.Tween | null;
}

const DEST_NAMES: Record<string, string> = { myfarm: 'Nông trại', fun: 'Khu vui chơi', park: 'Công viên' };
/** Đồng hồ đếm ngược ngắn gọn: 1:05:09 / 4:07 */
function clock(ms: number) {
  const t = Math.ceil(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
const delay = (scene: Phaser.Scene, ms: number) => new Promise<void>((r) => scene.time.delayedCall(ms, () => r()));

export class WorldScene extends Phaser.Scene {
  objs: Obj[] = [];
  players = new Map<number, PlayerSprite>();
  me: PlayerSprite | null = null;
  zone: ZoneInfo | null = null;
  plotViews: PlotView[] = [];
  animalViews: AnimalView[] = [];
  unsub: (() => void)[] = [];
  vignette: Phaser.GameObjects.Image | null = null;
  ferris: { wheel: Phaser.GameObjects.Image; cabins: Phaser.GameObjects.Image[]; cx: number; cy: number; R: number } | null = null;

  traveling = false;
  arriving = false;
  busDone = false;
  pendingZone: ZoneInfo | null = null;
  nav: NavGrid | null = null;
  dog: Phaser.GameObjects.Image | null = null;
  /** Cảnh sát tuần tra đang có mặt ở nông trại này */
  police: PlayerSprite | null = null;
  /** Thanh tiến trình "đang lượm trộm" trên đầu từng kẻ trộm */
  stealBars = new Map<number, { g: Phaser.GameObjects.Container; tween: Phaser.Tweens.Tween }>();
  /** Mình đang lượm trộm */
  stealing = false;
  policeTimer: Phaser.Time.TimerEvent | null = null;
  dogTween: Phaser.Tweens.Tween | null = null;
  dogChasing = false;
  plotHint: Phaser.GameObjects.Text | null = null;
  plotFocus: Phaser.GameObjects.Graphics | null = null;
  focusedPlot: number | null = null;
  busyPlots = new Set<number>();

  constructor() {
    super('world');
  }

  create() {
    this.cameras.main.setBackgroundColor('#7fbf5f');
    T.fenceTextures(this);
    T.soilTextures(this, PLOT_W, PLOT_H);
    T.fxTextures(this);
    T.busTextures(this);
    T.busStopTexture(this);

    this.unsub.push(
      netBus.on('zone', (z: ZoneInfo) => {
        if (this.traveling) { this.pendingZone = z; this.finishTravel(); } else this.build(z, false);
      }),
      netBus.on('join', (p: PlayerPub) => { if (!this.traveling) this.addPlayer(p); }),
      netBus.on('leave', ({ id }) => { this.players.get(id)?.destroy(); this.players.delete(id); }),
      netBus.on('move', ({ id, x, y }) => this.players.get(id)?.walkTo(x, y)),
      netBus.on('chat', ({ id, text }) => this.players.get(id)?.say(text)),
      netBus.on('appearance', ({ id, appearance }) => this.players.get(id)?.setAppearance(appearance)),
      netBus.on('farm', () => this.updateFarm()),
      netBus.on('farm:dogchase', (d) => this.onDogChase(d)),
      netBus.on('police:arrive', () => this.policeArrive(true)),
      netBus.on('police:leave', () => this.policeLeave()),
      netBus.on('police:arrest', ({ thiefId }) => this.policeArrest(thiefId)),
      netBus.on('player:jail', ({ id, jailed }) => this.players.get(id)?.setJailed(jailed)),
      netBus.on('steal:begin', (d) => this.onStealBegin(d)),
      netBus.on('steal:end', (d) => this.onStealEnd(d)),
      netBus.on('travel', (target: string) => this.travel(target)),
    );
    this.events.once('shutdown', () => this.unsub.forEach((u) => u()));

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Obj[]) => {
      if (over.length || this.traveling || this.arriving) return;
      this.moveMe(p.worldX, p.worldY);
    });

    const resize = () => this.fitCamera();
    this.scale.on('resize', resize);
    this.events.once('shutdown', () => this.scale.off('resize', resize));
    const z = get().zone;
    if (z) this.build(z, false);
  }

  fitCamera() {
    const w = this.scale.width / DPR; // kích thước CSS
    const cam = this.cameras.main;
    // Luôn khớp camera với kích thước canvas (tránh bị cắt mất một phần khi đổi cỡ cửa sổ).
    cam.setSize(this.scale.width, this.scale.height);
    const h = this.scale.height / DPR;
    // Theo cả chiều rộng lẫn chiều cao: màn thấp (điện thoại xoay ngang) thu nhỏ hơn để thấy trọn toà nhà
    const zw = w < 700 ? 0.62 : w < 1100 ? 0.84 : 0.94;
    const zh = h < 480 ? 0.6 : h < 640 ? 0.8 : 0.94;
    let zoom = Math.min(zw, zh) * DPR;
    const def = this.zone && zoneDefOf(this.zone.zone);
    // Khu vui chơi: luôn thấy trọn dãy nhà (từ mái ~y120 tới vỉa hè ~y900), camera nhìn lệch lên trên nhân vật
    if (def?.id === 'fun') {
      zoom = Math.min(zoom, this.scale.height / 820);
      cam.setFollowOffset(0, 300);
    } else cam.setFollowOffset(0, 0);
    // Màn hình rộng/cao hơn bản đồ → phóng to vừa đủ để bản đồ phủ kín, không lộ nền trống.
    if (def) zoom = Math.max(zoom, this.scale.width / def.w, this.scale.height / def.h);
    cam.setZoom(zoom);
    if (this.vignette) {
      this.vignette.setPosition(this.scale.width / 2, this.scale.height / 2)
        .setDisplaySize(this.scale.width / cam.zoom + 4, this.scale.height / cam.zoom + 4);
    }
  }

  clear() {
    art.clearTransient(this);
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    this.players.forEach((p) => p.destroy());
    this.players.clear();
    this.me = null;
    this.plotViews = [];
    this.animalViews = [];
    this.dog = null;
    this.police = null;
    this.policeTimer = null;
    this.stealBars.clear();
    this.stealing = false;
    this.dogTween = null;
    this.dogChasing = false;
    this.ferris = null;
    this.vignette = null;
    this.plotHint = null;
    this.plotFocus = null;
    this.focusedPlot = null;
    this.busyPlots.clear();
  }

  build(z: ZoneInfo, byBus: boolean) {
    this.clear();
    this.zone = z;
    this.nav = this.buildNav(z.kind);
    const def = zoneDefOf(z.zone)!;
    const out = this.objs;

    switch (z.kind) {
      case 'farm': this.buildFarm(out); break;
      case 'fun': this.buildFun(out); break;
      case 'park': this.buildPark(out); break;
    }
    // Bấm vào toà nhà: đi tới trước cửa rồi mới mở bảng.
    for (const b of def.buildings) art.building(this, b, () => this.goThenOpen(b.x + b.w / 2, b.y + b.h + 26, b.action), out);
    for (const p of def.portals) art.portalSign(this, p, () => this.moveMe(p.x + p.w / 2, p.y + p.h / 2), out);
    if (def.busStop) this.buildBusStop(def.busStop, out);

    this.vignette = this.add.image(0, 0, 'vignette').setScrollFactor(0).setDepth(9800).setAlpha(.45);
    out.push(this.vignette);

    for (const p of z.players) this.addPlayer(p);
    const meId = get().me?.id;
    this.me = meId != null ? this.players.get(meId) ?? null : null;

    const cam = this.cameras.main;
    cam.resetFX();
    cam.setBounds(0, 0, def.w, def.h);
    this.fitCamera();
    if (this.me) {
      cam.startFollow(this.me, true, 0.1, 0.1);
      cam.setDeadzone(90, 60);
      this.fitCamera(); // startFollow đặt lại độ lệch camera → áp lại
      cam.centerOn(this.me.x, this.me.y - cam.followOffset.y);
    }
    cam.fadeIn(350, 127, 191, 95);

    if (byBus && def.busStop && this.me) this.arriveByBus(def.busStop);
    if (z.kind === 'farm' && z.police && z.police.until > Date.now()) this.policeArrive(false);
  }

  // ---------------------------------------------------------------- Trộm kiểu "lượm"

  /** Đi tới chỗ cần trộm rồi bắt đầu lượm (server tính thời gian, chủ được báo). */
  async startSteal(kind: 'plot' | 'produce' | 'animal', idx: number, x: number, y: number) {
    if (this.stealing) return toast('Bạn đang lượm dở rồi');
    await this.walkMe(x, y);
    const r = await call('steal:start', { owner: this.zone!.ownerId, kind, idx });
    if (!r.ok || r.police) return;
    this.stealing = true;
    toast(`😈 Đang ${kind === 'animal' ? 'bắt' : 'lượm'}… đứng yên khoảng ${Math.ceil(r.ms / 1000)} giây (đi chỗ khác là bỏ dở)`);
  }

  onStealBegin({ thiefId, endsAt, ms }: { thiefId: number; endsAt: number; ms: number }) {
    const sp = this.players.get(thiefId);
    if (!sp) return;
    this.stealBars.get(thiefId)?.g.destroy();
    const W = 70;
    const top = sp.label.y - 22;
    const bg = this.add.rectangle(0, 0, W + 4, 10, 0x2b2d42, 0.85).setStrokeStyle(2, 0xffffff);
    const fill = this.add.rectangle(-W / 2, 0, W, 6, 0xff6b8b).setOrigin(0, 0.5).setScale(0, 1);
    const icon = art.emoji(this, -W / 2 - 14, 0, '😈', 16);
    const g = this.add.container(0, top, [bg, fill, icon]);
    // Chủ vườn đang ở đây: nút "Đuổi" ngay trên đầu kẻ trộm
    if (this.isOwner()) {
      const btn = art.text(this, 0, -24, '🏃 Đuổi đi!', 15, '#ffffff', { stroke: '#9d0208', strokeThickness: 5 })
        .setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => call('steal:chase', { thiefId }));
      g.add(btn);
      sfx('error');
    }
    sp.add(g);
    const left = Math.max(200, endsAt - (Date.now() + (get().timeOffset ?? 0)));
    fill.setScale(Math.max(0, 1 - left / ms), 1);
    const tween = this.tweens.add({ targets: fill, scaleX: 1, duration: left, ease: 'Linear' });
    this.stealBars.set(thiefId, { g, tween });
  }

  onStealEnd({ thiefId, ok, reason, item, qty, text }: { thiefId: number; ok: boolean; reason?: string; item?: string; qty?: number; text?: string }) {
    const bar = this.stealBars.get(thiefId);
    if (bar) { bar.tween.stop(); bar.g.destroy(); this.stealBars.delete(thiefId); }
    const sp = this.players.get(thiefId);
    if (thiefId === get().me?.id) {
      this.stealing = false;
      if (ok && sp) {
        sfx('harvest');
        this.flyToBag(sp.x, sp.y - 60, item ? ITEMS[item]?.icon ?? '🎁' : '🐾', Math.min(qty ?? 1, 6));
        this.floatText(sp.x, sp.y - 90, `+${text} 😈`, '#ffd6e8');
      }
    } else if (sp && !ok && reason === 'chased') {
      sp.say('😱 Chạy thôi!');
    }
  }

  // ---------------------------------------------------------------- Cảnh sát tuần tra

  /** Cảnh sát xuất hiện: đi bộ vào từ trạm xe buýt (hoặc đã có mặt sẵn khi mình vừa tới). */
  policeArrive(fromGate: boolean) {
    if (this.zone?.kind !== 'farm' || this.police) return;
    const def = zoneDefOf(this.zone.zone)!;
    const start = fromGate && def.busStop ? { x: def.busStop.x, y: def.busStop.y } : { x: 900, y: 700 };
    const cop = new PlayerSprite(this, {
      id: -1, name: 'Cảnh sát', level: 99, x: start.x, y: start.y,
      appearance: { skin: 2, hair: 0, hairColor: 0, top: 'cl:jacket_denim', bottom: 'cl:pants_black', hat: 'cl:cap_blue', acc: 'cl:sunglasses' },
    }, false, '👮 Cảnh sát tuần tra');
    cop.disableInteractive();
    cop.label.setColor('#bde0fe');
    this.police = cop;
    this.objs.push(cop);
    if (fromGate) {
      sfx('error');
      cop.say('🚨 Kiểm tra an ninh khu vực!');
      toast('🚨 Cảnh sát đang tuần tra nông trại này!', 'info');
    }
    this.policeWander();
  }

  private policeWander() {
    const cop = this.police;
    if (!cop || !cop.active) return;
    const tx = 260 + Math.random() * 1200, ty = 420 + Math.random() * 760;
    const pts = this.nav ? this.nav.findPath(cop.x, cop.y, tx, ty) : [[tx, ty] as [number, number]];
    const step = (i: number) => {
      if (this.police !== cop || !cop.active) return;
      if (i >= pts.length) {
        this.policeTimer = this.time.delayedCall(1500 + Math.random() * 2500, () => this.policeWander());
        return;
      }
      cop.walkTo(pts[i][0], pts[i][1], () => step(i + 1));
    };
    step(0);
  }

  /** Cảnh sát rời đi: đi về trạm xe buýt rồi biến mất. */
  policeLeave() {
    const cop = this.police;
    if (!cop) return;
    this.police = null;
    this.policeTimer?.remove();
    const def = this.zone && zoneDefOf(this.zone.zone);
    const exit = def?.busStop ?? { x: cop.x, y: cop.y + 200 };
    cop.walkTo(exit.x, exit.y, () => {
      this.tweens.add({ targets: cop, alpha: 0, duration: 400, onComplete: () => cop.destroy() });
    });
  }

  /** Cảnh sát bắt kẻ trộm: chạy tới, còi hú, còng tay. */
  policeArrest(thiefId: number) {
    const thief = this.players.get(thiefId);
    if (!thief) return;
    if (!this.police) this.policeArrive(false);
    const cop = this.police!;
    this.policeTimer?.remove();
    sfx('error');
    cop.say('🚨 Đứng lại! Bắt quả tang!');
    cop.walkTo(thief.x + 40, thief.y, () => {
      const cuff = art.transient(this, art.text(this, thief.x, thief.y - 130, '🚔 BỊ BẮT!', 22, '#ffffff', { stroke: '#9d0208', strokeThickness: 6 }).setDepth(9999));
      this.tweens.add({ targets: cuff, y: cuff.y - 24, alpha: 0, delay: 1200, duration: 600, onComplete: () => cuff.destroy() });
      thief.say('😭 Em xin lỗi…');
      this.policeTimer = this.time.delayedCall(2500, () => this.policeWander());
    });
  }

  addPlayer(p: PlayerPub) {
    if (this.players.has(p.id)) return;
    const isMe = p.id === get().me?.id;
    const sp = new PlayerSprite(this, p, isMe);
    sp.on('pointerdown', () => { if (!isMe) set({ playerCard: p.id }); });
    this.players.set(p.id, sp);
  }

  moveMe(x: number, y: number) {
    if (!this.me || !this.zone || this.traveling || this.arriving) return;
    if (this.stealing) { this.stealing = false; send('steal:cancel'); toast('Bạn đã bỏ dở, không lấy được gì'); }
    const def = zoneDefOf(this.zone.zone)!;
    const tx = Phaser.Math.Clamp(x, 20, def.w - 20);
    const ty = Phaser.Math.Clamp(y, 60, def.h - 10);
    this.walkRoute(tx, ty, (fx, fy) => {
      const portal = def.portals.find((pt) => fx >= pt.x && fx <= pt.x + pt.w && fy >= pt.y && fy <= pt.y + pt.h);
      if (portal) {
        const back = () => {
          // Không qua được: lùi ra khỏi cổng để khỏi đứng kẹt ở đó
          const cx = def.w / 2, cy = def.h / 2;
          const d = Math.hypot(cx - fx, cy - fy) || 1;
          this.walkRoute(fx + ((cx - fx) / d) * 140, fy + ((cy - fy) / d) * 140, () => {});
        };
        const jail = get().me?.jailUntil;
        if (jail && jail > Date.now() && portal.to !== 'park') {
          toast(`🧹 Bạn đang lao động công ích ở Công viên — còn ${Math.ceil((jail - Date.now()) / 60000)} phút nữa mới được đi`, 'error');
          back();
          return;
        }
        this.cameras.main.fadeOut(200, 127, 191, 95);
        call('zone:join', { zone: portal.to, via: 'walk' }).then((r) => {
          if (r.ok) return;
          this.cameras.main.fadeIn(250, 127, 191, 95); // bị từ chối: làm sáng lại màn hình
          back();
        });
      }
    });
  }

  walkMe(x: number, y: number) {
    return new Promise<void>((resolve) => this.walkRoute(x, y, () => resolve()));
  }

  /** Bản đồ vật cản của từng khu. */
  buildNav(kind: string) {
    const def = zoneDefOf(this.zone!.zone)!;
    const nav = new NavGrid(def.w, def.h, 16);
    if (def.road) nav.rect(0, def.road.y - 6, def.w, def.h);
    if (def.busStop) nav.rect(def.busStop.x + 50, def.busStop.y - 40, 180, 30);
    if (kind === 'farm') {
      const F = FARM_FENCE;
      const bottom = F.y + F.h;
      nav.rect(0, 0, def.w, F.y + 12)
        .rect(0, 0, F.x + 12, bottom + 10)
        .rect(F.x + F.w - 12, 0, def.w, bottom + 10)
        .rect(0, bottom - 10, def.w, 20)
        .open(F.gateX + 16, bottom - 12, F.gateW - 32, 26)
        .rect(FARM_HOUSE.left, F.y, FARM_HOUSE.right - FARM_HOUSE.left, FARM_HOUSE.y - 8 - F.y)
        .rect(PEN.x - 10, PEN.y - 10, PEN.w + 20, PEN.h + 20)
        .ellipse(FARM_POND.x, FARM_POND.y, FARM_POND.w * 0.49, FARM_POND.h * 0.49);
      for (const [g, gap] of [[GARDEN, 'top'], [GARDEN2, 'bottom']] as const) {
        const x0 = g.x - 6, y0 = g.y - 6, w = g.w + 12, h = g.h + 12;
        nav.frame(x0, y0, w, h, 12);
        const gy = gap === 'top' ? y0 : y0 + h;
        nav.open(x0 + w / 2 - 36, gy - 10, 72, 20);
      }
    } else if (kind === 'fun') {
      // chỉ đi trên sân lát đá trước dãy nhà; đài phun nước ở giữa
      nav.rect(0, 0, def.w, FUN_PLAZA.y - 14);
    } else if (kind === 'park') {
      nav.ellipse(830, 640, 370, 190);
    }
    return nav;
  }

  /** Đi tới (x, y) theo đường vòng tránh vật cản. `onDone` nhận điểm dừng thật. */
  walkRoute(x: number, y: number, onDone: (fx: number, fy: number) => void) {
    if (!this.me) return;
    const pts = this.nav ? this.nav.findPath(this.me.x, this.me.y, x, y) : [[x, y] as [number, number]];
    if (!pts.length) return;
    const [fx, fy] = pts[pts.length - 1];
    const ring = art.transient(this, this.add.ellipse(fx, fy, 28, 11).setStrokeStyle(2, 0xfff5d6, 0.8).setDepth(-500));
    this.tweens.add({ targets: ring, scale: 1.45, alpha: 0, duration: 540, ease: 'Sine.easeOut', onComplete: () => ring.destroy() });
    const step = (i: number) => {
      if (!this.me || !this.me.active) return;
      if (i >= pts.length) return onDone(fx, fy);
      const [px, py] = pts[i];
      send('move', { x: Math.round(px), y: Math.round(py) });
      this.me.walkTo(px, py, () => step(i + 1));
    };
    step(0);
  }

  floatText(x: number, y: number, str: string, color = '#ffffff') {
    const t = art.transient(this, art.text(this, x, y, str, 17, color, { stroke: '#465237', strokeThickness: 3 }).setDepth(9999));
    this.tweens.add({ targets: t, y: y - 42, alpha: 0, duration: 1450, ease: 'Sine.easeOut', onComplete: () => t.destroy() });
  }

  // ------------------------------------------------------------ Xe buýt
  buildBusStop(stop: { x: number; y: number }, out: Obj[]) {
    const shelter = art.prop(this, 'busstop2', stop.x + 140, stop.y - 6, out);
    shelter.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 10 });
    shelter.on('pointerdown', () => this.openBusStop());
    shelter.on('pointerover', () => shelter.setTint(0xfff6e0));
    shelter.on('pointerout', () => shelter.clearTint());
  }
  /** Đi tới (x, y) rồi mới mở bảng — chỉ mở nếu đã đến nơi. */
  /** Đi tới (x, y) rồi mở bảng  (chỉ mở nếu đến nơi). */
  async goThenOpen(x: number, y: number, panel: Panel) {
    if (!this.me || this.traveling || this.arriving) return;
    const zoneAtStart = this.zone;
    if (Phaser.Math.Distance.Between(this.me.x, this.me.y, x, y) > 40) await this.walkMe(x, y);
    if (this.zone !== zoneAtStart || !this.me) return;
    if (Phaser.Math.Distance.Between(this.me.x, this.me.y, x, y) <= 60) set({ panel });
  }

  /** Đi tới trạm xe buýt rồi mở bảng chọn điểm đến. */
  async openBusStop() {
    const stop = this.zone && zoneDefOf(this.zone.zone)?.busStop;
    if (!stop || !this.me || this.traveling || this.arriving) return;
    if (Phaser.Math.Distance.Between(this.me.x, this.me.y, stop.x, stop.y) > 30) await this.walkMe(stop.x, stop.y);
    set({ panel: 'bus' });
  }

  async travel(target: string) {
    if (this.traveling || this.arriving || !this.zone) return;
    const meId = get().me?.id;
    if (target === this.zone.zone || (target === 'myfarm' && this.zone.zone === `farm:${meId}`)) {
      toast('Bạn đang ở đây rồi');
      return;
    }
    this.traveling = true;
    set({ traveling: true });
    this.busDone = false;
    this.pendingZone = null;
    set({ panel: null, playerCard: null });

    const def = zoneDefOf(this.zone.zone)!;
    const stop = def.busStop;
    const cam = this.cameras.main;
    if (stop && this.me) {
      await this.walkMe(stop.x, stop.y);
      const bus = new BusSprite(this, cam.worldView.right + 260, stop.roadY).setDepth(stop.roadY);
      this.objs.push(bus);
      this.time.delayedCall(900, () => sfx('horn'));
      await bus.driveTo(stop.x - T.BUS_DOOR_X, 1600, 'Cubic.easeOut');
      await new Promise<void>((r) => this.tweens.add({ targets: this.me, alpha: 0, y: this.me!.y + 26, duration: 350, onComplete: () => r() }));
      bus.setPassenger(get().me!.appearance);
      await delay(this, 300);
      await bus.driveTo(cam.worldView.left - 300, 1500, 'Cubic.easeIn');
    }
    cam.fadeOut(250, 0, 0, 0);
    await delay(this, 260);

    const label = DEST_NAMES[target] ?? 'nông trại của bạn';
    this.scene.launch('bus', {
      appearance: get().me!.appearance,
      label,
      onDone: () => { this.busDone = true; this.finishTravel(); },
    });
    const r = await call('zone:join', { zone: target, via: 'bus' });
    if (!r.ok) {
      this.scene.stop('bus');
      this.traveling = false;
      set({ traveling: false });
      const z = get().zone;
      if (z) this.build(z, false);
    }
  }

  finishTravel() {
    if (!this.busDone || !this.pendingZone) return;
    this.scene.stop('bus');
    const z = this.pendingZone;
    this.pendingZone = null;
    this.traveling = false;
    set({ traveling: false });
    this.build(z, true);
  }

  async arriveByBus(stop: { x: number; y: number; roadY: number }) {
    const me = this.me!;
    this.arriving = true;
    me.setAlpha(0);
    const bus = new BusSprite(this, stop.x + 1000, stop.roadY).setDepth(stop.roadY);
    bus.setPassenger(get().me!.appearance);
    this.objs.push(bus);
    this.time.delayedCall(1000, () => sfx('horn'));
    await bus.driveTo(stop.x - T.BUS_DOOR_X, 1700, 'Cubic.easeOut');
    if (!bus.active) return;
    bus.setPassenger(null);
    me.setPosition(stop.x, stop.y + 26);
    await new Promise<void>((r) => this.tweens.add({ targets: me, alpha: 1, y: stop.y, duration: 380, onComplete: () => r() }));
    this.arriving = false;
    await delay(this, 300);
    if (!bus.active) return;
    await bus.driveTo(stop.x - 1400, 1700, 'Cubic.easeIn');
    bus.destroy();
  }

  // ------------------------------------------------------------ Nông trại
  buildFarm(out: Obj[]) {
    const def = ZONES.farm;
    const F = FARM_FENCE;
    const gateCx = F.gateX + F.gateW / 2;
    const key = T.groundTexture(this, 'ground_farm', {
      w: def.w, h: def.h, seed: 'farm',
      dirtAreas: [GARDEN, GARDEN2],
      ponds: [FARM_POND],
      paths: [
        { pts: [[FARM_HOUSE.x, FARM_HOUSE.y - 10], [FARM_HOUSE.x, 462], [gateCx, 462], [gateCx, def.road!.y - def.road!.sidewalk + 4]], width: 74 },
      ],
      road: def.road,
    });
    out.push(this.add.image(0, 0, key).setOrigin(0).setDepth(-1000));

    // Rào thấp quanh vườn, chừa lối vào phía giáp đường
    this.gardenFence(GARDEN, 'top', out);
    this.gardenFence(GARDEN2, 'bottom', out);

    // Hàng rào + cổng
    art.horizontalFence(this, F.x, F.x + F.w, F.y, out);
    art.horizontalFence(this, F.x, F.gateX, F.y + F.h, out);
    art.horizontalFence(this, F.gateX + F.gateW, F.x + F.w, F.y + F.h, out);
    art.verticalFence(this, F.x, F.y, F.y + F.h, out);
    art.verticalFence(this, F.x + F.w, F.y, F.y + F.h, out);
    // Cổng đơn giản: 2 cột + 1 xà ngang, biển tên nằm trên xà
    const gateY = F.y + F.h + 4;
    art.prop(this, 'gate_post', F.gateX - 6, gateY, out, { scale: 1.3 });
    art.prop(this, 'gate_post', F.gateX + F.gateW + 6, gateY, out, { scale: 1.3 });
    const beamY = gateY - 150;
    const beam = this.add.graphics().setDepth(gateY + 5);
    beam.fillStyle(0x7a4f2c, 1).fillRoundedRect(F.gateX - 22, beamY, F.gateW + 44, 16, 5);
    beam.fillStyle(0xa8743f, 1).fillRoundedRect(F.gateX - 22, beamY, F.gateW + 44, 6, 3);
    out.push(beam);
    art.signLabel(this, gateCx, beamY - 22, `🌾 Nông trại ${this.zone?.ownerName ?? ''}`, out, gateY + 6);

    // Nhà sát góc trên-trái (phía sau là hàng rào, không đi vòng ra sau được)
    T.houseTexture(this);
    art.prop(this, 'farmhouse', FARM_HOUSE.x, FARM_HOUSE.y, out);
    art.prop(this, T.scarecrowTexture(this), 1046, 330, out, { scale: 0.7 });
    for (const [x, c] of [[205, '#ff6b8b'], [455, '#ffd43b'], [560, '#b197fc']] as const) art.flowers(this, x, 468, out, c);

    // Chuồng + nhà kho
    T.barnTexture(this);
    art.prop(this, 'barn', PEN.x + PEN.w - 130, PEN.y + 90, out);
    art.horizontalFence(this, PEN.x, PEN.x + PEN.w, PEN.y, out);
    art.horizontalFence(this, PEN.x, PEN.x + PEN.w, PEN.y + PEN.h, out);
    art.verticalFence(this, PEN.x, PEN.y, PEN.y + PEN.h, out);
    art.verticalFence(this, PEN.x + PEN.w, PEN.y, PEN.y + PEN.h, out);
    T.hayTexture(this);
    art.prop(this, 'hay', PEN.x + 60, PEN.y + 70, out);
    art.prop(this, 'hay', PEN.x + 120, PEN.y + 60, out, { scale: 0.85 });
    const pl = art.text(this, PEN.x + 150, PEN.y - 60, '🐾 Chuồng', 18, '#ffffff', { stroke: '#5a3a2a', strokeThickness: 5 }).setDepth(PEN.y);
    out.push(pl);

    // Ao
    art.pondLife(this, FARM_POND, out);
    art.prop(this, T.rockTexture(this), FARM_POND.x - FARM_POND.w / 2 - 10, FARM_POND.y + 60, out);
    art.prop(this, 'rock', FARM_POND.x + FARM_POND.w / 2 - 20, FARM_POND.y + 110, out, { scale: 0.7 });

    // Cây trong rào
    for (const [x, y, k] of [
      [300, 1040, 'oak'], [520, 1080, 'blossom'],
      [1600, 720, 'birch'], [1610, 1060, 'oak'],
    ] as [number, number, T.TreeKind][]) art.tree(this, x, y, out, k, 0.9);
    for (const [x, y, c] of [[220, 900, '#ff8fab'], [470, 930, undefined], [1560, 820, undefined]] as [number, number, string | undefined][]) art.bush(this, x, y, out, c);

    // Rừng cây bao quanh bên ngoài
    for (let x = 40; x < def.w; x += 120) art.tree(this, x + ((x / 120) % 2) * 30, 118 - ((x / 120) % 2) * 30, out, (x / 120) % 3 === 0 ? 'pine' : 'oak', 0.95);
    for (let y = 300; y < 1180; y += 150) {
      art.tree(this, 60, y, out, y % 300 ? 'pine' : 'oak', 0.9);
      art.tree(this, def.w - 60, y + 40, out, y % 300 ? 'oak' : 'pine', 0.9);
    }

    // Ô đất
    for (let i = 0; i < MAX_PLOTS; i++) {
      const { x, y } = plotPos(i);
      const soil = this.add.image(x, y, 'soil').setDepth(-880);
      const crop = this.add.image(x, y + 22, 'soil').setOrigin(0.5, 82 / 96).setDepth(y + 20).setVisible(false);
      const bar = this.add.graphics().setDepth(y + 30);
      const status = art.emoji(this, x + 34, y - 40, '', 22).setDepth(y + 31);
      const lock = art.text(this, x, y + 20, '', 14, '#ffffff', { stroke: '#5a3a2a', strokeThickness: 4 }).setDepth(y + 31);
      const zone = this.add.zone(x, y - 8, PLOT_W, PLOT_H + 20).setInteractive({ useHandCursor: true }).setDepth(y + 32);
      zone.on('pointerdown', () => { this.focusPlot(i); this.onPlotClick(i); });
      zone.on('pointerover', () => {
        this.focusPlot(i);
        soil.setTint(0xfff5df);
        this.tweens.killTweensOf(crop);
        this.tweens.add({ targets: crop, scale: 1.04, duration: 150, ease: 'Sine.easeOut' });
      });
      zone.on('pointerout', () => {
        if (this.focusedPlot === i) { this.focusedPlot = null; this.plotHint?.setVisible(false); this.plotFocus?.clear(); }
        soil.clearTint();
        this.tweens.killTweensOf(crop);
        this.tweens.add({ targets: crop, scale: 1, duration: 180, ease: 'Sine.easeOut' });
      });
      this.plotViews.push({ soil, crop, status, bar, lock, cropKey: null });
      out.push(soil, crop, bar, status, lock, zone);
    }

    // Vật nuôi
    for (let i = 0; i < MAX_ANIMALS; i++) {
      const { x, y } = animalPos(i);
      const icon = this.add.image(x, y, T.animalTexture(this, 'add')).setOrigin(0.5, 0.88).setDepth(y).setVisible(false);
      icon.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.onAnimalClick(i));
      const status = art.emoji(this, x + 22, y - 74, '', 18).setDepth(9000);
      const barBg = this.add.rectangle(x, y + 8, 56, 7, 0x000000, 0.35).setDepth(9000).setVisible(false);
      const bar = this.add.rectangle(x - 27, y + 8, 54, 5, 0xffd166).setOrigin(0, 0.5).setDepth(9001).setVisible(false);
      this.animalViews.push({ icon, status, barBg, bar, type: null, wander: null });
      out.push(icon, status, barBg, bar);
    }

    // Chó giữ nhà (chỉ hiện khi chủ vườn đã mua)
    this.dog = this.add.image(560, 470, T.dogTexture(this)).setOrigin(0.5, 0.92).setVisible(false);
    out.push(this.dog);

    this.plotFocus = this.add.graphics().setDepth(-879);
    this.plotHint = art.text(this, 0, 0, '', 14, '#fff9e6', {
      backgroundColor: '#3c5139', padding: { x: 12, y: 8 }, align: 'center', lineSpacing: 3,
    }).setOrigin(.5, 1).setDepth(9100).setVisible(false);
    out.push(this.plotFocus, this.plotHint);
    this.updateFarm();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.updateFarm() });
  }

  /** Hàng rào gỗ thấp (60% rào lớn) quanh một mảnh vườn, chừa lối vào 90px ở giữa cạnh `gap`. */
  gardenFence(g: { x: number; y: number; w: number; h: number }, gap: 'top' | 'bottom', out: Obj[]) {
    const S = 0.6;
    const pad = 6;
    const x0 = g.x - pad, x1 = g.x + g.w + pad, y0 = g.y - pad, y1 = g.y + g.h + pad;
    const gapW = 90;
    const mid = (x0 + x1) / 2;
    const hRun = (a: number, b: number, y: number) => {
      out.push(this.add.tileSprite(a, y, b - a, 60 * S, 'fence_h').setTileScale(S).setOrigin(0, 0.92).setDepth(y));
    };
    const vRun = (x: number) => {
      out.push(this.add.tileSprite(x, y0, 24 * S, y1 - y0, 'fence_v').setTileScale(S).setOrigin(0.5, 0).setDepth(y0 + 1));
    };
    for (const [y, open] of [[y0, gap === 'top'], [y1, gap === 'bottom']] as const) {
      if (open) { hRun(x0, mid - gapW / 2, y); hRun(mid + gapW / 2, x1, y); } else hRun(x0, x1, y);
    }
    vRun(x0); vRun(x1);
  }

  isOwner() {
    return this.zone?.ownerId != null && this.zone.ownerId === get().me?.id;
  }

  focusPlot(i: number) {
    if (!this.plotHint || !this.plotFocus || this.traveling || this.arriving) return;
    const pl = get().farm?.plots[i];
    if (!pl) { this.focusedPlot = null; this.plotHint.setVisible(false); this.plotFocus.clear(); return; }
    this.focusedPlot = i;
    const { x, y } = plotPos(i);
    const ready = pl.crop && plotStage(pl) === 3;
    const description = !pl.crop ? (this.isOwner() ? 'Chọn hạt giống để gieo' : 'Chưa gieo hạt')
      : ready ? (this.isOwner() ? 'Đã chín · Chạm để thu hoạch' : 'Cây đã chín')
      : `${fmtTime(plotRemainMs(pl))} nữa · ${canWater(pl) ? 'Có thể tưới nước' : 'Đang lớn'}`;
    this.plotHint.setText(`${pl.crop ? CROPS[pl.crop].name : 'Ô đất trống'}\n${description}`);
    const cam = this.cameras.main;
    const margin = this.plotHint.width / 2 + 12;
    const left = cam.worldView.left + margin, right = cam.worldView.right - margin;
    this.plotHint.setPosition(left <= right ? Phaser.Math.Clamp(x, left, right) : cam.midPoint.x, y - 76).setVisible(true);
    this.plotFocus.clear().lineStyle(2, 0xffedba, .95)
      .strokeRoundedRect(x - PLOT_W / 2 - 3, y - PLOT_H / 2 - 3, PLOT_W + 6, PLOT_H + 6, 17);
  }

  wander(v: AnimalView) {
    if (!v.type) return;
    const tx = PEN.x + 40 + Math.random() * (PEN.w - 80);
    const ty = PEN.y + 120 + Math.random() * (PEN.h - 150);
    v.icon.setFlipX(tx < v.icon.x);
    v.wander = this.tweens.add({
      targets: v.icon, x: tx, y: ty, duration: Phaser.Math.Distance.Between(v.icon.x, v.icon.y, tx, ty) * 25,
      delay: 1800 + Math.random() * 4000, ease: 'Sine.easeInOut',
      onUpdate: () => v.icon.setDepth(v.icon.y),
      onComplete: () => this.wander(v),
    });
  }

  /** Chó đi dạo quanh sân trước nhà và dọc lối đi. */
  dogWander() {
    const dog = this.dog;
    if (!dog || !dog.visible || this.dogChasing) return;
    const spots: [number, number][] = [[420, 470], [640, 470], [860, 472], [980, 620], [990, 860], [700, 466]];
    const [tx, ty] = spots[Math.floor(Math.random() * spots.length)];
    dog.setFlipX(tx < dog.x);
    this.dogTween = this.tweens.add({
      targets: dog, x: tx, y: ty, delay: 1500 + Math.random() * 3000,
      duration: Phaser.Math.Distance.Between(dog.x, dog.y, tx, ty) * 14, ease: 'Sine.easeInOut',
      onUpdate: () => dog.setDepth(dog.y),
      onComplete: () => this.dogWander(),
    });
  }

  /** Chó phát hiện kẻ trộm: lao tới sủa rồi rượt ra cổng. */
  onDogChase({ thiefId, plot, animal }: { thiefId: number; plot?: number; animal?: number }) {
    const dog = this.dog;
    if (!dog || this.zone?.kind !== 'farm') return;
    const thief = this.players.get(thiefId);
    const fallback = animal != null ? this.animalViews[animal]?.icon : null;
    const target = thief ? { x: thief.x, y: thief.y } : fallback ? { x: fallback.x, y: fallback.y } : plotPos(plot ?? 0);
    this.dogChasing = true;
    this.dogTween?.stop();
    dog.setVisible(true).setFlipX(target.x < dog.x);
    sfx('bark');
    const bark = art.transient(this, art.text(this, target.x, target.y - 120, '🐕 Gâu! Gâu!', 20, '#ffffff', { stroke: '#7a1f1a', strokeThickness: 5 }).setDepth(9999));
    this.tweens.add({ targets: bark, y: bark.y - 30, alpha: 0, delay: 900, duration: 700, onComplete: () => bark.destroy() });
    const F = FARM_FENCE;
    const gate = { x: F.gateX + F.gateW / 2, y: F.y + F.h + 40 };
    this.tweens.add({
      targets: dog, x: target.x - (target.x < dog.x ? -40 : 40), y: target.y,
      duration: Math.max(250, Phaser.Math.Distance.Between(dog.x, dog.y, target.x, target.y) * 2.2), ease: 'Quad.easeIn',
      onUpdate: () => dog.setDepth(dog.y),
      onComplete: () => {
        sfx('bark');
        // kẻ trộm bỏ chạy ra cổng; nếu là mình thì tự chạy (đồng bộ qua mạng)
        if (thiefId === get().me?.id) this.walkRoute(gate.x, gate.y, () => {});
        this.tweens.add({
          targets: dog, x: gate.x, y: gate.y - 60, delay: 250, duration: 1400, ease: 'Sine.easeInOut',
          onStart: () => dog.setFlipX(gate.x < dog.x),
          onUpdate: () => dog.setDepth(dog.y),
          onComplete: () => { this.dogChasing = false; this.dogWander(); },
        });
      },
    });
  }

  updateFarm() {
    const farm = get().farm;
    if (!farm || !this.plotViews.length) return;
    const owner = this.isOwner();
    if (this.dog && !!farm.dog !== this.dog.visible) {
      this.dog.setVisible(!!farm.dog);
      if (farm.dog) this.dogWander();
    }

    this.plotViews.forEach((v, i) => {
      const { x, y } = plotPos(i);
      const pl = farm.plots[i];
      // Gom nội dung rồi chỉ đổi khi khác: đổi chữ Phaser = vẽ lại ảnh chữ + tải lên GPU (rất tốn nếu mỗi giây)
      let status = '', lock = '', lockY = y + 20, lockSize = 14, barPr = -1;
      if (!pl) {
        v.cropKey = null;
        v.crop.setVisible(false);
        setTex(v.soil, 'soil_locked');
        v.soil.setVisible(owner && i === farm.plots.length);
        if (owner && i === farm.plots.length) lock = `🔒 ${fmt(plotPrice(farm.plots.length))} xu`;
      } else {
        v.soil.setVisible(true);
        if (!pl.crop) {
          setTex(v.soil, 'soil');
          v.crop.setVisible(false);
          v.cropKey = null;
        } else {
          const st = plotStage(pl);
          setTex(v.soil, pl.waterStage === st && st < 3 ? 'soil_wet' : 'soil');
          const cropKey = T.cropTexture(this, pl.crop, st);
          v.crop.setVisible(true);
          if (v.cropKey !== cropKey) {
            v.crop.setTexture(cropKey);
            // Chỉ chuyển động khi cây thay đổi, không khởi động lại mỗi giây.
            this.tweens.killTweensOf(v.crop);
            v.crop.setScale(v.cropKey ? .86 : .94).setAlpha(.6);
            this.tweens.add({ targets: v.crop, scale: 1, alpha: 1, duration: 340, ease: 'Sine.easeOut' });
            v.cropKey = cropKey;
          }
          if (st === 3) {
            const canSteal = !owner && pl.yieldLeft > 0;
            status = owner ? '✨' : canSteal ? '🖐️' : '';
          } else {
            if (canWater(pl)) status = '💧';
            barPr = plotProgress(pl);
            lock = clock(plotRemainMs(pl));
            lockY = y + PLOT_H / 2 + 12;
            lockSize = 12;
          }
        }
      }
      // Đất màu mỡ: đất sẫm, ấm hơn
      const tint = pl?.lvl ? 0xc98a4a : 0xffffff;
      if (v.soil.tintTopLeft !== tint) { if (pl?.lvl) v.soil.setTint(tint); else v.soil.clearTint(); }
      if (pl?.lvl && !status && !lock) status = '✨';
      setTxt(v.status, status);
      if (lock) { if (v.lock.y !== lockY) v.lock.setY(lockY); if (v.lock.style.fontSize !== `${lockSize}px`) v.lock.setFontSize(lockSize); }
      setTxt(v.lock, lock);
      v.bar.clear();
      if (barPr >= 0) {
        v.bar.fillStyle(0x000000, 0.35).fillRoundedRect(x - 36, y + PLOT_H / 2 - 4, 72, 8, 4);
        v.bar.fillStyle(0x80ed99, 1).fillRoundedRect(x - 35, y + PLOT_H / 2 - 3, 70 * barPr, 6, 3);
      }
    });

    this.animalViews.forEach((v, i) => {
      const an = farm.animals[i];
      v.barBg.setVisible(false);
      v.bar.setVisible(false);
      if (!an) {
        setTxt(v.status, '');
        v.wander?.stop(); v.wander = null; v.type = null;
        const { x, y } = animalPos(i);
        v.icon.setPosition(x, y).setTexture(T.animalTexture(this, 'add')).setScale(.85).setAlpha(.8).setFlipX(false).setVisible(owner && i === farm.animals.length);
        return;
      }
      const def = ANIMALS[an.type];
      if (v.type !== an.type) {
        v.type = an.type;
        v.icon.setTexture(T.animalTexture(this, an.type)).setScale(an.type === 'ga' ? .72 : .9).setAlpha(1).setVisible(true);
        this.wander(v);
      }
      const remain = animalRemainMs(an);
      if (remain < 0) setTxt(v.status, owner ? '🌾' : '');
      else if (remain === 0) {
        // Chủ: biểu tượng sản phẩm để thu; khách: 🖐️ nếu còn lấy trộm được
        const canSteal = !owner && (an.left ?? def.qty) > 0;
        setTxt(v.status, owner ? ITEMS[def.product].icon : canSteal ? '🖐️' : '');
      }
      else {
        setTxt(v.status, '');
        v.barBg.setVisible(true);
        v.bar.setVisible(true).setSize(54 * (1 - remain / an.produceMs), 5);
      }
    });
    if (this.focusedPlot != null) this.focusPlot(this.focusedPlot);
  }

  update(_t: number, dt: number) {
    for (const v of this.animalViews) {
      v.status.setPosition(v.icon.x + 26, v.icon.y - (v.type === 'ga' ? 66 : 82));
      v.barBg.setPosition(v.icon.x, v.icon.y + 10);
      v.bar.setPosition(v.icon.x - 27, v.icon.y + 10);
    }
  }

  async onPlotClick(i: number) {
    if (this.busyPlots.has(i) || this.traveling || this.arriving) return;
    this.busyPlots.add(i);
    try { await this.actOnPlot(i); }
    finally { this.busyPlots.delete(i); }
  }

  private async actOnPlot(i: number) {
    const farm = get().farm;
    const ownerId = this.zone?.ownerId;
    if (!farm || ownerId == null || this.traveling) return;
    const owner = this.isOwner();
    const { x, y } = plotPos(i);
    const pl = farm.plots[i];

    if (!pl) {
      if (!owner || i !== farm.plots.length) return;
      const price = plotPrice(farm.plots.length);
      confirmBox(`Mở thêm 1 ô đất với giá ${fmt(price)} xu?`, () => call('farm:buyPlot'));
      return;
    }
    // Công cụ "Nâng đất": biến ô thành Đất màu mỡ (sản lượng ×1,5)
    if (owner && get().farmTool === 'upgrade') {
      if (farm.plots.length < MAX_PLOTS) return toast(`Cần mở hết ${MAX_PLOTS} ô đất mới nâng cấp được (đang có ${farm.plots.length})`);
      if (pl.lvl) return toast('✨ Ô này đã là Đất màu mỡ rồi');
      if ((get().me?.level ?? 0) < ECON.plotUpgradeLevel) return toast(`Cần cấp ${ECON.plotUpgradeLevel} để nâng cấp đất`);
      const mult = String(ECON.plotUpgradeMult).replace('.', ',');
      confirmBox(`Nâng ô đất này thành ✨ Đất màu mỡ (sản lượng ×${mult}) với giá ${fmt(ECON.plotUpgradePrice)} xu?`, async () => {
        const r = await call('farm:upgradePlot', { plot: i });
        if (r.ok) {
          sfx('levelup'); art.farmParticles(this, x, y, 'harvest');
          this.floatText(x, y - 38, r.boosted ? `✨ Đất màu mỡ · vụ này ×${mult}!` : '✨ Đất màu mỡ!', '#fff3b0');
        }
      });
      return;
    }
    if (!pl.crop) {
      if (!owner) return toast('Ô đất trống');
      const tool = get().farmTool;
      if (!tool.startsWith('seed:')) return toast('Chọn hạt giống ở thanh công cụ bên dưới 🌱');
      const crop = tool.slice(5);
      if (!get().me?.inventory[`seed:${crop}`]) return toast('Bạn đã hết hạt giống này, hãy mua thêm ở cửa hàng');
      const r = await call('farm:plant', { plot: i, crop });
      if (r.ok) { sfx('plant'); art.farmParticles(this, x, y, 'plant'); this.floatText(x, y - 38, 'Đã gieo hạt', '#e7f1c5'); }
      return;
    }
    const st = plotStage(pl);
    if (st === 3) {
      if (owner) {
        const r = await call('farm:harvest', { plot: i });
        if (r.ok) { sfx('harvest'); art.farmParticles(this, x, y - 10, 'harvest'); this.flyToBag(x, y - 20, ITEMS[r.item].icon, r.qty); this.floatText(x, y - 38, `+${r.qty} ${ITEMS[r.item].icon}  +${r.xp}xp`, '#fff3b0'); }
      } else {
        await this.startSteal('plot', i, x, y + 30);
      }
      return;
    }
    if (canWater(pl)) {
      const r = await call('farm:water', { owner: ownerId, plot: i });
      if (r.ok) { sfx('water'); art.farmParticles(this, x, y, 'water'); this.bounce(this.plotViews[i].crop); this.floatText(x, y - 38, 'Đã tưới nước', '#d5f2ff'); }
      return;
    }
    toast(`${CROPS[pl.crop].name}: còn ${fmtTime(plotRemainMs(pl))} nữa là chín`);
  }

  /** Nảy nhẹ (co giãn) một vật thể. */
  bounce(obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text) {
    const sx = obj.scaleX, sy = obj.scaleY;
    this.tweens.add({ targets: obj, scaleX: sx * 1.12, scaleY: sy * 0.86, duration: 110, yoyo: true, ease: 'Sine.easeOut',
      onComplete: () => obj.setScale(sx, sy) });
  }

  /** Nông sản bay vào túi đồ (góc dưới-phải màn hình). */
  flyToBag(x: number, y: number, icon: string, qty: number) {
    const cam = this.cameras.main;
    const view = cam.worldView;
    const tx = view.right - 60 / cam.zoom * 1.5, ty = view.bottom - 110 / cam.zoom * 1.5;
    for (let k = 0; k < Math.min(qty, 5); k++) {
      const e = art.transient(this, art.emoji(this, x + (Math.random() - 0.5) * 30, y, icon, 30).setDepth(9990));
      this.tweens.add({
        targets: e, y: y - 50 - Math.random() * 20, duration: 260, delay: k * 70, ease: 'Quad.easeOut',
        onComplete: () => this.tweens.add({
          targets: e, x: tx, y: ty, scale: 0.4, alpha: 0.6, duration: 650, ease: 'Cubic.easeIn',
          onComplete: () => e.destroy(),
        }),
      });
    }
  }

  async onAnimalClick(i: number) {
    const farm = get().farm;
    if (!farm || this.traveling) return;
    const owner = this.isOwner();
    const an = farm.animals[i];
    const v = this.animalViews[i];
    if (!an) {
      if (owner && i === farm.animals.length) set({ panel: 'shop', shopTab: 'animal' });
      return;
    }
    if (!owner) {
      // Khách: sản phẩm đã có → lượm trộm cả lứa; chưa có → bắt trộm luôn con vật (lâu hơn)
      const def = ANIMALS[an.type];
      if (animalRemainMs(an) === 0 && (an.left ?? def.qty) > 0) {
        await this.startSteal('produce', i, v.icon.x, v.icon.y + 20);
      } else {
        const sec = Math.round(ECON.stealAnimalSec + def.price / 100);
        confirmBox(`Bắt trộm con ${def.icon} ${def.name} của ${this.zone?.ownerName}? Mất khoảng ${sec} giây đứng bắt — dễ bị chủ, chó hoặc cảnh sát phát hiện!`,
          () => this.startSteal('animal', i, v.icon.x, v.icon.y + 20));
      }
      return;
    }
    const def = ANIMALS[an.type];
    const remain = animalRemainMs(an);
    if (remain < 0) {
      const r = await call('farm:feed', { idx: i });
      if (r.ok) { sfx('pop'); this.bounce(v.icon); this.floatText(v.icon.x, v.icon.y - 60, `🌾 -${def.feed}`); }
    } else if (remain === 0) {
      const r = await call('farm:collect', { idx: i });
      if (r.ok) { sfx('harvest'); this.flyToBag(v.icon.x, v.icon.y - 40, ITEMS[r.item].icon, r.qty); this.floatText(v.icon.x, v.icon.y - 60, `+${r.qty} ${ITEMS[r.item].icon}`, '#fff3b0'); }
    } else {
      toast(`${def.name}: còn ${fmtTime(remain)} nữa`);
    }
  }

  // ------------------------------------------------------------ Khu vui chơi
  buildFun(out: Obj[]) {
    const def = ZONES.fun;
    const key = T.groundTexture(this, 'ground_fun2', {
      w: def.w, h: def.h, seed: 'fun2',
      pavements: [FUN_PLAZA],
      road: def.road,
    });
    out.push(this.add.image(0, 0, key).setOrigin(0).setDepth(-1000));

    // Đu quay phía sau tòa Khu giải trí
    const R = 170, cx = 1000, cy = 178;
    T.ferrisTextures(this, R);
    const wheel = this.add.image(cx, cy, 'fw_wheel').setDepth(100);
    const cabins = Array.from({ length: 10 }, (_, i) => this.add.image(cx, cy, `fw_cabin_${i % 6}`).setOrigin(0.5, 0.05).setDepth(110));
    const stand = this.add.image(cx, cy - 20, 'fw_stand').setOrigin(0.5, 0).setDepth(120);
    cabins.forEach((c, i) => { const a = (i / cabins.length) * Math.PI * 2; c.setPosition(cx + Math.cos(a) * R, cy + Math.sin(a) * R); });
    out.push(wheel, stand, ...cabins);

    // Hàng cây làm nền phía sau dãy nhà (chừa chỗ cho đu quay)
    const kinds: T.TreeKind[] = ['oak', 'pine', 'blossom', 'oak', 'birch'];
    for (let i = 0, x = 30; x < def.w; i++, x += 105) {
      if (x > 790 && x < 1210) continue;
      art.tree(this, x + (i % 2) * 20, 250 - (i % 3) * 22, out, kinds[i % kinds.length], 0.9);
    }
    // Bụi hoa giữa các tòa nhà
    for (const [x, c] of [[60, '#ff8fab'], [645, '#ffd43b'], [1355, '#ff8fab'], [1945, '#b197fc']] as [number, string][]) art.bush(this, x, 566, out, c);

    // Đèn, ghế, chậu hoa hai bên sân (giữa sân để trống làm lối đi)
    T.lampTexture(this); T.benchTexture(this);
    for (const x of [110, 640, 1360, 1890]) art.prop(this, 'lamp', x, 610, out);
    for (const x of [360, 1640]) art.prop(this, 'bench', x, 720, out);
    for (const x of [250, 470, 1530, 1750]) art.bush(this, x, 726, out, x < 1000 ? '#ff8fab' : '#ffd43b');
    const pots = ['#ff6b8b', '#ffd43b', '#b197fc', '#ffffff'];
    for (let x = 120, k = 0; x < def.w; x += 190, k++) {
      if (x > 1000 && x < 1320) continue; // lối ra trạm xe buýt
      art.flowers(this, x, 838, out, pots[k % pots.length]);
    }

    // Dây đèn màu nối các tòa nhà
    this.stringLights(535, 330, 765, 300, out);
    this.stringLights(1235, 300, 1465, 330, out);
  }

  stringLights(x1: number, y1: number, x2: number, y2: number, out: Obj[]) {
    const g = this.add.graphics().setDepth(5000);
    g.lineStyle(2, 0x5a4a3a, 0.8);
    const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(x1, y1), new Phaser.Math.Vector2((x1 + x2) / 2, Math.max(y1, y2) + 60), new Phaser.Math.Vector2(x2, y2));
    curve.draw(g, 32);
    out.push(g);
    const cols = [0xe63946, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xff70a6];
    curve.getSpacedPoints(10).forEach((p, i) => {
      const c = this.add.circle(p.x, p.y + 6, 6, cols[i % cols.length]).setDepth(5001);
      out.push(c);
    });
  }

  // ------------------------------------------------------------ Công viên
  buildPark(out: Obj[]) {
    const def = ZONES.park;
    const pond = { x: 830, y: 640, w: 740, h: 380 };
    const key = T.groundTexture(this, 'ground_park', {
      w: def.w, h: def.h, seed: 'park',
      ponds: [pond],
      paths: [{
        pts: [[1760, 650], [1320, 650], [1270, 360], [830, 300], [390, 370], [300, 650], [390, 930], [830, 990], [1270, 930], [1320, 650]],
        width: 62,
      }],
    });
    out.push(this.add.image(0, 0, key).setOrigin(0).setDepth(-1000));
    art.pondLife(this, pond, out);
    T.lampTexture(this); T.benchTexture(this);
    for (const [x, y] of [[1270, 300], [400, 300], [400, 1010], [1270, 1010], [830, 250]]) art.prop(this, 'lamp', x, y, out);
    for (const [x, y] of [[620, 290], [1040, 290], [620, 1050], [1040, 1050], [240, 660]]) art.prop(this, 'bench', x, y, out);
    for (const [x, y, k] of [
      [140, 160, 'pine'], [380, 140, 'blossom'], [620, 150, 'oak'], [1050, 140, 'blossom'], [1300, 170, 'oak'], [1560, 160, 'pine'],
      [140, 1200, 'oak'], [430, 1220, 'blossom'], [760, 1240, 'fruit'], [1100, 1220, 'blossom'], [1450, 1210, 'oak'], [1680, 1100, 'birch'],
      [120, 480, 'birch'], [110, 860, 'blossom'], [1560, 380, 'blossom'], [1580, 930, 'oak'],
    ] as [number, number, T.TreeKind][]) art.tree(this, x, y, out, k);
    for (const [x, y, c] of [[520, 470, '#ff8fab'], [1140, 470, '#ffd43b'], [520, 830, '#ffffff'], [1140, 830, '#b197fc']] as const) art.flowers(this, x, y, out, c);
  }
}


/** Chỉ đổi chữ khi khác (Phaser vẽ lại ảnh chữ + tải lên GPU mỗi lần setText). */
function setTxt(t: Phaser.GameObjects.Text, str: string) {
  if (t.text !== str) t.setText(str);
}
/** Chỉ đổi ảnh khi khác. */
function setTex(img: Phaser.GameObjects.Image, key: string) {
  if (img.texture.key !== key) img.setTexture(key);
}
