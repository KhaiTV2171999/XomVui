import { Appearance, HAIR_COLORS, ITEMS, SKINS } from '../../../shared/catalog';

// Vẽ nhân vật chibi trong hệ toạ độ 64 x 96 (chân ở y≈92), nhân với `scale`.
export const AV_W = 64;
export const AV_H = 96;

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillStroke(ctx: CanvasRenderingContext2D, fill: string, stroke = 'rgba(40,30,50,0.55)', lw = 1.2) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

export interface Pose {
  /** Độ nhấc chân trái/phải (px). */
  legL: number;
  legR: number;
  /** Độ vung tay trái/phải (px, dương = xuống). */
  armL: number;
  armR: number;
  /** Nhún thân trên (px, âm = lên). */
  bob: number;
}
export const IDLE: Pose = { legL: 0, legR: 0, armL: 0, armR: 0, bob: 0 };
/** 4 khung bước đi. */
export const WALK: Pose[] = [
  { legL: 3.5, legR: 0, armL: -2.5, armR: 2.5, bob: -1.2 },
  { legL: 0, legR: 0, armL: 0, armR: 0, bob: 0 },
  { legL: 0, legR: 3.5, armL: 2.5, armR: -2.5, bob: -1.2 },
  { legL: 0, legR: 0, armL: 0, armR: 0, bob: 0 },
];

