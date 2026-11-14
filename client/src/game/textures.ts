import Phaser from 'phaser';

// Tất cả hình ảnh trong thế giới được vẽ bằng Canvas 2D (có gradient, đổ bóng)
// rồi dùng làm texture cho Phaser. Mỗi texture chỉ vẽ một lần.

type Ctx = CanvasRenderingContext2D;

/** Canvas tạm nằm ở CPU (willReadFrequently) để đọc/ghi điểm ảnh nhanh, dùng lại giữa các lần vẽ. */
let scratch: HTMLCanvasElement | null = null;
function scratchCtx(w: number, h: number) {
  if (!scratch) scratch = document.createElement('canvas');
  scratch.width = w;
  scratch.height = h; // đặt lại kích thước cũng xoá sạch canvas
  return scratch.getContext('2d', { willReadFrequently: true })!;
}

export function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx, w: number, h: number) => void) {
  if (!scene.textures.exists(key)) {
    const W = Math.ceil(w), H = Math.ceil(h);
    const ctx = scratchCtx(W, H);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    draw(ctx, w, h);
    if (!NO_OUTLINE.some((p) => key.startsWith(p))) outline(ctx, W, H);
    const t = scene.textures.createCanvas(key, W, H)!;
    t.getContext().drawImage(scratch!, 0, 0);
    t.refresh();
  }
  return key;
}

/** Các texture không cần viền (nền, trời, hiệu ứng mờ). */
const NO_OUTLINE = ['ground_', 'sky', 'cloud', 'hills_', 'road_strip', 'vignette', 'smoke', 'cloud_shadow', 'soil', 'butterfly', 'fw_wheel', 'signboard', 'lily', 'lotus', 'reeds', 'flowers_'];

/**
 * Viền đậm kiểu hoạt hình: tô màu nâu sẫm vào những điểm trong suốt nằm sát
 * phần hình đặc (alpha > 170). Bóng đổ mờ (alpha thấp) không bị viền.
 */
function outline(ctx: Ctx, w: number, h: number, r = 2, color: [number, number, number] = [58, 42, 38]) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) solid[i] = d[i * 4 + 3] > 170 ? 1 : 0;
  // Giãn nở tách 2 chiều (ngang rồi dọc) → O(w·h·r) thay vì O(w·h·r²).
  const horiz = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dx = -r; dx <= r && !v; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) v = solid[row + xx]; }
      horiz[row + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid[i]) continue;
      let near = 0;
      for (let dy = -r; dy <= r && !near; dy++) { const yy = y + dy; if (yy >= 0 && yy < h) near = horiz[yy * w + x]; }
      if (!near) continue;
      const a = d[i * 4 + 3] / 255; // trộn với bóng đổ đang có
      d[i * 4] = Math.round(color[0] * (1 - a * 0.3) + d[i * 4] * a * 0.3);
      d[i * 4 + 1] = Math.round(color[1] * (1 - a * 0.3) + d[i * 4 + 1] * a * 0.3);
      d[i * 4 + 2] = Math.round(color[2] * (1 - a * 0.3) + d[i * 4 + 2] * a * 0.3);
      d[i * 4 + 3] = 235;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number | [number, number, number, number]) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br); ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl); ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}
function lin(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function rad(ctx: Ctx, x: number, y: number, r0: number, r: number, stops: [number, string][], fx = x, fy = y) {
  const g = ctx.createRadialGradient(fx, fy, r0, x, y, r);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function shadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, a = 0.22) {
  ctx.save();
  ctx.fillStyle = rad(ctx, x, y, 0, rx, [[0, `rgba(30,40,20,${a})`], [0.7, `rgba(30,40,20,${a * 0.6})`], [1, 'rgba(30,40,20,0)']]);
  ctx.scale(1, ry / rx);
  ctx.beginPath(); ctx.arc(x, y * (rx / ry), rx, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function blob(ctx: Ctx, x: number, y: number, r: number, light: string, mid: string, dark: string) {
  ctx.fillStyle = rad(ctx, x, y, r * 0.1, r, [[0, light], [0.55, mid], [1, dark]], x - r * 0.35, y - r * 0.4);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// ===================================================================== MẶT ĐẤT

export interface GroundSpec {
  w: number; h: number; seed: string;
  paths?: { pts: [number, number][]; width: number }[];
  plazas?: { x: number; y: number; r: number }[];
  ponds?: { x: number; y: number; w: number; h: number }[];
  road?: { y: number; h: number; sidewalk: number };
  dirtAreas?: { x: number; y: number; w: number; h: number }[];
  /** Sân lát đá kiểu gạch so le. */
  pavements?: { x: number; y: number; w: number; h: number }[];
}

function pondShape(ctx: Ctx, p: { x: number; y: number; w: number; h: number }, scale: number, seed: number) {
  const r = rng(seed);
  const n = 28;
  const offs = Array.from({ length: n }, () => 0.92 + r() * 0.12);
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const k = offs[i % n] * scale;
    const x = p.x + Math.cos(t) * (p.w / 2) * k;
    const y = p.y + Math.sin(t) * (p.h / 2) * k;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function groundTexture(scene: Phaser.Scene, key: string, spec: GroundSpec) {
  return tex(scene, key, spec.w, spec.h, (ctx, w, h) => {
    const r = rng(hashStr(spec.seed));
    // nền cỏ
    ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, '#86c35f'], [1, '#79b856']]);
    ctx.fillRect(0, 0, w, h);
    const tones = ['#9bd06d', '#6fae4c', '#a8d877', '#73b450', '#8fcb64'];
    for (let i = 0; i < (w * h) / 9000; i++) {
      const x = r() * w, y = r() * h, rr2 = 60 + r() * 220;
      const c = tones[Math.floor(r() * tones.length)];
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = rad(ctx, x, y, 0, rr2, [[0, c], [1, 'rgba(0,0,0,0)']]);
      ctx.fillRect(x - rr2, y - rr2, rr2 * 2, rr2 * 2);
    }
    ctx.globalAlpha = 1;

    // đất trống (vườn)
    for (const a of spec.dirtAreas ?? []) {
      ctx.save();
      ctx.shadowColor = 'rgba(60,40,20,0.35)'; ctx.shadowBlur = 18;
      rr(ctx, a.x, a.y, a.w, a.h, 26);
      ctx.fillStyle = lin(ctx, 0, a.y, 0, a.y + a.h, [[0, '#c7a57a'], [1, '#b8946a']]);
      ctx.fill();
      ctx.restore();
      for (let i = 0; i < (a.w * a.h) / 300; i++) {
        ctx.fillStyle = r() > 0.5 ? 'rgba(120,85,50,0.35)' : 'rgba(230,205,160,0.35)';
        ctx.beginPath(); ctx.ellipse(a.x + 10 + r() * (a.w - 20), a.y + 10 + r() * (a.h - 20), 1 + r() * 3, 1 + r() * 2, 0, 0, 7); ctx.fill();
      }
    }

    // sân lát đá
    for (const p of spec.pavements ?? []) {
      ctx.fillStyle = '#bdb5a7'; ctx.fillRect(p.x, p.y, p.w, p.h);
      const tw = 64, th = 40;
      const tones = ['#e7e2d8', '#ddd7cb', '#d2cbbd', '#e2dccf', '#d8d1c3'];
      for (let row = 0, y = p.y; y < p.y + p.h; row++, y += th) {
        for (let x = p.x - (row % 2 ? tw / 2 : 0); x < p.x + p.w; x += tw) {
          ctx.fillStyle = tones[Math.floor(r() * tones.length)];
          rr(ctx, x + 2, y + 2, tw - 4, th - 4, 5); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 6, y + 4, tw - 14, 3);
          ctx.fillStyle = 'rgba(90,80,60,0.12)'; ctx.fillRect(x + 4, y + th - 7, tw - 10, 3);
        }
      }
      ctx.fillStyle = '#9c9384'; ctx.fillRect(p.x, p.y - 4, p.w, 8);
      ctx.fillStyle = '#c9c1b2'; ctx.fillRect(p.x, p.y - 4, p.w, 3);
    }

    // ao
    for (const p of spec.ponds ?? []) {
      const sd = hashStr(spec.seed + p.x);
      ctx.save();
      pondShape(ctx, p, 1.12, sd); ctx.fillStyle = '#a7c97a'; ctx.fill();
      pondShape(ctx, p, 1.06, sd); ctx.fillStyle = '#c9b48a'; ctx.fill();
      pondShape(ctx, p, 1.0, sd);
      ctx.fillStyle = rad(ctx, p.x, p.y, 0, Math.max(p.w, p.h) / 2, [[0, '#2f8fbf'], [0.6, '#4fb0da'], [1, '#86d2ec']]);
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = 'rgba(20,70,110,0.25)'; ctx.lineWidth = 10;
      pondShape(ctx, p, 1.0, sd); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.ellipse(p.x - p.w * 0.3 + r() * p.w * 0.6, p.y - p.h * 0.3 + r() * p.h * 0.6, 20 + r() * 40, 3, 0, 0, 7);
        ctx.fill();
      }
      ctx.restore();
    }

    // lối đi đất
    for (const pth of spec.paths ?? []) {
      const stroke = (width: number, color: string, blur = 0) => {
        ctx.save();
        if (blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
        ctx.strokeStyle = color; ctx.lineWidth = width;
        ctx.beginPath();
        pth.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.restore();
      };
      stroke(pth.width + 14, 'rgba(150,120,70,0.35)', 10);
      stroke(pth.width + 4, '#cfae7e');
      stroke(pth.width - 6, '#e2c696');
      // sỏi
      for (let s = 0; s < pth.pts.length - 1; s++) {
        const [x0, y0] = pth.pts[s];
        const [x1, y1] = pth.pts[s + 1];
        const len = Math.hypot(x1 - x0, y1 - y0);
        for (let i = 0; i < len / 6; i++) {
          const t = r();
          const off = (r() - 0.5) * (pth.width - 14);
          const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
          ctx.fillStyle = r() > 0.5 ? 'rgba(170,135,90,0.5)' : 'rgba(250,235,205,0.6)';
          ctx.beginPath();
          ctx.ellipse(x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off, 2 + r() * 3, 1.5 + r() * 2, r() * 3, 0, 7);
          ctx.fill();
        }
      }
    }

    // quảng trường lát đá
    for (const pl of spec.plazas ?? []) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r + 10, 0, 7); ctx.fillStyle = '#cdb994'; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r, 0, 7);
      ctx.fillStyle = rad(ctx, pl.x, pl.y, 0, pl.r, [[0, '#f6ead2'], [1, '#e8d6b3']]); ctx.fill();
      ctx.strokeStyle = 'rgba(160,130,90,0.35)'; ctx.lineWidth = 2;
      for (let rr3 = 50; rr3 < pl.r; rr3 += 42) { ctx.beginPath(); ctx.arc(pl.x, pl.y, rr3, 0, 7); ctx.stroke(); }
      for (let a = 0; a < 24; a++) {
        const t = (a / 24) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(pl.x + Math.cos(t) * 50, pl.y + Math.sin(t) * 50);
        ctx.lineTo(pl.x + Math.cos(t) * pl.r, pl.y + Math.sin(t) * pl.r); ctx.stroke();
      }
    }

    // cỏ lá nhỏ + hoa dại — chỉ mọc trên nền cỏ (đọc ảnh một lần)
    const img = ctx.getImageData(0, 0, w, h).data;
    const isGrass = (x: number, y: number) => {
      const i = (Math.floor(y) * w + Math.floor(x)) * 4;
      return img[i + 1] > img[i] + 25 && img[i + 1] > img[i + 2] + 25;
    };
    const blades = ['#5f9e3f', '#a9db7a', '#6aa848', '#b6e38a'];
    for (let i = 0; i < (w * h) / 850; i++) {
      const x = r() * w, y = r() * h;
      if (!isGrass(x, y)) continue;
      ctx.strokeStyle = blades[Math.floor(r() * blades.length)];
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 1.1;
      const l = 3 + r() * 4;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 1, y - l * 0.6, x - 2 - r() * 2, y - l);
      ctx.moveTo(x + 2, y); ctx.quadraticCurveTo(x + 3, y - l * 0.6, x + 4 + r() * 2, y - l * 0.9);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const flowerCols = ['#ffffff', '#ffd6e8', '#fff3b0', '#d7c4ff', '#ffb4a2'];
    for (let i = 0; i < (w * h) / 18000; i++) {
      const x = r() * w, y = r() * h;
      if (!isGrass(x, y)) continue;
      const c = flowerCols[Math.floor(r() * flowerCols.length)];
      for (let k = 0; k < 3 + r() * 4; k++) {
        const fx = x + (r() - 0.5) * 26, fy = y + (r() - 0.5) * 16;
        ctx.fillStyle = c;
        for (let pi = 0; pi < 5; pi++) {
          const t = (pi / 5) * Math.PI * 2;
          ctx.beginPath(); ctx.arc(fx + Math.cos(t) * 2.2, fy + Math.sin(t) * 2.2, 1.8, 0, 7); ctx.fill();
        }
        ctx.fillStyle = '#ffc93c'; ctx.beginPath(); ctx.arc(fx, fy, 1.4, 0, 7); ctx.fill();
      }
    }

    // đường nhựa + vỉa hè
    if (spec.road) {
      const { y, h: rh, sidewalk } = spec.road;
      const sy = y - sidewalk;
      ctx.fillStyle = '#e4dccd'; ctx.fillRect(0, sy, w, sidewalk);
      ctx.strokeStyle = 'rgba(150,135,110,0.45)'; ctx.lineWidth = 1.5;
      for (let x = 0; x < w; x += 36) { ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x, y); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(0, sy + sidewalk / 2); ctx.lineTo(w, sy + sidewalk / 2); ctx.stroke();
      ctx.fillStyle = '#c9c2b4'; ctx.fillRect(0, y - 6, w, 8);
      ctx.fillStyle = lin(ctx, 0, y, 0, y + rh, [[0, '#6e7280'], [1, '#5d616d']]);
      ctx.fillRect(0, y + 2, w, rh);
      for (let i = 0; i < (w * rh) / 40; i++) {
        ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
        ctx.fillRect(r() * w, y + 2 + r() * rh, 2, 2);
      }
      ctx.fillStyle = '#ffffff';
      for (let x = 20; x < w; x += 90) rr(ctx, x, y + rh / 2 - 3, 50, 6, 3), ctx.fill();
      ctx.fillStyle = '#7fb85a'; ctx.fillRect(0, y + rh + 2, w, h - y - rh);
    }
  });
}

// ===================================================================== CÂY CỐI

export type TreeKind = 'oak' | 'fruit' | 'blossom' | 'pine' | 'birch';

export function treeTexture(scene: Phaser.Scene, kind: TreeKind, variant = 0) {
  const key = `tree_${kind}_${variant}`;
  return tex(scene, key, 220, 260, (ctx) => {
    const r = rng(hashStr(key));
    const cx = 110, base = 246;
    shadow(ctx, cx + 10, base - 4, 80, 16, 0.28);
    // thân
    ctx.fillStyle = lin(ctx, cx - 12, 0, cx + 12, 0, kind === 'birch'
      ? [[0, '#d9d4c7'], [0.5, '#f5f1e6'], [1, '#bcb6a6']]
      : [[0, '#6b4429'], [0.5, '#8f6038'], [1, '#5a3820']]);
    ctx.beginPath();
    ctx.moveTo(cx - 14, base); ctx.quadraticCurveTo(cx - 8, base - 50, cx - 7, base - 110);
    ctx.lineTo(cx + 7, base - 110); ctx.quadraticCurveTo(cx + 8, base - 50, cx + 14, base);
    ctx.closePath(); ctx.fill();
    if (kind === 'birch') {
      ctx.fillStyle = '#4a4a4a';
      for (let i = 0; i < 6; i++) ctx.fillRect(cx - 7 + r() * 8, base - 20 - r() * 90, 6, 2);
    }

    if (kind === 'pine') {
      const layers = 4;
      for (let i = 0; i < layers; i++) {
        const yb = base - 70 - i * 42;
        const half = 78 - i * 15;
        ctx.fillStyle = lin(ctx, cx - half, 0, cx + half, 0, [[0, '#3f7d4a'], [0.45, '#2f6b3e'], [1, '#1f4f2c']]);
        ctx.beginPath();
        ctx.moveTo(cx - half, yb);
        for (let k = 0; k <= 6; k++) ctx.lineTo(cx - half + (k * half * 2) / 6, yb + (k % 2 ? 6 : 0));
        ctx.lineTo(cx, yb - 70);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(160,220,150,0.35)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - half * 0.6, yb - 8); ctx.lineTo(cx - 4, yb - 60); ctx.stroke();
      }
      return;
    }

    const pal = kind === 'blossom'
      ? ['#ffe3ee', '#ffb3cf', '#e98aac']
      : kind === 'birch' ? ['#d7f0a0', '#9fcf5f', '#6e9e3a']
      : ['#a9dc78', '#5fa845', '#3c7a33'];
    const clusters: [number, number, number][] = [
      [-48, -105, 44], [48, -108, 44], [0, -95, 50], [-28, -150, 44], [30, -150, 44], [0, -185, 42], [-62, -140, 30], [62, -140, 30],
    ];
    // lớp tối phía sau
    for (const [dx, dy, rr2] of clusters) {
      ctx.fillStyle = pal[2];
      ctx.beginPath(); ctx.arc(cx + dx + 4, base + dy + 8, rr2, 0, 7); ctx.fill();
    }
    for (const [dx, dy, rr2] of clusters) blob(ctx, cx + dx, base + dy, rr2, pal[0], pal[1], pal[2]);
    // kết cấu lá
    for (let i = 0; i < 70; i++) {
      const [dx, dy, rr2] = clusters[Math.floor(r() * clusters.length)];
      const a = r() * Math.PI * 2, d = r() * rr2 * 0.85;
      const x = cx + dx + Math.cos(a) * d, y = base + dy + Math.sin(a) * d;
      ctx.fillStyle = y < base + dy ? 'rgba(255,255,255,0.18)' : 'rgba(0,40,0,0.12)';
      ctx.beginPath(); ctx.ellipse(x, y, 6, 3.5, r() * 3, 0, 7); ctx.fill();
    }
    if (kind === 'fruit') {
      for (let i = 0; i < 9; i++) {
        const [dx, dy, rr2] = clusters[Math.floor(r() * clusters.length)];
        const a = r() * Math.PI * 2, d = r() * rr2 * 0.7;
        const x = cx + dx + Math.cos(a) * d, y = base + dy + Math.sin(a) * d;
        blob(ctx, x, y, 6, '#ffb3a7', '#e63946', '#a4161a');
      }
    }
    if (kind === 'blossom') {
      for (let i = 0; i < 30; i++) {
        const [dx, dy, rr2] = clusters[Math.floor(r() * clusters.length)];
        const a = r() * Math.PI * 2, d = r() * rr2 * 0.9;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(cx + dx + Math.cos(a) * d, base + dy + Math.sin(a) * d, 2.4, 0, 7); ctx.fill();
      }
    }
  });
}