export function drawAvatar(
  ctx: CanvasRenderingContext2D, a: Appearance, scale = 1,
  opts: { shadow?: boolean; pose?: Pose; back?: boolean } = {},
) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const pose = opts.pose ?? IDLE;
  const back = !!opts.back;
  const skin = SKINS[a.skin] ?? SKINS[0];
  const hairC = HAIR_COLORS[a.hairColor] ?? HAIR_COLORS[0];
  const top = ITEMS[a.top];
  const bottom = ITEMS[a.bottom];
  const hat = a.hat ? ITEMS[a.hat] : null;
  const acc = a.acc ? ITEMS[a.acc] : null;

  if (opts.shadow !== false) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(32, 92, 17, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const drawWings = () => {
    if (acc?.style !== 'wings') return;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(32 + dir * 6, 58);
      ctx.bezierCurveTo(32 + dir * 30, 34, 32 + dir * 34, 58, 32 + dir * 26, 72);
      ctx.bezierCurveTo(32 + dir * 20, 70, 32 + dir * 14, 68, 32 + dir * 6, 64);
      fillStroke(ctx, acc.color!, 'rgba(120,150,200,0.7)');
      ctx.beginPath();
      ctx.moveTo(32 + dir * 12, 60);
      ctx.quadraticCurveTo(32 + dir * 22, 54, 32 + dir * 26, 62);
      ctx.strokeStyle = acc.color2 ?? '#cde7ff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };
  const drawCape = () => {
    if (acc?.style !== 'cape') return;
    ctx.beginPath();
    ctx.moveTo(21, 54); ctx.lineTo(43, 54); ctx.lineTo(49, 86); ctx.quadraticCurveTo(32, 90, 15, 86); ctx.closePath();
    fillStroke(ctx, acc.color!);
  };
  const drawBackHair = () => {
    if (a.hair === 2) { rr(ctx, 11, 26, 42, 40, 12); fillStroke(ctx, hairC); }
    else if (a.hair === 3) { rr(ctx, 11, 24, 42, 30, 12); fillStroke(ctx, hairC); }
    else if (a.hair === 4) {
      ctx.beginPath();
      if (back) ctx.ellipse(32, 50, 7, 12, 0, 0, Math.PI * 2);
      else ctx.ellipse(53, 34, 7, 13, 0.4, 0, Math.PI * 2);
      fillStroke(ctx, hairC);
    }
  };

  // ---- Phía sau người (nhìn từ trước) ----
  ctx.save();
  ctx.translate(0, pose.bob);
  if (!back) { drawWings(); drawCape(); drawBackHair(); }
  ctx.restore();

  // ---- Chân / quần (chạm đất, không nhún) ----
  const bStyle = bottom?.style ?? 'pants';
  const bColor = bottom?.color ?? '#4a6fa5';
  const isLongTop = top?.style === 'dress' || top?.style === 'aodai';
  const legs: [number, number][] = [[23.5, pose.legL], [32.5, pose.legR]];
  if (bStyle === 'pants') {
    for (const [x, lift] of legs) { rr(ctx, x, 70, 8, 19 - lift, 3); fillStroke(ctx, bColor); }
  } else {
    for (const [x, lift] of legs) { rr(ctx, x + 1, 74, 6.5, 15 - lift, 3); fillStroke(ctx, skin); }
    if (bStyle === 'shorts') {
      rr(ctx, 23, 70, 8.5, 9, 2); fillStroke(ctx, bColor);
      rr(ctx, 32.5, 70, 8.5, 9, 2); fillStroke(ctx, bColor);
    }
  }
  ctx.fillStyle = '#3a2f3f';
  for (const [x, lift] of legs) { ctx.beginPath(); ctx.ellipse(x + 4, 89.5 - lift, 5.5, 3, 0, 0, Math.PI * 2); ctx.fill(); }

  // ---- Thân trên (nhún theo bước) ----
  ctx.save();
  ctx.translate(0, pose.bob);

  if (bStyle === 'skirt' && !isLongTop) {
    ctx.beginPath();
    ctx.moveTo(22, 68); ctx.lineTo(42, 68); ctx.lineTo(46, 82); ctx.lineTo(18, 82); ctx.closePath();
    fillStroke(ctx, bColor);
    if (bottom?.color2) {
      ctx.strokeStyle = bottom.color2; ctx.lineWidth = 1.2;
      for (let x = 22; x <= 42; x += 5) { ctx.beginPath(); ctx.moveTo(x, 69); ctx.lineTo(x + (x - 32) * 0.25, 81); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(20, 75); ctx.lineTo(44, 75); ctx.stroke();
    }
  }

  const tStyle = top?.style ?? 'tee';
  const tColor = top?.color ?? '#f4f4f8';
  const tColor2 = top?.color2 ?? shade(tColor, -30);

  if (tStyle === 'dress' || tStyle === 'aodai') {
    ctx.beginPath();
    const bottomY = tStyle === 'aodai' ? 86 : 80;
    ctx.moveTo(22, 53); ctx.lineTo(42, 53); ctx.lineTo(47, bottomY); ctx.quadraticCurveTo(32, bottomY + 3, 17, bottomY); ctx.closePath();
    fillStroke(ctx, tColor);
    if (tStyle === 'aodai') {
      ctx.strokeStyle = 'rgba(40,30,50,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(32, 70); ctx.lineTo(32, bottomY + 2); ctx.stroke();
      if (!back) {
        ctx.fillStyle = tColor2;
        ctx.beginPath(); ctx.arc(32, 62, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(28, 58, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(36, 66, 1.4, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.strokeStyle = tColor2; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(19, 76); ctx.quadraticCurveTo(32, 79, 45, 76); ctx.stroke();
    }
  } else {
    rr(ctx, 20.5, 52, 23, 21, 6);
    fillStroke(ctx, tColor);
    if (tStyle === 'stripe') {
      ctx.save(); rr(ctx, 20.5, 52, 23, 21, 6); ctx.clip();
      ctx.fillStyle = tColor2;
      for (let y = 56; y < 74; y += 5) ctx.fillRect(20, y, 24, 2);
      ctx.restore();
      rr(ctx, 20.5, 52, 23, 21, 6); ctx.strokeStyle = 'rgba(40,30,50,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
    } else if (tStyle === 'hoodie') {
      if (back) {
        ctx.fillStyle = shade(tColor, -20);
        ctx.beginPath(); ctx.ellipse(32, 55, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = shade(tColor, -25);
        rr(ctx, 26, 63, 12, 6, 2); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(29, 54); ctx.lineTo(29, 60); ctx.moveTo(35, 54); ctx.lineTo(35, 60); ctx.stroke();
      }
    } else if (tStyle === 'jacket' && !back) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(28, 52); ctx.lineTo(36, 52); ctx.lineTo(32, 64); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = tColor2; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(32, 64); ctx.lineTo(32, 72); ctx.stroke();
      ctx.fillStyle = tColor2;
      ctx.beginPath(); ctx.arc(30, 67, 0.9, 0, 7); ctx.arc(30, 70, 0.9, 0, 7); ctx.fill();
    }
  }
  // tay (vung theo bước)
  const sleeve = tStyle === 'dress' ? skin : tColor;
  for (const [x, hx, sw] of [[14.5, 18, pose.armL], [42.5, 46, pose.armR]] as const) {
    rr(ctx, x, 54 + sw * 0.4, 7, 15, 3.5); fillStroke(ctx, sleeve);
    ctx.beginPath(); ctx.arc(hx, 70 + sw, 3.4, 0, Math.PI * 2); fillStroke(ctx, skin);
  }

  if (acc?.style === 'scarf') {
    rr(ctx, 21, 49, 22, 6, 3); fillStroke(ctx, acc.color!);
    if (!back) { rr(ctx, 35, 52, 5, 11, 2); fillStroke(ctx, acc.color!); }
  }

  // ---- Đầu ----
  ctx.beginPath(); ctx.arc(13, 37, 3.5, 0, Math.PI * 2); fillStroke(ctx, skin);
  ctx.beginPath(); ctx.arc(51, 37, 3.5, 0, Math.PI * 2); fillStroke(ctx, skin);
  ctx.beginPath(); ctx.ellipse(32, 34, 19.5, 18.5, 0, 0, Math.PI * 2); fillStroke(ctx, skin);

  if (back) {
    // gáy: tóc phủ gần hết đầu
    ctx.beginPath(); ctx.ellipse(32, 31, 20, 17.5, 0, 0, Math.PI * 2); fillStroke(ctx, hairC);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(32, 32, 14, Math.PI * 1.2, Math.PI * 1.5); ctx.stroke();
    if (a.hair === 1) drawHairFront(ctx, 1, hairC);
    if (a.hair === 5) drawHairFront(ctx, 5, hairC);
    drawBackHair();
    drawCape();
    drawWings();
  } else {
    // mặt
    ctx.fillStyle = 'rgba(255,120,140,0.35)';
    ctx.beginPath(); ctx.ellipse(21, 42, 3.6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(43, 42, 3.6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2233';
    ctx.beginPath(); ctx.ellipse(25, 37.5, 2.8, 3.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(39, 37.5, 2.8, 3.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(26, 36.2, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(40, 36.2, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7a3b3b'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(32, 43, 2.6, 0.2, Math.PI - 0.2); ctx.stroke();

    drawHairFront(ctx, a.hair, hairC);

    if (acc?.style === 'glasses') {
      ctx.strokeStyle = acc.color!; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(25, 37.5, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(39, 37.5, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(30, 37); ctx.lineTo(34, 37); ctx.stroke();
    } else if (acc?.style === 'sunglasses') {
      ctx.fillStyle = acc.color!;
      rr(ctx, 19, 34, 12, 7, 3); ctx.fill();
      rr(ctx, 33, 34, 12, 7, 3); ctx.fill();
      ctx.fillRect(30, 35.5, 4, 1.6);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(21, 35.5, 3, 1.4); ctx.fillRect(35, 35.5, 3, 1.4);
    }
  }

  if (hat) drawHat(ctx, hat.style!, hat.color!, hat.color2);
  ctx.restore();
  ctx.restore();
}

function drawHairFront(ctx: CanvasRenderingContext2D, style: number, c: string) {
  ctx.beginPath();
  // nền chỏm tóc
  ctx.moveTo(12, 34);
  ctx.bezierCurveTo(11, 12, 53, 12, 52, 34);
  if (style === 3) {
    // mái bằng
    ctx.lineTo(52, 30); ctx.quadraticCurveTo(32, 26, 12, 30);
  } else if (style === 2) {
    // rẽ ngôi giữa
    ctx.quadraticCurveTo(44, 22, 33, 21); ctx.quadraticCurveTo(22, 22, 12, 34);
  } else {
    // mái lệch
    ctx.quadraticCurveTo(46, 24, 40, 26);
    ctx.quadraticCurveTo(34, 30, 30, 25);
    ctx.quadraticCurveTo(22, 31, 12, 34);
  }
  ctx.closePath();
  fillStroke(ctx, c);

  if (style === 1) {
    // tóc dựng
    ctx.beginPath();
    ctx.moveTo(16, 22); ctx.lineTo(18, 9); ctx.lineTo(25, 18); ctx.lineTo(30, 5); ctx.lineTo(35, 17);
    ctx.lineTo(42, 7); ctx.lineTo(44, 19); ctx.lineTo(50, 14); ctx.lineTo(49, 25);
    ctx.closePath();
    fillStroke(ctx, c);
  } else if (style === 5) {
    // búi đôi
    ctx.beginPath(); ctx.arc(17, 16, 7, 0, Math.PI * 2); fillStroke(ctx, c);
    ctx.beginPath(); ctx.arc(47, 16, 7, 0, Math.PI * 2); fillStroke(ctx, c);
  } else if (style === 4) {
    ctx.fillStyle = '#ff6b9a';
    ctx.beginPath(); ctx.arc(49, 25, 2.6, 0, Math.PI * 2); ctx.fill();
  }
  // bóng tóc
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(32, 32, 16, Math.PI * 1.15, Math.PI * 1.4); ctx.stroke();
}

function drawHat(ctx: CanvasRenderingContext2D, style: string, c: string, c2?: string) {
  switch (style) {
    case 'cap':
      ctx.beginPath(); ctx.moveTo(13, 24); ctx.bezierCurveTo(14, 4, 50, 4, 51, 24); ctx.closePath();
      fillStroke(ctx, c);
      ctx.beginPath(); ctx.ellipse(40, 24, 15, 3.5, 0.08, 0, Math.PI * 2); fillStroke(ctx, shade(c, -30));
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(32, 8.5, 1.8, 0, 7); ctx.fill();
      break;
    case 'beanie':
      ctx.beginPath(); ctx.moveTo(12, 25); ctx.bezierCurveTo(12, 2, 52, 2, 52, 25); ctx.closePath();
      fillStroke(ctx, c);
      rr(ctx, 11, 21, 42, 7, 3.5); fillStroke(ctx, shade(c, -25));
      ctx.beginPath(); ctx.arc(32, 4, 4.5, 0, 7); fillStroke(ctx, c2 ?? '#fff');
      break;
    case 'bow':
      ctx.save(); ctx.translate(46, 17); ctx.rotate(0.3);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-10, -6); ctx.lineTo(-10, 6); ctx.closePath(); fillStroke(ctx, c);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, -6); ctx.lineTo(10, 6); ctx.closePath(); fillStroke(ctx, c);
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); fillStroke(ctx, shade(c, -30));
      ctx.restore();
      break;
    case 'party':
      ctx.beginPath(); ctx.moveTo(22, 19); ctx.lineTo(32, -6 + 6); ctx.lineTo(42, 19); ctx.closePath();
      fillStroke(ctx, c);
      ctx.strokeStyle = c2 ?? '#fb5607'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(25, 13); ctx.lineTo(39, 13); ctx.moveTo(28, 7); ctx.lineTo(36, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(32, 0, 3, 0, 7); fillStroke(ctx, c2 ?? '#fb5607');
      break;
    case 'flower': {
      const cols = [c, c2 ?? '#95d5b2', '#fff3b0', c];
      for (let i = 0; i < 7; i++) {
        const t = Math.PI * (1.05 + i * 0.15);
        const x = 32 + Math.cos(t) * 19;
        const y = 30 + Math.sin(t) * 17;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); fillStroke(ctx, cols[i % cols.length]);
        ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(x, y, 1.3, 0, 7); ctx.fill();
      }
      break;
    }
    case 'nonla':
      ctx.beginPath(); ctx.moveTo(2, 24); ctx.lineTo(32, -2); ctx.lineTo(62, 24); ctx.quadraticCurveTo(32, 30, 2, 24);
      fillStroke(ctx, c);
      ctx.strokeStyle = c2 ?? '#c9a96e'; ctx.lineWidth = 1;
      for (const k of [0.35, 0.6, 0.82]) {
        ctx.beginPath(); ctx.moveTo(32 - 30 * k, -2 + 26 * k); ctx.quadraticCurveTo(32, -2 + 28 * k + 2, 32 + 30 * k, -2 + 26 * k); ctx.stroke();
      }
      break;
    case 'crown':
      ctx.beginPath();
      ctx.moveTo(17, 20); ctx.lineTo(17, 6); ctx.lineTo(24, 13); ctx.lineTo(32, 3); ctx.lineTo(40, 13); ctx.lineTo(47, 6); ctx.lineTo(47, 20);
      ctx.closePath(); fillStroke(ctx, c, '#b8860b');
      ctx.fillStyle = c2 ?? '#e63946';
      ctx.beginPath(); ctx.arc(32, 15, 2.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#4cc9f0';
      ctx.beginPath(); ctx.arc(23, 16, 1.7, 0, 7); ctx.arc(41, 16, 1.7, 0, 7); ctx.fill();
      break;
  }
}

/** Tạo canvas chứa avatar (dùng cho Phaser texture và ảnh xem trước). */
export function avatarCanvas(a: Appearance, scale = 2) {
  const c = document.createElement('canvas');
  c.width = AV_W * scale;
  c.height = AV_H * scale;
  drawAvatar(c.getContext('2d')!, a, scale);
  return c;
}

export function appearanceKey(a: Appearance) {
  return `av_${a.skin}_${a.hair}_${a.hairColor}_${a.top}_${a.bottom}_${a.hat ?? '-'}_${a.acc ?? '-'}`;
}