export function bushTexture(scene: Phaser.Scene, flower?: string) {
  return tex(scene, `bush_${flower ?? 'plain'}`, 110, 80, (ctx) => {
    shadow(ctx, 55, 70, 48, 9, 0.25);
    const cl: [number, number, number][] = [[-26, -14, 22], [26, -14, 22], [0, -26, 28], [-8, -10, 22], [12, -8, 20]];
    for (const [dx, dy, r] of cl) blob(ctx, 55 + dx, 70 + dy, r, '#a9dc78', '#5fa845', '#3c7a33');
    if (flower) {
      const r = rng(hashStr(flower));
      for (let i = 0; i < 14; i++) {
        const [dx, dy, rad2] = cl[Math.floor(r() * cl.length)];
        const a = r() * 6.28, d = r() * rad2 * 0.8;
        const x = 55 + dx + Math.cos(a) * d, y = 70 + dy + Math.sin(a) * d;
        ctx.fillStyle = flower;
        for (let p = 0; p < 5; p++) { const t = p * 1.256; ctx.beginPath(); ctx.arc(x + Math.cos(t) * 2.6, y + Math.sin(t) * 2.6, 2.2, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, 7); ctx.fill();
      }
    }
  });
}

export function rockTexture(scene: Phaser.Scene) {
  return tex(scene, 'rock', 70, 46, (ctx) => {
    shadow(ctx, 36, 38, 32, 7, 0.25);
    ctx.fillStyle = lin(ctx, 0, 6, 0, 40, [[0, '#c9c9cf'], [1, '#8a8a96']]);
    ctx.beginPath(); ctx.moveTo(8, 38); ctx.quadraticCurveTo(6, 14, 28, 8); ctx.quadraticCurveTo(56, 4, 62, 30); ctx.quadraticCurveTo(64, 40, 50, 40); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(28, 16, 12, 4, -0.2, 0, 7); ctx.fill();
  });
}

export function flowersTexture(scene: Phaser.Scene, color: string) {
  return tex(scene, `flowers_${color}`, 70, 50, (ctx) => {
    const r = rng(hashStr(color));
    for (let i = 0; i < 9; i++) {
      const x = 8 + r() * 54, y = 20 + r() * 24;
      ctx.strokeStyle = '#4f8a3a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = '#5fa845'; ctx.beginPath(); ctx.ellipse(x + 3, y + 5, 3, 1.5, 0.5, 0, 7); ctx.fill();
      ctx.fillStyle = color;
      for (let p = 0; p < 5; p++) { const t = p * 1.256; ctx.beginPath(); ctx.arc(x + Math.cos(t) * 3, y + Math.sin(t) * 3, 2.6, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill();
    }
  });
}

// ===================================================================== HÀNG RÀO

export function fenceTextures(scene: Phaser.Scene) {
  tex(scene, 'fence_h', 48, 60, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(0, 52, 48, 6);
    const rail = (y: number) => { ctx.fillStyle = lin(ctx, 0, y, 0, y + 7, [[0, '#e8c99a'], [1, '#b98d5c']]); ctx.fillRect(0, y, 48, 7); };
    rail(20); rail(36);
    ctx.fillStyle = lin(ctx, 4, 0, 16, 0, [[0, '#d9b07a'], [0.5, '#f0d0a0'], [1, '#a87a48']]);
    ctx.beginPath(); ctx.moveTo(4, 54); ctx.lineTo(4, 12); ctx.lineTo(10, 4); ctx.lineTo(16, 12); ctx.lineTo(16, 54); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,30,0.4)'; ctx.lineWidth = 1; ctx.stroke();
  });
  tex(scene, 'fence_v', 24, 48, (ctx) => {
    ctx.fillStyle = lin(ctx, 8, 0, 16, 0, [[0, '#e8c99a'], [1, '#b98d5c']]); ctx.fillRect(9, 0, 6, 48);
    ctx.fillStyle = lin(ctx, 4, 0, 20, 0, [[0, '#d9b07a'], [0.5, '#f0d0a0'], [1, '#a87a48']]);
    rr(ctx, 5, 4, 14, 22, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,30,0.4)'; ctx.stroke();
  });
  tex(scene, 'gate_post', 34, 120, (ctx) => {
    ctx.fillStyle = lin(ctx, 4, 0, 30, 0, [[0, '#a87a48'], [0.5, '#e0b884'], [1, '#8a5e30']]);
    rr(ctx, 4, 10, 26, 108, 4); ctx.fill();
    ctx.fillStyle = '#7a5230'; rr(ctx, 0, 2, 34, 14, 5); ctx.fill();
  });
}

/** Cánh cổng gỗ (khung + nan dọc + thanh chéo), đã mở sát hàng rào. Chân ở đáy. */
export function gateTextures(scene: Phaser.Scene) {
  tex(scene, 'gate_leaf', 100, 74, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(4, 66, 92, 6);
    const wood = (x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = lin(ctx, x, y, x + w, y + h, [[0, '#f0d0a0'], [1, '#b98d5c']]);
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(90,60,30,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    };
    for (let x = 8; x < 92; x += 14) wood(x, 14, 9, 52); // nan dọc
    wood(4, 14, 92, 9); // thanh trên
    wood(4, 54, 92, 9); // thanh dưới
    ctx.save(); ctx.translate(8, 58); ctx.rotate(-Math.atan2(40, 84)); wood(0, -4, 94, 8); ctx.restore(); // thanh chéo
    ctx.fillStyle = '#4a4a55'; ctx.fillRect(90, 20, 8, 5); ctx.fillRect(90, 52, 8, 5); // bản lề
  });
}

// ===================================================================== CÔNG TRÌNH

export function houseTexture(scene: Phaser.Scene) {
  return tex(scene, 'farmhouse', 340, 320, (ctx) => {
    shadow(ctx, 175, 300, 165, 22, 0.3);
    // tường
    ctx.fillStyle = lin(ctx, 0, 140, 0, 300, [[0, '#fff3dc'], [1, '#f0d9b0']]);
    ctx.fillRect(40, 140, 260, 160);
    ctx.strokeStyle = 'rgba(160,120,70,0.25)'; ctx.lineWidth = 2;
    for (let y = 160; y < 300; y += 18) { ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(300, y); ctx.stroke(); }
    // ống khói
    ctx.fillStyle = lin(ctx, 230, 0, 262, 0, [[0, '#a4553a'], [1, '#7a3a26']]);
    ctx.fillRect(232, 40, 30, 70);
    ctx.fillStyle = '#5a2a1a'; ctx.fillRect(228, 36, 38, 10);
    // mái
    ctx.fillStyle = lin(ctx, 0, 30, 0, 160, [[0, '#e85d4a'], [1, '#b8352a']]);
    ctx.beginPath(); ctx.moveTo(14, 160); ctx.lineTo(170, 34); ctx.lineTo(326, 160); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(120,20,10,0.35)'; ctx.lineWidth = 2;
    for (let i = 1; i < 7; i++) {
      const y = 34 + i * 18, half = ((y - 34) / 126) * 156;
      ctx.beginPath(); ctx.moveTo(170 - half, y); ctx.lineTo(170 + half, y); ctx.stroke();
    }
    ctx.fillStyle = '#8f2a1f'; ctx.fillRect(10, 156, 320, 10);
    // cửa sổ áp mái
    ctx.fillStyle = '#fff3dc'; ctx.beginPath(); ctx.arc(170, 110, 22, 0, 7); ctx.fill();
    ctx.fillStyle = lin(ctx, 0, 92, 0, 128, [[0, '#cfe9ff'], [1, '#8cc7f0']]); ctx.beginPath(); ctx.arc(170, 110, 16, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff3dc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(154, 110); ctx.lineTo(186, 110); ctx.moveTo(170, 94); ctx.lineTo(170, 126); ctx.stroke();
    // cửa
    ctx.fillStyle = lin(ctx, 145, 0, 195, 0, [[0, '#7a4a28'], [1, '#5a341a']]);
    rr(ctx, 146, 210, 48, 90, [24, 24, 0, 0]); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(184, 258, 3.5, 0, 7); ctx.fill();
    // bậc thềm
    ctx.fillStyle = '#c9b49a'; ctx.fillRect(132, 298, 76, 10);
    // cửa sổ + bồn hoa
    for (const wx of [62, 222]) {
      ctx.fillStyle = '#ffffff'; rr(ctx, wx, 186, 58, 56, 6); ctx.fill();
      ctx.fillStyle = lin(ctx, 0, 190, 0, 238, [[0, '#d6eeff'], [1, '#93cbef']]); rr(ctx, wx + 5, 191, 48, 46, 4); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(wx + 29, 191); ctx.lineTo(wx + 29, 237); ctx.moveTo(wx + 5, 214); ctx.lineTo(wx + 53, 214); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.moveTo(wx + 8, 232); ctx.lineTo(wx + 24, 194); ctx.lineTo(wx + 30, 194); ctx.lineTo(wx + 14, 232); ctx.fill();
      ctx.fillStyle = '#8f5a32'; ctx.fillRect(wx - 4, 244, 66, 12);
      for (let i = 0; i < 7; i++) {
        blob(ctx, wx + 2 + i * 9, 242, 6, '#a9dc78', '#5fa845', '#3c7a33');
        ctx.fillStyle = ['#ff6b8b', '#ffd43b', '#ffffff'][i % 3]; ctx.beginPath(); ctx.arc(wx + 2 + i * 9, 238, 3, 0, 7); ctx.fill();
      }
    }
  });
}

export function barnTexture(scene: Phaser.Scene) {
  return tex(scene, 'barn', 270, 250, (ctx) => {
    shadow(ctx, 135, 236, 130, 16, 0.3);
    ctx.fillStyle = lin(ctx, 0, 90, 0, 236, [[0, '#d8433a'], [1, '#a92b24']]);
    ctx.fillRect(30, 96, 210, 140);
    ctx.strokeStyle = 'rgba(80,10,10,0.25)'; ctx.lineWidth = 2;
    for (let x = 44; x < 240; x += 16) { ctx.beginPath(); ctx.moveTo(x, 96); ctx.lineTo(x, 236); ctx.stroke(); }
    ctx.fillStyle = lin(ctx, 0, 20, 0, 100, [[0, '#6b6f7a'], [1, '#4b4f5a']]);
    ctx.beginPath(); ctx.moveTo(14, 104); ctx.lineTo(60, 40); ctx.lineTo(135, 14); ctx.lineTo(210, 40); ctx.lineTo(256, 104); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#f5f0e6'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(30, 98); ctx.lineTo(240, 98); ctx.stroke();
    // cửa lớn
    ctx.fillStyle = '#f5f0e6'; ctx.fillRect(90, 150, 90, 86);
    ctx.fillStyle = '#c23a30'; ctx.fillRect(96, 156, 78, 80);
    ctx.strokeStyle = '#f5f0e6'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(96, 156); ctx.lineTo(174, 236); ctx.moveTo(174, 156); ctx.lineTo(96, 236); ctx.moveTo(135, 156); ctx.lineTo(135, 236); ctx.stroke();
    // cửa sổ gác
    ctx.fillStyle = '#f5f0e6'; ctx.fillRect(116, 60, 38, 34);
    ctx.fillStyle = '#e9c46a'; ctx.fillRect(120, 64, 30, 26);
    ctx.fillStyle = '#d4a645';
    for (let i = 0; i < 6; i++) ctx.fillRect(121 + i * 5, 70 + (i % 2) * 4, 2, 18);
  });
}

export function busStopTexture(scene: Phaser.Scene) {
  return tex(scene, 'busstop2', 230, 200, (ctx) => {
    shadow(ctx, 112, 190, 100, 10, 0.25);
    // vách sau: áp phích quảng cáo Xóm Vui
    ctx.fillStyle = '#e9edf2'; rr(ctx, 30, 58, 150, 92, 6); ctx.fill();
    ctx.fillStyle = lin(ctx, 0, 64, 0, 144, [[0, '#8fd3ff'], [0.62, '#cdeeff'], [0.63, '#8fd16a'], [1, '#5fa845']]);
    rr(ctx, 38, 64, 134, 80, 4); ctx.fill();
    ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(150, 82, 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#e85d4a'; ctx.beginPath(); ctx.moveTo(56, 118); ctx.lineTo(74, 100); ctx.lineTo(92, 118); ctx.fill();
    ctx.fillStyle = '#fff3dc'; ctx.fillRect(60, 118, 28, 16);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('XÓM VUI', 125, 132);
    // cột khung
    ctx.fillStyle = lin(ctx, 0, 0, 10, 0, [[0, '#3d4a5c'], [0.5, '#6b7a90'], [1, '#3d4a5c']]);
    for (const x of [22, 182]) { rr(ctx, x, 40, 8, 146, 3); ctx.fill(); }
    // kính hai bên (trong suốt, có vệt sáng)
    ctx.fillStyle = 'rgba(190,230,255,0.45)';
    ctx.fillRect(30, 56, 4, 100); ctx.fillRect(178, 56, 4, 100);
    // ghế gỗ
    ctx.fillStyle = lin(ctx, 0, 150, 0, 162, [[0, '#e2ac78'], [1, '#b07a46']]); rr(ctx, 44, 150, 124, 12, 4); ctx.fill();
    ctx.fillStyle = '#4a4a55'; ctx.fillRect(56, 162, 6, 22); ctx.fillRect(150, 162, 6, 22);
    // mái cong
    ctx.fillStyle = lin(ctx, 0, 22, 0, 52, [[0, '#3ccfb8'], [1, '#169383']]);
    ctx.beginPath(); ctx.moveTo(8, 50); ctx.quadraticCurveTo(106, 10, 204, 50); ctx.lineTo(204, 58); ctx.quadraticCurveTo(106, 22, 8, 58); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(14, 52); ctx.quadraticCurveTo(106, 16, 198, 52); ctx.stroke();
    // biển báo xe buýt
    ctx.fillStyle = '#4a5568'; rr(ctx, 210, 30, 6, 160, 3); ctx.fill();
    ctx.fillStyle = '#1d6fd8'; rr(ctx, 194, 2, 36, 36, 9); ctx.fill();
    ctx.fillStyle = '#ffffff'; rr(ctx, 201, 10, 22, 16, 4); ctx.fill();
    ctx.fillStyle = '#1d6fd8'; ctx.fillRect(204, 13, 7, 6); ctx.fillRect(213, 13, 7, 6);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(206, 29, 3, 0, 7); ctx.arc(218, 29, 3, 0, 7); ctx.fill();
  });
}

export function wellTexture(scene: Phaser.Scene) {
  return tex(scene, 'well', 110, 130, (ctx) => {
    shadow(ctx, 55, 120, 50, 9, 0.25);
    ctx.fillStyle = lin(ctx, 10, 0, 100, 0, [[0, '#8d8d99'], [0.5, '#c4c4cc'], [1, '#7a7a86']]);
    rr(ctx, 12, 74, 86, 44, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(60,60,70,0.4)'; ctx.lineWidth = 1.5;
    for (let y = 86; y < 118; y += 12) { ctx.beginPath(); ctx.moveTo(12, y); ctx.lineTo(98, y); ctx.stroke(); }
    ctx.fillStyle = '#2a5d7a'; ctx.beginPath(); ctx.ellipse(55, 76, 40, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a5230'; ctx.fillRect(16, 24, 7, 54); ctx.fillRect(87, 24, 7, 54);
    ctx.fillStyle = lin(ctx, 0, 6, 0, 32, [[0, '#c0533f'], [1, '#8e3326']]);
    ctx.beginPath(); ctx.moveTo(4, 32); ctx.lineTo(55, 4); ctx.lineTo(106, 32); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(55, 30); ctx.lineTo(55, 58); ctx.stroke();
    ctx.fillStyle = '#9c6b43'; rr(ctx, 46, 56, 18, 16, 3); ctx.fill();
  });
}

export function hayTexture(scene: Phaser.Scene) {
  return tex(scene, 'hay', 80, 60, (ctx) => {
    shadow(ctx, 40, 52, 36, 7, 0.25);
    ctx.fillStyle = lin(ctx, 0, 10, 0, 52, [[0, '#f6d77a'], [1, '#d4a83f']]);
    rr(ctx, 6, 12, 68, 40, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(150,100,20,0.45)'; ctx.lineWidth = 1.2;
    const r = rng(7);
    for (let i = 0; i < 30; i++) { const x = 10 + r() * 60, y = 16 + r() * 32; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6, y + (r() - 0.5) * 4); ctx.stroke(); }
    ctx.strokeStyle = '#a0522d'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(26, 12); ctx.lineTo(26, 52); ctx.moveTo(54, 12); ctx.lineTo(54, 52); ctx.stroke();
  });
}

export function scarecrowTexture(scene: Phaser.Scene) {
  return tex(scene, 'scarecrow', 90, 140, (ctx) => {
    shadow(ctx, 45, 132, 26, 6, 0.25);
    ctx.fillStyle = '#7a5230'; ctx.fillRect(42, 40, 6, 92); ctx.fillRect(10, 62, 70, 6);
    ctx.fillStyle = '#4a7fc1'; rr(ctx, 26, 56, 38, 42, 6); ctx.fill();
    ctx.fillStyle = '#e63946'; ctx.fillRect(30, 64, 10, 10); ctx.fillRect(48, 80, 10, 10);
    ctx.fillStyle = '#4a7fc1'; ctx.fillRect(8, 58, 22, 12); ctx.fillRect(60, 58, 22, 12);
    ctx.fillStyle = '#f6d77a';
    for (let i = 0; i < 4; i++) ctx.fillRect(4 + i * 2, 66 + i, 6, 3), ctx.fillRect(80 - i * 2, 66 + i, 6, 3);
    ctx.fillStyle = '#f2dcb1'; ctx.beginPath(); ctx.arc(45, 38, 15, 0, 7); ctx.fill();
    ctx.fillStyle = '#333'; ctx.fillRect(38, 34, 4, 4); ctx.fillRect(49, 34, 4, 4);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(45, 42, 5, 0.3, Math.PI - 0.3); ctx.stroke();
    ctx.fillStyle = '#c9a45a'; ctx.beginPath(); ctx.ellipse(45, 26, 30, 7, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(30, 26); ctx.lineTo(45, 4); ctx.lineTo(60, 26); ctx.fill();
  });
}

export function lampTexture(scene: Phaser.Scene) {
  return tex(scene, 'lamp', 50, 150, (ctx) => {
    shadow(ctx, 25, 144, 16, 5, 0.25);
    ctx.fillStyle = lin(ctx, 20, 0, 30, 0, [[0, '#2f2f3a'], [0.5, '#5a5a6a'], [1, '#2f2f3a']]);
    ctx.fillRect(22, 36, 6, 106); rr(ctx, 14, 136, 22, 8, 3); ctx.fill();
    ctx.fillStyle = '#2f2f3a'; ctx.beginPath(); ctx.moveTo(10, 22); ctx.lineTo(25, 8); ctx.lineTo(40, 22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rad(ctx, 25, 30, 0, 12, [[0, '#ffffff'], [1, '#ffe08a']]); rr(ctx, 14, 22, 22, 18, 3); ctx.fill();
  });
}

export function benchTexture(scene: Phaser.Scene) {
  return tex(scene, 'bench', 110, 70, (ctx) => {
    shadow(ctx, 55, 62, 50, 7, 0.22);
    ctx.fillStyle = '#4a4a55'; ctx.fillRect(14, 30, 6, 32); ctx.fillRect(90, 30, 6, 32);
    for (const y of [8, 22]) { ctx.fillStyle = lin(ctx, 0, y, 0, y + 9, [[0, '#d8a06a'], [1, '#a8703c']]); rr(ctx, 4, y, 102, 9, 3); ctx.fill(); }
    ctx.fillStyle = lin(ctx, 0, 38, 0, 50, [[0, '#e2ac78'], [1, '#b07a46']]); rr(ctx, 2, 38, 106, 11, 3); ctx.fill();
  });
}

export function fountainTexture(scene: Phaser.Scene) {
  return tex(scene, 'fountain', 320, 230, (ctx) => {
    shadow(ctx, 160, 200, 150, 26, 0.28);
    ctx.fillStyle = lin(ctx, 0, 120, 0, 205, [[0, '#e6e2ee'], [1, '#a9a4b8']]);
    ctx.beginPath(); ctx.ellipse(160, 175, 148, 50, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#efeaf5'; ctx.beginPath(); ctx.ellipse(160, 160, 148, 48, 0, 0, 7); ctx.fill();
    ctx.fillStyle = rad(ctx, 160, 160, 0, 130, [[0, '#4fb0da'], [1, '#9be0f5']]);
    ctx.beginPath(); ctx.ellipse(160, 160, 128, 38, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(120, 152, 40, 6, -0.1, 0, 7); ctx.fill();
    ctx.fillStyle = lin(ctx, 145, 0, 175, 0, [[0, '#b8b3c8'], [0.5, '#f2eef8'], [1, '#a9a4b8']]);
    rr(ctx, 146, 70, 28, 92, 8); ctx.fill();
    ctx.fillStyle = '#e6e2ee'; ctx.beginPath(); ctx.ellipse(160, 72, 54, 16, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7fd0ec'; ctx.beginPath(); ctx.ellipse(160, 70, 42, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e6e2ee'; rr(ctx, 154, 34, 12, 38, 5); ctx.fill();
  });
}

// --- Toà nhà khu vui chơi ---
export function buildingTexture(scene: Phaser.Scene, style: 'tent' | 'club' | 'arcade' | 'shop' | 'boutique', w: number, h: number) {
  return tex(scene, `bld_${style}`, w + 40, h + 40, (ctx) => {
    const ox = 20, oy = 20;
    shadow(ctx, ox + w / 2, oy + h - 2, w / 2 + 14, 22, 0.3);
    if (style === 'tent') {
      // lều xiếc sọc đỏ trắng
      const top = oy + 10, base = oy + h - 6;
      const stripes = 10;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 ? '#fff4ec' : '#e63946';
        const x0 = ox + 10 + (i * (w - 20)) / stripes, x1 = ox + 10 + ((i + 1) * (w - 20)) / stripes;
        ctx.beginPath(); ctx.moveTo(x0, base); ctx.lineTo(x1, base);
        ctx.lineTo(ox + w / 2 + (x1 - ox - w / 2) * 0.82, oy + h * 0.42); ctx.lineTo(ox + w / 2 + (x0 - ox - w / 2) * 0.82, oy + h * 0.42); ctx.closePath(); ctx.fill();
      }
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 ? '#ffe9dc' : '#cf2e3b';
        const a0 = ox + w / 2 + ((ox + 10 + (i * (w - 20)) / stripes) - ox - w / 2) * 0.86;
        const a1 = ox + w / 2 + ((ox + 10 + ((i + 1) * (w - 20)) / stripes) - ox - w / 2) * 0.86;
        ctx.beginPath(); ctx.moveTo(a0, oy + h * 0.45); ctx.lineTo(a1, oy + h * 0.45); ctx.lineTo(ox + w / 2, top); ctx.closePath(); ctx.fill();
      }
      // diềm
      for (let i = 0; i < 14; i++) {
        const x = ox + w * 0.07 + (i * w * 0.86) / 14;
        ctx.fillStyle = i % 2 ? '#ffd166' : '#e63946';
        ctx.beginPath(); ctx.moveTo(x, oy + h * 0.44); ctx.lineTo(x + (w * 0.86) / 14, oy + h * 0.44); ctx.lineTo(x + (w * 0.43) / 14, oy + h * 0.52); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(ox + 10, base - 8, w - 20, 8);
      // cửa lều
      ctx.fillStyle = '#3a1f2a'; ctx.beginPath(); ctx.moveTo(ox + w / 2 - 44, base); ctx.quadraticCurveTo(ox + w / 2, oy + h * 0.5, ox + w / 2 + 44, base); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(ox + w / 2, top - 4, 8, 0, 7); ctx.fill();
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ox + w / 2, top - 4); ctx.lineTo(ox + w / 2, top - 34); ctx.stroke();
      ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(ox + w / 2, top - 34); ctx.lineTo(ox + w / 2 + 30, top - 26); ctx.lineTo(ox + w / 2, top - 18); ctx.closePath(); ctx.fill();
      return;
    }
    if (style === 'arcade') {
      // Tòa "Khu giải trí": vòm mái tím có bóng đèn, mái hiên sọc, cửa lớn rèm đỏ, 2 cửa sổ tròn.
      const cx = ox + w / 2;
      const wallTop = oy + h * 0.3;
      // cột hai bên + tường
      ctx.fillStyle = lin(ctx, 0, wallTop, 0, oy + h, [[0, '#fde2ff'], [1, '#f1c0f5']]);
      ctx.fillRect(ox + 20, wallTop, w - 40, oy + h - wallTop);
      for (const px of [ox + 20, ox + w - 56]) {
        ctx.fillStyle = lin(ctx, px, 0, px + 36, 0, [[0, '#c77dff'], [0.5, '#e0aaff'], [1, '#9d4edd']]);
        ctx.fillRect(px, wallTop - 10, 36, oy + h - wallTop + 10);
        ctx.fillStyle = '#7b2cbf'; ctx.fillRect(px - 4, wallTop - 16, 44, 12);
      }
      // vòm mái
      ctx.fillStyle = lin(ctx, 0, oy, 0, wallTop, [[0, '#9d4edd'], [1, '#5a189a']]);
      ctx.beginPath();
      ctx.moveTo(ox + 4, wallTop + 6);
      ctx.lineTo(ox + 4, wallTop - 40);
      ctx.quadraticCurveTo(cx, oy - 30, ox + w - 4, wallTop - 40);
      ctx.lineTo(ox + w - 4, wallTop + 6);
      ctx.closePath(); ctx.fill();
      // bóng đèn dọc viền vòm
      for (let i = 0; i <= 22; i++) {
        const t = i / 22;
        const x = (1 - t) * (1 - t) * (ox + 10) + 2 * (1 - t) * t * cx + t * t * (ox + w - 10);
        const y = (1 - t) * (1 - t) * (wallTop - 38) + 2 * (1 - t) * t * (oy - 22) + t * t * (wallTop - 38);
        ctx.fillStyle = rad(ctx, x, y, 0, 6, [[0, '#ffffff'], [1, i % 2 ? '#ffd166' : '#ff70a6']]);
        ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
      }
      // mái hiên sọc đỏ trắng
      const awY = wallTop + 4;
      const n = 12;
      for (let i = 0; i < n; i++) {
        const x = ox + 24 + (i * (w - 48)) / n;
        const bw = (w - 48) / n;
        ctx.fillStyle = i % 2 ? '#ffffff' : '#ef476f';
        ctx.fillRect(x, awY, bw + 0.5, 30);
        ctx.beginPath(); ctx.arc(x + bw / 2, awY + 30, bw / 2, 0, Math.PI); ctx.fill();
      }
      // cửa lớn vòm + rèm
      const dw = 150, dh = 160, dx = cx - dw / 2, dy = oy + h - dh;
      ctx.fillStyle = '#ffd166'; rr(ctx, dx - 10, dy - 10, dw + 20, dh + 10, [dw / 2 + 10, dw / 2 + 10, 0, 0]); ctx.fill();
      ctx.fillStyle = '#2b1338'; rr(ctx, dx, dy, dw, dh, [dw / 2, dw / 2, 0, 0]); ctx.fill();
      for (const side of [-1, 1]) {
        ctx.fillStyle = lin(ctx, cx + side * 10, 0, cx + side * dw / 2, 0, [[0, '#d00000'], [1, '#9d0208']]);
        ctx.beginPath();
        ctx.moveTo(cx, dy + 4);
        ctx.quadraticCurveTo(cx + side * dw * 0.45, dy + 10, cx + side * (dw / 2 - 4), dy + dh * 0.35);
        ctx.lineTo(cx + side * (dw / 2 - 4), oy + h);
        ctx.lineTo(cx + side * 30, oy + h);
        ctx.quadraticCurveTo(cx + side * 22, dy + dh * 0.5, cx, dy + 4);
        ctx.fill();
      }
      for (let i = 0; i < 14; i++) {
        const a = Math.PI + (i / 13) * Math.PI;
        const x = cx + Math.cos(a) * (dw / 2 + 4), y = dy + dw / 2 + Math.sin(a) * (dw / 2 + 4);
        ctx.fillStyle = i % 2 ? '#fff3b0' : '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
      }
      // 2 cửa sổ tròn có xúc xắc và lá bài
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const [wx, icon] of [[ox + w * 0.24, '🎲'], [ox + w * 0.76, '🃏']] as const) {
        const wy = oy + h * 0.66;
        ctx.fillStyle = '#7b2cbf'; ctx.beginPath(); ctx.arc(wx, wy, 50, 0, 7); ctx.fill();
        ctx.fillStyle = rad(ctx, wx - 10, wy - 10, 4, 44, [[0, '#ffffff'], [1, '#bde0fe']]);
        ctx.beginPath(); ctx.arc(wx, wy, 42, 0, 7); ctx.fill();
        ctx.font = '44px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(icon, wx, wy + 2);
      }
      return;
    }
    const pal = {
      club: { wall: ['#e9f3ff', '#c9ddf5'], roof: ['#3a86ff', '#1d5fc2'], awn: ['#3a86ff', '#ffffff'] },
      shop: { wall: ['#fff3d6', '#f2d9a6'], roof: ['#ff8c42', '#d96320'], awn: ['#2a9d8f', '#ffffff'] },
      boutique: { wall: ['#ffeef6', '#f7cfe2'], roof: ['#b07cd8', '#8452b0'], awn: ['#ff70a6', '#ffffff'] },
    }[style as 'club' | 'shop' | 'boutique'];
    const wallTop = oy + h * 0.36;
    ctx.fillStyle = lin(ctx, 0, wallTop, 0, oy + h, [[0, pal.wall[0]], [1, pal.wall[1]]]);
    ctx.fillRect(ox + 16, wallTop, w - 32, oy + h - wallTop);
    // mái
    ctx.fillStyle = lin(ctx, 0, oy, 0, wallTop + 10, [[0, pal.roof[0]], [1, pal.roof[1]]]);
    if (style === 'club') {
      rr(ctx, ox + 4, oy + h * 0.12, w - 8, h * 0.26, 12); ctx.fill();
      ctx.fillStyle = '#ffd166';
      for (let i = 0; i < 4; i++) { ctx.font = 'bold 26px serif'; ctx.textAlign = 'center'; ctx.fillStyle = i % 2 ? '#e63946' : '#1a1a2e'; ctx.fillText(['♠', '♥', '♣', '♦'][i], ox + w * (0.2 + i * 0.2), oy + h * 0.31); }
    } else {
      ctx.beginPath(); ctx.moveTo(ox, wallTop + 6); ctx.lineTo(ox + w * 0.18, oy + 6); ctx.lineTo(ox + w * 0.82, oy + 6); ctx.lineTo(ox + w, wallTop + 6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 2;
      for (let i = 1; i < 6; i++) { const y = oy + 6 + ((wallTop - oy) * i) / 6; const k = (y - oy - 6) / (wallTop - oy); ctx.beginPath(); ctx.moveTo(ox + w * 0.18 * (1 - k), y); ctx.lineTo(ox + w - w * 0.18 * (1 - k), y); ctx.stroke(); }
    }
    // mái hiên sọc
    const awY = wallTop + 40;
    const n = 10;
    for (let i = 0; i < n; i++) {
      const x = ox + 22 + (i * (w - 44)) / n;
      ctx.fillStyle = i % 2 ? pal.awn[1] : pal.awn[0];
      ctx.fillRect(x, awY, (w - 44) / n + 0.5, 26);
      ctx.beginPath(); ctx.arc(x + (w - 44) / n / 2, awY + 26, (w - 44) / n / 2, 0, Math.PI); ctx.fill();
    }
    // cửa kính + tủ trưng bày
    const doorW = 64;
    ctx.fillStyle = '#5a3a2a'; rr(ctx, ox + w / 2 - doorW / 2 - 4, oy + h - 104, doorW + 8, 104, [8, 8, 0, 0]); ctx.fill();
    ctx.fillStyle = lin(ctx, 0, oy + h - 100, 0, oy + h, [[0, '#d6eeff'], [1, '#8cc7f0']]);
    rr(ctx, ox + w / 2 - doorW / 2, oy + h - 98, doorW, 98, [6, 6, 0, 0]); ctx.fill();
    ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ox + w / 2, oy + h - 98); ctx.lineTo(ox + w / 2, oy + h); ctx.stroke();
    for (const wx of [ox + 34, ox + w - 34 - 80]) {
      ctx.fillStyle = '#5a3a2a'; rr(ctx, wx - 4, oy + h - 96, 88, 66, 6); ctx.fill();
      ctx.fillStyle = lin(ctx, 0, oy + h - 92, 0, oy + h - 34, [[0, '#e3f4ff'], [1, '#a5d6f5']]);
      rr(ctx, wx, oy + h - 92, 80, 58, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.moveTo(wx + 6, oy + h - 36); ctx.lineTo(wx + 30, oy + h - 90); ctx.lineTo(wx + 42, oy + h - 90); ctx.lineTo(wx + 18, oy + h - 36); ctx.fill();
      ctx.fillStyle = '#8f5a32'; ctx.fillRect(wx - 6, oy + h - 30, 92, 10);
      for (let i = 0; i < 8; i++) {
        blob(ctx, wx + 2 + i * 11, oy + h - 32, 6, '#a9dc78', '#5fa845', '#3c7a33');
        ctx.fillStyle = ['#ff6b8b', '#ffd43b', '#ffffff', '#b197fc'][i % 4]; ctx.beginPath(); ctx.arc(wx + 2 + i * 11, oy + h - 36, 3, 0, 7); ctx.fill();
      }
    }
  });
}

export function signTexture(scene: Phaser.Scene) {
  return tex(scene, 'signboard', 260, 56, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; rr(ctx, 4, 8, 252, 46, 14); ctx.fill();
    ctx.fillStyle = lin(ctx, 0, 0, 0, 50, [[0, '#fffaf0'], [1, '#f3e3c6']]); rr(ctx, 2, 2, 252, 46, 14); ctx.fill();
    ctx.strokeStyle = '#a67c52'; ctx.lineWidth = 3; rr(ctx, 2, 2, 252, 46, 14); ctx.stroke();
  });
}

// --- Đu quay ---
export function ferrisTextures(scene: Phaser.Scene, R: number) {
  const size = R * 2 + 40;
  tex(scene, 'fw_wheel', size, size, (ctx) => {
    const c = size / 2;
    ctx.strokeStyle = '#e5e5ef'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(c, c, R, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#ff70a6'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(c, c, R - 10, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#d0d0de'; ctx.lineWidth = 3;
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(c + Math.cos(t) * R, c + Math.sin(t) * R); ctx.stroke();
    }
    const cols = ['#ffd166', '#06d6a0', '#4cc9f0', '#ff70a6'];
    for (let i = 0; i < 32; i++) {
      const t = (i / 32) * Math.PI * 2;
      ctx.fillStyle = cols[i % 4];
      ctx.beginPath(); ctx.arc(c + Math.cos(t) * R, c + Math.sin(t) * R, 4.5, 0, 7); ctx.fill();
    }
    ctx.fillStyle = rad(ctx, c, c, 0, 24, [[0, '#ffffff'], [1, '#b8b3c8']]); ctx.beginPath(); ctx.arc(c, c, 22, 0, 7); ctx.fill();
  });
  tex(scene, 'fw_stand', size, R + 120, (ctx) => {
    const c = size / 2;
    ctx.strokeStyle = '#8d99ae'; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(c, 20); ctx.lineTo(c - R * 0.55, R + 110); ctx.moveTo(c, 20); ctx.lineTo(c + R * 0.55, R + 110); ctx.stroke();
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(c - R * 0.3, R * 0.6); ctx.lineTo(c + R * 0.3, R * 0.6); ctx.stroke();
    ctx.fillStyle = '#6c757d'; rr(ctx, c - R * 0.7, R + 100, R * 1.4, 18, 6); ctx.fill();
  });
  const cabCols = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b72cf', '#ff8c42'];
  cabCols.forEach((col, i) => tex(scene, `fw_cabin_${i}`, 46, 52, (ctx) => {
    ctx.strokeStyle = '#6c757d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(23, 0); ctx.lineTo(23, 12); ctx.stroke();
    ctx.fillStyle = lin(ctx, 0, 10, 0, 50, [[0, col], [1, '#00000033']]);
    rr(ctx, 4, 10, 38, 38, [16, 16, 8, 8]); ctx.fill();
    ctx.fillStyle = col; rr(ctx, 4, 10, 38, 38, [16, 16, 8, 8]); ctx.globalAlpha = 0.7; ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(220,240,255,0.85)'; rr(ctx, 10, 18, 26, 14, 5); ctx.fill();
  }));
}

// ===================================================================== NÔNG TRẠI

/** Chó giữ nhà (kiểu chó vàng Việt Nam), nhìn nghiêng sang phải, chân ở (55, 84). */
export function dogTexture(scene: Phaser.Scene) {
  return tex(scene, 'dog', 110, 92, (ctx) => {
    const oval = (x: number, y: number, rx: number, ry: number, color: string, a = 0) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); ctx.fill();
    };
    shadow(ctx, 55, 85, 36, 6, 0.22);
    // đuôi cong
    ctx.strokeStyle = '#d9a35b'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(24, 52); ctx.quadraticCurveTo(8, 40, 18, 26); ctx.stroke();
    // chân
    for (const x of [32, 42, 66, 76]) { ctx.fillStyle = '#e0ad66'; ctx.fillRect(x - 4, 60, 8, 22); oval(x, 82, 5, 3, '#f6ecd8'); }
    // thân
    ctx.fillStyle = lin(ctx, 0, 40, 0, 70, [[0, '#f0bf75'], [1, '#d9a35b']]);
    ctx.beginPath(); ctx.ellipse(54, 56, 32, 16, 0, 0, Math.PI * 2); ctx.fill();
    oval(70, 62, 12, 9, '#fbf1de');
    // đầu
    oval(82, 36, 17, 15, '#f0bf75');
    oval(94, 42, 10, 7, '#fbf1de');
    oval(102, 39, 3.5, 3, '#2e2420');
    ctx.fillStyle = '#c98d48';
    ctx.beginPath(); ctx.moveTo(72, 26); ctx.lineTo(76, 10); ctx.lineTo(84, 24); ctx.fill();
    ctx.beginPath(); ctx.moveTo(84, 23); ctx.lineTo(90, 9); ctx.lineTo(94, 26); ctx.fill();
    oval(86, 33, 2.6, 3.2, '#2e2420'); oval(86.8, 32, 0.9, 0.9, '#ffffff');
    // vòng cổ
    ctx.strokeStyle = '#e63946'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(80, 44, 11, 0.3, 2.2); ctx.stroke();
    oval(78, 55, 3, 3, '#ffd166');
  });
}

/** Vật nuôi dùng cùng bảng màu và nét vẽ với cảnh vật, gốc chân ở (60, 88). */
export function animalTexture(scene: Phaser.Scene, type: string) {
  return tex(scene, `animal_${type}`, 120, 100, (ctx) => {
    const oval = (x: number, y: number, rx: number, ry: number, color: string, angle = 0) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2); ctx.fill();
    };
    const line = (x: number, y: number, x2: number, y2: number, color: string, width = 3) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
    };
    const eye = (x: number, y: number) => {
      oval(x, y, 2.5, 3.1, '#344137'); oval(x + .7, y - 1, .85, .85, '#ffffff');
    };
    if (type === 'add') {
      oval(60, 62, 23, 12, 'rgba(65,85,40,.08)');
      oval(60, 54, 22, 22, '#fff6db');
      line(60, 44, 60, 64, '#92a66c', 4); line(50, 54, 70, 54, '#92a66c', 4);
      return;
    }
    shadow(ctx, 60, 89, type === 'ga' ? 29 : 42, 6, .2);
    if (type === 'ga' || type === 'duck') {
      const duck = type === 'duck';
      line(50, 76, 48, 86, '#c79144', 3); line(68, 76, 70, 86, '#c79144', 3);
      line(44, 87, 53, 87, '#c79144', 2.5); line(65, 87, 75, 87, '#c79144', 2.5);
      oval(31, 52, 11, 22, duck ? '#e8e4c9' : '#e1caaa', -.6);
      oval(26, 49, 6, 19, '#faf3db', -.6);
      oval(56, 61, 30, 23, '#d6bd94');
      ctx.fillStyle = rad(ctx, 54, 52, 1, 35, [[0, '#fffef1'], [1, '#e5d8b9']]);
      ctx.beginPath(); ctx.ellipse(56, 58, 29, 23, -.15, 0, 7); ctx.fill();
      oval(52, 59, 19, 14, '#e9ddbf', -.3);
      ctx.strokeStyle = '#cfbf9d'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(52, 59, 16, 11, -.3, .2, 2.8); ctx.stroke();
      oval(78, 43, 15, 20, '#fffbea', .2);
      if (!duck) {
        for (let i = 0; i < 3; i++) oval(70 + i * 6, 24 - (i === 1 ? 3 : 0), 4.5, 6, '#d66450');
        oval(87, 54, 4, 6, '#d66450', -.2);
      }
      oval(duck ? 94 : 93, 43, duck ? 10 : 7, 4.5, '#e9ae4d');
      eye(82, 37); oval(87, 46, 3, 2, '#f1c0a0');
      return;
    }
    // Bốn chân và móng đặt phía sau thân.
    for (const x of [35, 45, 76, 87]) {
      line(x, 65, x - 1, 85, '#c6b69a', 7);
      oval(x - 1, 85, 5, 3, '#7c7262');
    }
    if (type === 'bo') {
      line(25, 50, 16, 68, '#b3a17c', 3); oval(15, 70, 3, 5, '#71654f');
      ctx.fillStyle = lin(ctx, 0, 35, 0, 80, [[0, '#fffced'], [1, '#dfd8bf']]);
      ctx.beginPath(); ctx.ellipse(56, 54, 36, 24, 0, 0, 7); ctx.fill();
      oval(41, 45, 12, 13, '#967357', -.4); oval(67, 61, 11, 13, '#a1805e', .4);
      oval(78, 42, 7, 10, '#a1805e');
      oval(87, 36, 7, 10, '#f8efd6', -.6); oval(108, 38, 7, 9, '#e5d3b0', .6);
      oval(86, 36, 3, 5, '#d4b192', -.6);
      line(91, 30, 89, 23, '#bdaf89', 4); line(103, 31, 106, 24, '#bdaf89', 4);
      oval(98, 47, 16, 20, '#fcf4db', -.12);
      oval(94, 35, 7, 6, '#95785d');
      oval(101, 60, 17, 10, '#ddb39c');
      oval(94, 59, 2, 1.6, '#9c7a6a'); oval(107, 59, 2, 1.6, '#9c7a6a');
      eye(91, 45); eye(105, 45);
    } else {
      oval(53, 55, 34, 25, '#d8d0b9');
      const r = rng(71);
      for (let i = 0; i < 13; i++) {
        const a = i / 13 * Math.PI * 2;
        oval(54 + Math.cos(a) * 26, 53 + Math.sin(a) * 17, 12 + r() * 3, 12, '#f6f0df');
      }
      oval(52, 49, 28, 20, '#fffbed');
      for (const [x,y] of [[36,44],[54,38],[64,56],[44,60]]) {
        ctx.strokeStyle = '#e3dcc8'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(x,y,5,.2,3.6); ctx.stroke();
      }
      oval(78, 40, 10, 5, '#b2a58c', -.5); oval(105, 43, 9, 5, '#b2a58c', .5);
      oval(91, 52, 15, 20, '#a99e87', -.15);
      oval(92, 64, 10, 7, '#b8ac94');
      for (const x of [81,90,99]) oval(x, 33, 7, 7, '#fffbed');
      eye(86, 48); eye(98, 48);
      line(90, 62, 94, 62, '#766f60', 2);
    }
  });
}

export function soilTextures(scene: Phaser.Scene, w: number, h: number) {
  for (const wet of [false, true]) {
    tex(scene, wet ? 'soil_wet' : 'soil', w + 8, h + 10, (ctx) => {
      ctx.fillStyle = 'rgba(60,35,15,0.3)'; rr(ctx, 4, 8, w, h, 16); ctx.fill();
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, wet ? [[0, '#6e4a2c'], [1, '#55361d']] : [[0, '#a6744a'], [1, '#8a5c36']]);
      rr(ctx, 2, 2, w, h, 16); ctx.fill();
      for (let k = 1; k < 4; k++) {
        const y = 2 + (k * h) / 4;
        ctx.strokeStyle = wet ? 'rgba(40,20,5,0.6)' : 'rgba(90,55,25,0.7)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(12, y); ctx.lineTo(w - 8, y); ctx.stroke();
        ctx.strokeStyle = wet ? 'rgba(140,100,70,0.35)' : 'rgba(210,170,120,0.55)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(12, y - 4); ctx.lineTo(w - 8, y - 4); ctx.stroke();
      }
      if (wet) { ctx.fillStyle = 'rgba(160,210,255,0.25)'; ctx.beginPath(); ctx.ellipse(w * 0.3, h * 0.4, 14, 5, 0, 0, 7); ctx.fill(); }
    });
  }
  tex(scene, 'soil_locked', w + 8, h + 10, (ctx) => {
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3; rr(ctx, 4, 4, w - 2, h - 2, 16); ctx.stroke();
    ctx.fillStyle = 'rgba(80,120,50,0.18)'; rr(ctx, 4, 4, w - 2, h - 2, 16); ctx.fill();
  });
}

function leaf(ctx: Ctx, x: number, y: number, len: number, ang: number, w = 0.45, col = '#5fa845') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = lin(ctx, 0, 0, len, 0, [[0, '#3c7a33'], [0.5, col], [1, '#a9dc78']]);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * w, len, 0); ctx.quadraticCurveTo(len * 0.5, len * w, 0, 0); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(len * 0.85, 0); ctx.stroke();
  ctx.restore();
}

/** Cây trồng theo giai đoạn 0..3. Gốc cây tại (50, 82). */
export function cropTexture(scene: Phaser.Scene, crop: string, stage: number) {
  return tex(scene, `crop_${crop}_${stage}`, 100, 96, (ctx) => {
    const x = 50, y = 82;
    ctx.fillStyle = 'rgba(70,40,15,0.5)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 14 + stage * 4, 4, 0, 0, 7); ctx.fill();
    if (stage === 0) {
      ctx.strokeStyle = '#4f8a3a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 10); ctx.stroke();
      leaf(ctx, x, y - 10, 12, -2.6, 0.5, '#7cc95a'); leaf(ctx, x, y - 10, 12, -0.5, 0.5, '#7cc95a');
      return;
    }
    if (crop === 'ngo' && stage >= 2) {
      ctx.strokeStyle = '#5c9a3e'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 70); ctx.stroke();
      for (let i = 0; i < 5; i++) leaf(ctx, x, y - 12 - i * 13, 30 - i * 3, i % 2 ? -0.5 : -2.6, 0.22);
      if (stage === 3) {
        for (const dx of [-1, 1]) {
          ctx.save(); ctx.translate(x + dx * 8, y - 40); ctx.rotate(dx * 0.35);
          ctx.fillStyle = lin(ctx, -6, 0, 6, 0, [[0, '#e8b923'], [0.5, '#ffe066'], [1, '#d4a017']]);
          rr(ctx, -6, -18, 12, 30, 6); ctx.fill();
          ctx.fillStyle = '#8bc34a'; ctx.beginPath(); ctx.moveTo(-7, 12); ctx.quadraticCurveTo(-10, -6, -2, -14); ctx.lineTo(0, 12); ctx.fill();
          ctx.restore();
        }
      }
      return;
    }
    if (crop === 'hoahong') {
      const stems = stage === 1 ? 2 : 4;
      for (let i = 0; i < stems; i++) {
        const sx = x - 12 + (i * 24) / Math.max(1, stems - 1);
        const top = y - 30 - stage * 10 - (i % 2) * 8;
        ctx.strokeStyle = '#3f7d3a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(sx, y - 20, sx, top); ctx.stroke();
        leaf(ctx, (x + sx) / 2, y - 18, 12, i % 2 ? -0.4 : -2.7, 0.5);
        if (stage === 3) {
          blob(ctx, sx, top - 4, 9, '#ff8fa3', '#e63946', '#9d0208');
          ctx.strokeStyle = 'rgba(120,0,10,0.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(sx, top - 4, 5, 0.5, 5); ctx.stroke();
        } else if (stage === 2) {
          ctx.fillStyle = '#c1121f'; ctx.beginPath(); ctx.ellipse(sx, top - 3, 4, 6, 0, 0, 7); ctx.fill();
        }
      }
      return;
    }
    // cây lá chung
    const size = stage === 1 ? 16 : 24;
    const n = stage === 1 ? 4 : 7;
    const feathery = crop === 'carot';
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * (feathery ? 0.35 : 0.5);
      leaf(ctx, x, y - 4, size + (i % 2) * 5, a, feathery ? 0.18 : 0.45, crop === 'cai' ? '#7cc95a' : '#5fa845');
    }
    if (stage < 3) return;
    switch (crop) {
      case 'cai':
        blob(ctx, x, y - 18, 20, '#d8f5b0', '#8fd16a', '#4f9a3a');
        for (const a of [-2.3, -0.8, -1.55]) leaf(ctx, x, y - 14, 22, a, 0.55, '#8fd16a');
        blob(ctx, x, y - 22, 10, '#f0ffd8', '#b9e88f', '#7cc95a');
        break;
      case 'carot':
        for (const dx of [-12, 0, 12]) {
          ctx.fillStyle = lin(ctx, x + dx - 7, 0, x + dx + 7, 0, [[0, '#e8590c'], [0.5, '#ff922b'], [1, '#d9480f']]);
          ctx.beginPath(); ctx.moveTo(x + dx - 7, y - 6); ctx.lineTo(x + dx + 7, y - 6); ctx.lineTo(x + dx, y + 6); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ff922b'; ctx.beginPath(); ctx.ellipse(x + dx, y - 6, 7, 3, 0, 0, 7); ctx.fill();
        }
        break;
      case 'cachua':
        for (const [dx, dy] of [[-14, -22], [12, -28], [0, -14], [16, -12]]) blob(ctx, x + dx, y + dy, 8, '#ffb3a7', '#e63946', '#9d0208');
        break;
      case 'dau':
        for (const [dx, dy] of [[-16, -8], [14, -10], [0, -4], [-4, -20]]) {
          ctx.fillStyle = lin(ctx, 0, y + dy - 8, 0, y + dy + 8, [[0, '#ff6b6b'], [1, '#c92a2a']]);
          ctx.beginPath(); ctx.moveTo(x + dx - 7, y + dy - 4); ctx.quadraticCurveTo(x + dx, y + dy - 10, x + dx + 7, y + dy - 4); ctx.lineTo(x + dx, y + dy + 8); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffe066'; for (let k = 0; k < 4; k++) ctx.fillRect(x + dx - 3 + (k % 2) * 4, y + dy - 3 + Math.floor(k / 2) * 4, 1.2, 1.2);
          ctx.fillStyle = '#5fa845'; ctx.beginPath(); ctx.ellipse(x + dx, y + dy - 6, 5, 2, 0, 0, 7); ctx.fill();
        }
        break;
      case 'duahau':
        ctx.save(); ctx.translate(x + 2, y - 10);
        ctx.fillStyle = rad(ctx, 0, 0, 0, 22, [[0, '#74c69d'], [1, '#1b6b3a']], -6, -6);
        ctx.beginPath(); ctx.ellipse(0, 0, 24, 16, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#155d2f'; ctx.lineWidth = 3;
        for (const k of [-12, -4, 4, 12]) { ctx.beginPath(); ctx.moveTo(k, -15); ctx.quadraticCurveTo(k + 4, 0, k, 15); ctx.stroke(); }
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(-8, -8, 7, 3, -0.4, 0, 7); ctx.fill();
        ctx.restore();
        break;
      case 'bingo':
        ctx.save(); ctx.translate(x, y - 12);
        for (const k of [-12, 12, -5, 5, 0]) {
          ctx.fillStyle = rad(ctx, k, 0, 0, 14, [[0, '#ffa94d'], [1, '#d9480f']], k - 4, -5);
          ctx.beginPath(); ctx.ellipse(k, 0, 10, 15, 0, 0, 7); ctx.fill();
        }
        ctx.fillStyle = '#6b4226'; ctx.fillRect(-2, -20, 4, 8);
        ctx.restore();
        break;
    }
  });
}

// ===================================================================== XE BUÝT

export const BUS_W = 340;
export const BUS_H = 150;
export const BUS_DOOR_X = -35; // vị trí cửa so với tâm xe

export function busTextures(scene: Phaser.Scene) {
  tex(scene, 'bus_body', BUS_W, BUS_H, (ctx) => {
    // thân
    ctx.fillStyle = lin(ctx, 0, 12, 0, 130, [[0, '#ffd56b'], [0.55, '#ffbf3c'], [1, '#f19a1e']]);
    rr(ctx, 6, 12, 328, 118, [30, 18, 14, 14]); ctx.fill();
    ctx.fillStyle = '#fff1c1'; rr(ctx, 26, 12, 300, 10, 5); ctx.fill();
    // bảng tên
    ctx.fillStyle = '#2b2d42'; rr(ctx, 22, 18, 60, 12, 3); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('XÓM VUI', 52, 27);
    const glass = (x: number, y: number, w: number, h: number, r: number | [number, number, number, number]) => {
      ctx.fillStyle = 'rgba(170,215,245,0.55)'; rr(ctx, x, y, w, h, r); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.moveTo(x + 4, y + h - 2); ctx.lineTo(x + w * 0.45, y + 2); ctx.lineTo(x + w * 0.6, y + 2); ctx.lineTo(x + w * 0.2, y + h - 2); ctx.fill();
    };
    // kính lái
    glass(14, 36, 40, 48, [18, 4, 4, 6]);
    glass(62, 36, 48, 44, 6);
    // cửa
    ctx.fillStyle = '#e08a12'; rr(ctx, 116, 32, 40, 96, 4); ctx.fill();
    glass(120, 36, 15, 86, 3); glass(137, 36, 15, 86, 3);
    // cửa sổ khách
    for (const wx of [164, 220, 276]) glass(wx, 36, 50, 44, 6);
    // sọc
    ctx.fillStyle = '#ef476f'; ctx.fillRect(10, 92, 104, 9); ctx.fillRect(158, 92, 172, 9);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(10, 103, 104, 3); ctx.fillRect(158, 103, 172, 3);
    // hốc bánh
    ctx.fillStyle = '#3b3b48';
    for (const wx of [70, 270]) { ctx.beginPath(); ctx.arc(wx, 130, 28, Math.PI, 0); ctx.fill(); }
    // đèn + cản
    ctx.fillStyle = rad(ctx, 14, 108, 0, 9, [[0, '#ffffff'], [1, '#ffe08a']]); ctx.beginPath(); ctx.arc(14, 108, 7, 0, 7); ctx.fill();
    ctx.fillStyle = '#9aa0ab'; rr(ctx, 0, 118, 36, 10, 4); ctx.fill(); rr(ctx, 306, 118, 34, 10, 4); ctx.fill();
    ctx.fillStyle = '#e63946'; rr(ctx, 326, 70, 8, 18, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(120,70,10,0.45)'; ctx.lineWidth = 2; rr(ctx, 6, 12, 328, 118, [30, 18, 14, 14]); ctx.stroke();
  });
  tex(scene, 'bus_wheel', 50, 50, (ctx) => {
    ctx.fillStyle = '#23232d'; ctx.beginPath(); ctx.arc(25, 25, 23, 0, 7); ctx.fill();
    ctx.fillStyle = rad(ctx, 25, 25, 0, 12, [[0, '#f1f3f5'], [1, '#9aa0ab']]); ctx.beginPath(); ctx.arc(25, 25, 11, 0, 7); ctx.fill();
    ctx.strokeStyle = '#5c6370'; ctx.lineWidth = 2.5;
    for (let i = 0; i < 5; i++) { const t = (i / 5) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(25, 25); ctx.lineTo(25 + Math.cos(t) * 10, 25 + Math.sin(t) * 10); ctx.stroke(); }
  });
}

// ===================================================================== HIỆU ỨNG

export function fxTextures(scene: Phaser.Scene) {
  tex(scene, 'cloud_shadow', 640, 320, (ctx) => {
    for (const [x, y, r] of [[220, 170, 140], [360, 150, 160], [470, 180, 110], [300, 200, 120]]) {
      ctx.fillStyle = rad(ctx, x, y, 0, r, [[0, 'rgba(20,40,30,0.55)'], [1, 'rgba(20,40,30,0)']]);
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  tex(scene, 'butterfly', 26, 20, (ctx) => {
    ctx.fillStyle = '#ffb3c6'; ctx.beginPath(); ctx.ellipse(7, 7, 6, 5, -0.4, 0, 7); ctx.ellipse(19, 7, 6, 5, 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd6e0'; ctx.beginPath(); ctx.ellipse(8, 14, 4, 3, 0.4, 0, 7); ctx.ellipse(18, 14, 4, 3, -0.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#3b2f4a'; ctx.fillRect(12, 4, 2, 13);
  });
  tex(scene, 'smoke', 40, 40, (ctx) => {
    ctx.fillStyle = rad(ctx, 20, 20, 0, 20, [[0, 'rgba(240,240,245,0.9)'], [1, 'rgba(240,240,245,0)']]);
    ctx.fillRect(0, 0, 40, 40);
  });
  tex(scene, 'lily', 48, 32, (ctx) => {
    ctx.fillStyle = lin(ctx, 0, 0, 0, 30, [[0, '#7cc95a'], [1, '#3c7a33']]);
    ctx.beginPath(); ctx.ellipse(24, 16, 20, 12, 0, 0.3, Math.PI * 2 - 0.1); ctx.lineTo(24, 16); ctx.fill();
  });
  tex(scene, 'lotus', 24, 20, (ctx) => {
    ctx.fillStyle = '#ffafcc';
    for (const a of [-0.8, 0, 0.8]) { ctx.save(); ctx.translate(12, 16); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -7, 4, 8, 0, 0, 7); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(12, 12, 2.5, 0, 7); ctx.fill();
  });
  tex(scene, 'reeds', 50, 70, (ctx) => {
    const r = rng(3);
    for (let i = 0; i < 9; i++) {
      const x = 8 + r() * 34;
      ctx.strokeStyle = '#4f8a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, 70); ctx.quadraticCurveTo(x + (r() - 0.5) * 10, 40, x + (r() - 0.5) * 12, 12 + r() * 20); ctx.stroke();
      if (i % 3 === 0) { ctx.fillStyle = '#7a4a28'; rr(ctx, x - 3, 14 + r() * 10, 6, 16, 3); ctx.fill(); }
    }
  });
  tex(scene, 'vignette', 512, 512, (ctx) => {
    ctx.fillStyle = rad(ctx, 256, 256, 160, 380, [[0, 'rgba(255,240,200,0)'], [1, 'rgba(60,40,20,0.28)']]);
    ctx.fillRect(0, 0, 512, 512);
  });
}

// ===================================================================== CẢNH ĐƯỜNG (xe buýt)

export function roadSceneTextures(scene: Phaser.Scene) {
  tex(scene, 'sky', 8, 512, (ctx) => {
    ctx.fillStyle = lin(ctx, 0, 0, 0, 512, [[0, '#6ec3f5'], [0.6, '#bfe6ff'], [1, '#fff1d6']]);
    ctx.fillRect(0, 0, 8, 512);
  });
  tex(scene, 'cloud', 240, 110, (ctx) => {
    for (const [x, y, r] of [[60, 70, 36], [110, 52, 46], [160, 66, 38], [190, 78, 26], [90, 80, 30]]) blob(ctx, x, y, r, '#ffffff', '#ffffff', '#e3eef8');
  });
  const hills = (key: string, base: number, amp: number, cols: [string, string], seed: number, trees: boolean) =>
    tex(scene, key, 1024, 300, (ctx) => {
      const r = rng(seed);
      const pts: number[] = [];
      for (let x = 0; x <= 1024; x += 8) {
        const t = (x / 1024) * Math.PI * 2;
        pts.push(base - amp * (0.5 + 0.3 * Math.sin(t * 2 + seed) + 0.2 * Math.sin(t * 5 + seed * 2)));
      }
      ctx.fillStyle = lin(ctx, 0, 0, 0, 300, [[0, cols[0]], [1, cols[1]]]);
      ctx.beginPath(); ctx.moveTo(0, 300);
      pts.forEach((y, i) => ctx.lineTo(i * 8, y));
      ctx.lineTo(1024, 300); ctx.closePath(); ctx.fill();
      if (trees) {
        for (let i = 0; i < 40; i++) {
          const x = r() * 1024; const y = pts[Math.floor(x / 8)] + 6;
          ctx.fillStyle = '#3c7a33'; ctx.fillRect(x - 2, y - 10, 4, 12);
          blob(ctx, x, y - 18, 10 + r() * 6, '#8fd16a', '#4f9a3a', '#2f6b2a');
        }
      }
    });
  hills('hills_far', 210, 140, ['#a8d8b9', '#7fbf9a'], 1, false);
  hills('hills_mid', 240, 110, ['#8ccf6e', '#5fa845'], 2, true);
  tex(scene, 'road_strip', 512, 170, (ctx) => {
    ctx.fillStyle = '#7fb85a'; ctx.fillRect(0, 0, 512, 30);
    for (let i = 0; i < 60; i++) { ctx.strokeStyle = '#5f9e3f'; ctx.lineWidth = 1.5; const x = (i * 37) % 512; ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x - 3, 20); ctx.stroke(); }
    ctx.fillStyle = '#c9c2b4'; ctx.fillRect(0, 30, 512, 10);
    ctx.fillStyle = lin(ctx, 0, 40, 0, 150, [[0, '#6e7280'], [1, '#585c68']]); ctx.fillRect(0, 40, 512, 110);
    ctx.fillStyle = '#ffffff'; for (let x = 0; x < 512; x += 128) { rr(ctx, x + 20, 92, 70, 7, 3); ctx.fill(); }
    ctx.fillStyle = '#c9c2b4'; ctx.fillRect(0, 150, 512, 8);
    ctx.fillStyle = '#7fb85a'; ctx.fillRect(0, 158, 512, 12);
  });
}

/** Gốc cây (chướng ngại dọn được ở nông trại). */
export function stumpTexture(scene: Phaser.Scene) {
  return tex(scene, 'stump', 74, 56, (ctx) => {
    shadow(ctx, 37, 48, 32, 7, 0.25);
    ctx.fillStyle = lin(ctx, 0, 18, 0, 50, [[0, '#9a6a3f'], [1, '#6e4626']]);
    ctx.beginPath(); ctx.moveTo(10, 46); ctx.lineTo(14, 20); ctx.lineTo(60, 20); ctx.lineTo(64, 46); ctx.quadraticCurveTo(37, 54, 10, 46); ctx.fill();
    // rễ
    ctx.beginPath(); ctx.moveTo(8, 47); ctx.quadraticCurveTo(2, 50, 4, 54); ctx.lineTo(16, 48); ctx.fill();
    ctx.beginPath(); ctx.moveTo(66, 47); ctx.quadraticCurveTo(72, 50, 70, 54); ctx.lineTo(58, 48); ctx.fill();
    // mặt cắt + vân gỗ
    ctx.fillStyle = '#e8c58f'; ctx.beginPath(); ctx.ellipse(37, 20, 23, 8, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#b98a52'; ctx.lineWidth = 1.4;
    for (const r of [5, 10, 15]) { ctx.beginPath(); ctx.ellipse(37, 20, r * 1.4, r * 0.5, 0, 0, 7); ctx.stroke(); }
    ctx.fillStyle = '#7fb85a'; ctx.beginPath(); ctx.ellipse(56, 18, 6, 3, -0.5, 0, 7); ctx.fill();
  });
}

/** Máy chế biến (Sân xưởng) — mỗi máy một hình riêng. Gốc ở chân (giữa đáy). 140×140. */
export function machineTexture(scene: Phaser.Scene, id: string) {
  return tex(scene, `machine_${id}`, 140, 140, (ctx) => {
    shadow(ctx, 70, 128, 52, 9, 0.25);
    if (id === 'oven') {
      ctx.fillStyle = lin(ctx, 92, 0, 108, 0, [[0, '#9c5a43'], [1, '#7a4030']]); rr(ctx, 92, 14, 18, 40, 3); ctx.fill();
      ctx.fillStyle = '#5a2f22'; rr(ctx, 89, 10, 24, 8, 3); ctx.fill();
      ctx.fillStyle = lin(ctx, 0, 40, 0, 128, [[0, '#d9785a'], [1, '#a84d36']]);
      ctx.beginPath(); ctx.moveTo(22, 128); ctx.lineTo(22, 80); ctx.quadraticCurveTo(22, 40, 70, 40); ctx.quadraticCurveTo(118, 40, 118, 80); ctx.lineTo(118, 128); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(90,40,25,.5)'; ctx.lineWidth = 1.5;
      for (let y = 58; y < 126; y += 12) { ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(120, y); ctx.stroke(); }
      for (let y = 46, k = 0; y < 126; y += 12, k++) for (let x = 30 + (k % 2) * 12; x < 118; x += 24) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 12); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = '#3a1d14'; ctx.beginPath(); ctx.moveTo(46, 122); ctx.lineTo(46, 96); ctx.quadraticCurveTo(46, 78, 70, 78); ctx.quadraticCurveTo(94, 78, 94, 96); ctx.lineTo(94, 122); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rad(ctx, 70, 116, 2, 26, [[0, '#fff3b0'], [0.4, '#ffb703'], [1, 'rgba(230,57,70,0)']]); ctx.beginPath(); ctx.ellipse(70, 112, 22, 16, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#7a4030'; rr(ctx, 18, 122, 104, 8, 3); ctx.fill();
    } else if (id === 'press') {
      ctx.fillStyle = lin(ctx, 24, 0, 116, 0, [[0, '#a46b3d'], [0.5, '#c98d55'], [1, '#8d5a30']]);
      ctx.beginPath(); ctx.moveTo(28, 128); ctx.quadraticCurveTo(20, 96, 30, 62); ctx.lineTo(110, 62); ctx.quadraticCurveTo(120, 96, 112, 128); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#5c3a1e'; ctx.lineWidth = 2;
      for (const x of [48, 70, 92]) { ctx.beginPath(); ctx.moveTo(x, 63); ctx.lineTo(x + (x - 70) * 0.08, 127); ctx.stroke(); }
      ctx.fillStyle = '#6b6f7a'; for (const y of [74, 112]) { rr(ctx, 24, y, 92, 6, 3); ctx.fill(); }
      ctx.fillStyle = lin(ctx, 34, 0, 106, 0, [[0, '#b5651d'], [0.5, '#e09f3e'], [1, '#9c5214']]); ctx.beginPath(); ctx.ellipse(70, 60, 38, 12, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#c1121f'; ctx.beginPath(); ctx.ellipse(70, 58, 31, 8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)'; for (const [x, y] of [[58, 56], [78, 59], [70, 55]]) { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill(); }
      for (const [x, c] of [[8, '#e63946'], [116, '#9b2335']] as const) {
        ctx.fillStyle = 'rgba(255,255,255,.9)'; rr(ctx, x, 100, 16, 24, 4); ctx.fill();
        ctx.fillStyle = c; rr(ctx, x + 2, 108, 12, 14, 3); ctx.fill();
        ctx.fillStyle = '#f4d35e'; rr(ctx, x - 1, 96, 18, 6, 2); ctx.fill();
      }
    } else if (id === 'dairy') {
      ctx.fillStyle = lin(ctx, 34, 0, 106, 0, [[0, '#9aa3ad'], [0.35, '#f1f4f7'], [1, '#7d8792']]);
      ctx.beginPath(); ctx.moveTo(38, 128); ctx.lineTo(34, 64); ctx.quadraticCurveTo(34, 48, 70, 48); ctx.quadraticCurveTo(106, 48, 106, 64); ctx.lineTo(102, 128); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7d8792'; for (const y of [76, 108]) { rr(ctx, 33, y, 74, 5, 2.5); ctx.fill(); }
      ctx.fillStyle = '#c9d1d9'; ctx.beginPath(); ctx.ellipse(70, 48, 30, 8, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#5c6670'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(70, 46); ctx.lineTo(70, 22); ctx.lineTo(94, 22); ctx.stroke();
      ctx.fillStyle = '#d62828'; ctx.beginPath(); ctx.arc(96, 22, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#4cc9f0'; rr(ctx, 50, 86, 40, 16, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('SỮA', 70, 98);
    } else {
      ctx.strokeStyle = '#8d5a30'; ctx.lineWidth = 8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(28, 128); ctx.lineTo(34, 30); ctx.moveTo(112, 128); ctx.lineTo(106, 30); ctx.stroke();
      ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(26, 34); ctx.lineTo(114, 34); ctx.moveTo(28, 100); ctx.lineTo(112, 100); ctx.stroke();
      const cols = ['#ef476f', '#ffd166', '#06d6a0', '#4cc9f0', '#9b72cf'];
      ctx.lineWidth = 2;
      for (let i = 0; i < 13; i++) { const x = 40 + i * 5; ctx.strokeStyle = cols[i % cols.length]; ctx.beginPath(); ctx.moveTo(x, 38); ctx.lineTo(x, 96); ctx.stroke(); }
      for (let i = 0; i < 5; i++) { ctx.fillStyle = cols[i]; ctx.fillRect(38, 70 + i * 5, 64, 5); }
      ctx.fillStyle = '#ef476f'; ctx.beginPath(); ctx.arc(54, 118, 9, 0, 7); ctx.fill();
      ctx.fillStyle = '#4cc9f0'; ctx.beginPath(); ctx.arc(84, 120, 8, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5;
      for (const [x, y, r] of [[54, 118, 6], [84, 120, 5]]) { ctx.beginPath(); ctx.arc(x, y, r, 0.4, 2.6); ctx.stroke(); }
    }
  });
}

/** Bệ đá tròn dưới máy chế biến (ảnh tĩnh — rẻ hơn Graphics vẽ lại mỗi khung hình). */
export function padTexture(scene: Phaser.Scene) {
  return tex(scene, 'machine_pad', 136, 50, (ctx) => {
    ctx.fillStyle = '#b3a78f'; ctx.beginPath(); ctx.ellipse(68, 27, 66, 23, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#d8cfbd'; ctx.beginPath(); ctx.ellipse(68, 23, 62, 20, 0, 0, 7); ctx.fill();
  });
}
