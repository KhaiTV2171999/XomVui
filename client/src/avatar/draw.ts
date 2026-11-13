import { Appearance, HAIR_COLORS, ITEMS, SKINS } from '../../../shared/catalog';

// Vẽ nhân vật chibi trong hệ toạ độ thân 64 x 96 (chân ở y≈92), nhân với `scale`.
// Khung vẽ rộng hơn thân (lề OX hai bên, OY phía trên) để chứa xe cộ, bóng bay…
export const OX = 16;
export const OY = 12;
export const AV_W = 64 + OX * 2;
export const AV_H = 96 + OY;
/** Vị trí bàn chân trong khung vẽ (dùng làm gốc sprite) */
export const FOOT_Y = 92 + OY;
/** Phương tiện nâng nhân vật lên bao nhiêu (đơn vị thân) */
const RIDE_LIFT: Record<string, number> = { skates: 3, skateboard: 5, bicycle: 9, scooter: 8, car: 4 };
export function rideLift(a: Appearance) {
  const st = a.ride ? ITEMS[a.ride]?.style : undefined;
  return st ? RIDE_LIFT[st] ?? 0 : 0;
}

/** Vùng cần vẽ (toạ độ khung): đồ thường chỉ cần khung thân 64×96 → ảnh xem trước không bị thu nhỏ. */
export function avatarBounds(a: Appearance) {
  const wide = !!(a.ride && ITEMS[a.ride]) ;
  const tall = !!(a.hand && ITEMS[a.hand]) || wide;
  const x = wide ? 0 : OX;
  const y = tall ? 0 : OY;
  return { x, y, w: wide ? AV_W : 64, h: AV_H - y };
}

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
  ctx.translate(OX, OY);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const ride = a.ride ? ITEMS[a.ride] ?? null : null;
  const rs = ride?.style;
  const handIt = a.hand ? ITEMS[a.hand] ?? null : null;
  const mouthIt = a.mouth ? ITEMS[a.mouth] ?? null : null;
  const lift = rs ? RIDE_LIFT[rs] ?? 0 : 0;
  let pose = opts.pose ?? IDLE;
  // Trên xe: không bước chân (xe đạp thì đạp nhẹ), chỉ rung nhẹ; patin thì lướt
  if (rs === 'skates') pose = { ...pose, legL: pose.legL * 0.6, legR: pose.legR * 0.6, armL: pose.armL * 1.3, armR: pose.armR * 1.3 };
  else if (rs) {
    const pedal = rs === 'bicycle' ? 0.8 : 0;
    pose = { legL: pose.legL * pedal, legR: pose.legR * pedal, armL: 0, armR: 0, bob: pose.bob ? -0.7 : 0 };
  }
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
    const sw = rs === 'car' ? 48 : rs === 'scooter' || rs === 'bicycle' ? 38 : rs === 'skateboard' ? 26 : 17;
    ctx.ellipse(32, 92, sw, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (ride) drawRideBehind(ctx, rs!, ride.color!, ride.color2);
  ctx.save();
  ctx.translate(0, -lift);

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
    else if (a.hair === 6) {
      for (const [x, y] of [[12, 34], [52, 34], [11, 43], [53, 43], [15, 50], [49, 50]]) { ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 7); fillStroke(ctx, hairC); }
    }
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
  if (acc?.style === 'backpack' && !back) { rr(ctx, 17, 54, 30, 22, 7); fillStroke(ctx, shade(acc.color!, -25)); }
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
  if (rs === 'skates') {
    for (const [x, lf] of legs) {
      rr(ctx, x - 1.5, 84.5 - lf, 11, 6.5, 2.5); fillStroke(ctx, ride!.color!);
      ctx.fillStyle = ride!.color2 ?? '#ffd166';
      for (const wx of [x + 0.5, x + 4, x + 7.5]) { ctx.beginPath(); ctx.arc(wx, 93 - lf, 1.9, 0, 7); ctx.fill(); }
    }
  }

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

  if (handIt) drawHandItem(ctx, handIt.style!, handIt.color!, handIt.color2, 46, 70 + pose.armR);

  if (acc?.style === 'backpack') {
    if (back) {
      rr(ctx, 19, 51, 26, 24, 7); fillStroke(ctx, acc.color!);
      rr(ctx, 23, 61, 18, 10, 4); fillStroke(ctx, acc.color2 ?? shade(acc.color!, -30));
    } else {
      ctx.strokeStyle = acc.color2 ?? shade(acc.color!, -30); ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(24.5, 52); ctx.lineTo(24.5, 67); ctx.moveTo(39.5, 52); ctx.lineTo(39.5, 67); ctx.stroke();
    }
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
    if (a.hair === 1 || a.hair === 5 || a.hair === 6 || a.hair === 7 || a.hair === 8) drawHairFront(ctx, a.hair, hairC, true);
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
    } else if (acc?.style === 'heartglasses') {
      for (const cx of [25, 39]) { heart(ctx, cx, 38.5, 5.6); fillStroke(ctx, acc.color!, 'rgba(120,0,40,0.7)'); }
      ctx.strokeStyle = acc.color!; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(30, 36.5); ctx.lineTo(34, 36.5); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.arc(23, 36, 1.2, 0, 7); ctx.arc(37, 36, 1.2, 0, 7); ctx.fill();
    }
    if (mouthIt) drawMouthItem(ctx, mouthIt.style!, mouthIt.color!, mouthIt.color2);
  }

  if (hat) drawHat(ctx, hat.style!, hat.color!, hat.color2);
  ctx.restore();
  ctx.restore();
  if (ride) drawRideFront(ctx, rs!, ride.color!, ride.color2);
  ctx.restore();
}

function heart(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.9);
  ctx.bezierCurveTo(cx - r * 1.4, cy - r * 0.1, cx - r * 0.7, cy - r * 1.1, cx, cy - r * 0.4);
  ctx.bezierCurveTo(cx + r * 0.7, cy - r * 1.1, cx + r * 1.4, cy - r * 0.1, cx, cy + r * 0.9);
  ctx.closePath();
}

function wheel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, hub = '#c9ced6') {
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); fillStroke(ctx, '#2b2b33', '#16161c', 1.2);
  ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, 7); fillStroke(ctx, hub, 'rgba(40,30,50,0.6)', 1);
}

/** Phần xe nằm SAU người (vẽ trước thân). Toạ độ thân, mặt đất y = 92. */
function drawRideBehind(ctx: CanvasRenderingContext2D, st: string, c: string, c2?: string) {
  switch (st) {
    case 'skateboard': {
      rr(ctx, 6, 86, 52, 4.5, 2.2); fillStroke(ctx, c);
      ctx.fillStyle = c2 ?? '#ffbe0b'; ctx.fillRect(14, 87, 36, 1.4);
      ctx.beginPath(); ctx.moveTo(6, 88); ctx.quadraticCurveTo(2, 87, 3, 83); ctx.moveTo(58, 88); ctx.quadraticCurveTo(62, 87, 61, 83);
      ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.stroke();
      for (const x of [15, 49]) { ctx.beginPath(); ctx.arc(x, 92, 2.8, 0, 7); fillStroke(ctx, '#f1faee', 'rgba(40,30,50,0.6)'); }
      break;
    }
    case 'bicycle': {
      wheel(ctx, 4, 82, 10); wheel(ctx, 60, 82, 10);
      ctx.strokeStyle = c; ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(4, 82); ctx.lineTo(30, 84); ctx.lineTo(26, 68); ctx.lineTo(4, 82);
      ctx.moveTo(30, 84); ctx.lineTo(53, 64); ctx.lineTo(26, 68);
      ctx.moveTo(53, 64); ctx.lineTo(60, 82);
      ctx.stroke();
      ctx.strokeStyle = c2 ?? '#264653'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(53, 64); ctx.lineTo(52, 56); ctx.lineTo(58, 55); ctx.stroke();
      rr(ctx, 19, 64.5, 13, 3.6, 1.8); fillStroke(ctx, c2 ?? '#264653');
      ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(30, 84, 2.4, 0, 7); ctx.fill();
      break;
    }
    case 'scooter': {
      wheel(ctx, 2, 85, 7.5); wheel(ctx, 62, 85, 7.5);
      // thân sau + yên
      ctx.beginPath();
      ctx.moveTo(-8, 84); ctx.quadraticCurveTo(-10, 70, 4, 68); ctx.lineTo(30, 70); ctx.lineTo(34, 80); ctx.lineTo(48, 82); ctx.lineTo(48, 86); ctx.lineTo(-6, 86); ctx.closePath();
      fillStroke(ctx, c);
      rr(ctx, 2, 63, 30, 6, 3); fillStroke(ctx, '#3a2f3f');
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; rr(ctx, -4, 72, 14, 3, 1.5); ctx.fill();
      ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.arc(-8, 76, 2, 0, 7); ctx.fill();
      break;
    }
    case 'car': {
      // lưng ghế + kính chắn gió phía sau người
      rr(ctx, 6, 56, 18, 18, 6); fillStroke(ctx, shade(c, -40));
      break;
    }
  }
}

/** Phần xe nằm TRƯỚC người (vẽ sau thân). */
function drawRideFront(ctx: CanvasRenderingContext2D, st: string, c: string, c2?: string) {
  switch (st) {
    case 'scooter': {
      // khiên trước + tay lái + đèn
      ctx.beginPath();
      ctx.moveTo(46, 86); ctx.lineTo(50, 58); ctx.quadraticCurveTo(56, 56, 58, 62); ctx.lineTo(60, 80); ctx.quadraticCurveTo(58, 86, 52, 86); ctx.closePath();
      fillStroke(ctx, c);
      ctx.strokeStyle = '#3a2f3f'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(52, 58); ctx.lineTo(50, 50); ctx.lineTo(44, 50); ctx.stroke();
      ctx.beginPath(); ctx.arc(56, 60, 3, 0, 7); fillStroke(ctx, '#fff3b0');
      ctx.fillStyle = c2 ?? '#f1faee'; rr(ctx, 50, 66, 6, 10, 3); ctx.fill();
      break;
    }
    case 'car': {
      // thân xe mui trần che nửa người dưới
      ctx.beginPath();
      ctx.moveTo(-14, 88); ctx.lineTo(-14, 76); ctx.quadraticCurveTo(-14, 68, -4, 68);
      ctx.lineTo(66, 68); ctx.quadraticCurveTo(78, 69, 78, 78); ctx.lineTo(78, 88); ctx.closePath();
      fillStroke(ctx, c);
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; rr(ctx, -10, 70, 84, 3, 1.5); ctx.fill();
      // cửa
      ctx.strokeStyle = 'rgba(40,30,50,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(14, 70); ctx.lineTo(14, 86); ctx.moveTo(48, 70); ctx.lineTo(48, 86); ctx.stroke();
      ctx.fillStyle = 'rgba(40,30,50,0.55)'; rr(ctx, 40, 75, 5, 1.6, 0.8); ctx.fill();
      // kính chắn gió
      ctx.beginPath(); ctx.moveTo(54, 68); ctx.lineTo(60, 54); ctx.lineTo(63, 55); ctx.lineTo(60, 68); ctx.closePath();
      fillStroke(ctx, 'rgba(190,230,255,0.65)', 'rgba(60,80,110,0.8)', 1);
      // đèn, cản
      ctx.fillStyle = c2 ?? '#ffd166'; ctx.beginPath(); ctx.ellipse(76, 75, 2.2, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff6b6b'; ctx.fillRect(-14, 73, 2.4, 4);
      rr(ctx, -16, 85, 96, 3.4, 1.7); fillStroke(ctx, '#c9ced6');
      wheel(ctx, 4, 88, 8); wheel(ctx, 60, 88, 8);
      break;
    }
  }
}

/** Đồ cầm ở tay phải (toạ độ tay hx, hy). */
function drawHandItem(ctx: CanvasRenderingContext2D, st: string, c: string, c2: string | undefined, hx: number, hy: number) {
  switch (st) {
    case 'balloon':
    case 'balloonheart': {
      ctx.strokeStyle = 'rgba(80,70,90,0.8)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(hx, hy - 2); ctx.bezierCurveTo(hx + 6, hy - 22, hx + 2, hy - 40, hx + 9, hy - 56); ctx.stroke();
      if (st === 'balloon') { ctx.beginPath(); ctx.ellipse(hx + 9, hy - 65, 8, 9.5, 0.1, 0, 7); fillStroke(ctx, c); }
      else { heart(ctx, hx + 9, hy - 64, 9); fillStroke(ctx, c); }
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(hx + 9, hy - 56.5); ctx.lineTo(hx + 7, hy - 54); ctx.lineTo(hx + 11, hy - 54); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(hx + 6, hy - 69, 2, 3, -0.4, 0, 7); ctx.fill();
      break;
    }
    case 'icecream':
      ctx.beginPath(); ctx.moveTo(hx - 4, hy - 4); ctx.lineTo(hx + 4, hy - 4); ctx.lineTo(hx, hy + 5); ctx.closePath(); fillStroke(ctx, c2 ?? '#f4a261');
      ctx.beginPath(); ctx.arc(hx, hy - 7, 4.6, 0, 7); fillStroke(ctx, c);
      ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(hx + 1, hy - 11.5, 1.4, 0, 7); ctx.fill();
      break;
    case 'cottoncandy':
      ctx.strokeStyle = '#f1e3c8'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(hx, hy + 2); ctx.lineTo(hx + 3, hy - 14); ctx.stroke();
      for (const [dx, dy, r, col] of [[0, -20, 6, c], [5, -17, 5, c2 ?? c], [-4, -16, 4.5, c2 ?? c], [3, -24, 4.5, c]] as const) {
        ctx.beginPath(); ctx.arc(hx + 3 + dx, hy + dy, r, 0, 7); fillStroke(ctx, col, 'rgba(160,90,140,0.5)', 1);
      }
      break;
    case 'flag':
      ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(hx, hy + 6); ctx.lineTo(hx, hy - 34); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx, hy - 34); ctx.quadraticCurveTo(hx + 9, hy - 37, hx + 18, hy - 33); ctx.lineTo(hx + 18, hy - 22); ctx.quadraticCurveTo(hx + 9, hy - 26, hx, hy - 23); ctx.closePath();
      fillStroke(ctx, c);
      ctx.fillStyle = c2 ?? '#ffd166'; ctx.beginPath(); ctx.arc(hx + 9, hy - 28.5, 2.6, 0, 7); ctx.fill();
      break;
    case 'teddy':
      ctx.beginPath(); ctx.arc(hx + 3, hy + 4, 6, 0, 7); fillStroke(ctx, c);
      ctx.beginPath(); ctx.arc(hx - 1, hy - 5, 2.4, 0, 7); ctx.arc(hx + 7, hy - 5, 2.4, 0, 7); fillStroke(ctx, c);
      ctx.beginPath(); ctx.arc(hx + 3, hy - 2.5, 5, 0, 7); fillStroke(ctx, c);
      ctx.fillStyle = c2 ?? '#f2d0a9'; ctx.beginPath(); ctx.ellipse(hx + 3, hy - 1, 2.4, 1.8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#2a2233'; ctx.beginPath(); ctx.arc(hx + 1.2, hy - 3.5, 0.8, 0, 7); ctx.arc(hx + 4.8, hy - 3.5, 0.8, 0, 7); ctx.arc(hx + 3, hy - 1.6, 0.7, 0, 7); ctx.fill();
      break;
    case 'wand': {
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hx - 1, hy + 2); ctx.lineTo(hx + 9, hy - 16); ctx.stroke();
      const sx = hx + 10, sy = hy - 19;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 2.4 : 5.5;
        const t = -Math.PI / 2 + (i * Math.PI) / 5;
        ctx.lineTo(sx + Math.cos(t) * r, sy + Math.sin(t) * r);
      }
      ctx.closePath(); fillStroke(ctx, c2 ?? '#ffd166', '#c79100', 1);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx + 7, sy - 4, 1, 0, 7); ctx.arc(sx - 6, sy + 3, 0.8, 0, 7); ctx.fill();
      break;
    }
    case 'guitar':
      ctx.strokeStyle = c2 ?? '#7f4f24'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(hx - 6, hy - 2); ctx.lineTo(hx + 12, hy - 22); ctx.stroke();
      rr(ctx, hx + 9, hy - 27, 6, 6, 1.5); fillStroke(ctx, c2 ?? '#7f4f24');
      ctx.beginPath(); ctx.arc(hx - 10, hy + 4, 7, 0, 7); fillStroke(ctx, c);
      ctx.beginPath(); ctx.arc(hx - 5, hy - 2, 5, 0, 7); fillStroke(ctx, c);
      ctx.fillStyle = '#3a2f3f'; ctx.beginPath(); ctx.arc(hx - 7.5, hy + 1, 2, 0, 7); ctx.fill();
      break;
    case 'chainsaw':
      rr(ctx, hx - 5, hy - 5, 13, 10, 3); fillStroke(ctx, c);
      ctx.strokeStyle = '#3a2f3f'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(hx - 4, hy - 5); ctx.quadraticCurveTo(hx + 1, hy - 11, hx + 6, hy - 5); ctx.stroke();
      rr(ctx, hx + 7, hy - 2.5, 18, 6, 3); fillStroke(ctx, c2 ?? '#6c757d');
      ctx.fillStyle = '#3a2f3f';
      for (let x = hx + 9; x < hx + 24; x += 3) { ctx.beginPath(); ctx.moveTo(x, hy - 2.5); ctx.lineTo(x + 1.5, hy - 4.5); ctx.lineTo(x + 3, hy - 2.5); ctx.fill(); }
      break;
  }
}

/** Đồ ngậm ở miệng (32, 43) — chỉ vẽ khi nhìn từ trước. */
function drawMouthItem(ctx: CanvasRenderingContext2D, st: string, c: string, c2?: string) {
  switch (st) {
    case 'lollipop':
      ctx.strokeStyle = '#f8f9fa'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(33, 44); ctx.lineTo(41, 49); ctx.stroke();
      ctx.beginPath(); ctx.arc(44, 51, 4.6, 0, 7); fillStroke(ctx, c);
      ctx.strokeStyle = c2 ?? '#ffd670'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(44, 51, 2.4, 0, 5); ctx.stroke();
      break;
    case 'partyhorn':
      ctx.beginPath(); ctx.moveTo(32, 43); ctx.lineTo(46, 41); ctx.lineTo(46, 46.5); ctx.lineTo(32, 45); ctx.closePath(); fillStroke(ctx, c);
      ctx.fillStyle = c2 ?? '#3a86ff'; ctx.fillRect(36, 42.4, 2, 2.9); ctx.fillRect(41, 41.8, 2, 4);
      ctx.beginPath(); ctx.arc(48, 46, 3.4, -Math.PI / 2, Math.PI * 1.2); ctx.strokeStyle = c; ctx.lineWidth = 2.4; ctx.stroke();
      break;
    case 'whistle':
      rr(ctx, 31, 42, 9, 4, 1.6); fillStroke(ctx, c, 'rgba(60,60,70,0.7)');
      ctx.beginPath(); ctx.arc(41, 45, 3.2, 0, 7); fillStroke(ctx, c, 'rgba(60,60,70,0.7)');
      ctx.strokeStyle = '#e63946'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(43, 47); ctx.quadraticCurveTo(46, 54, 40, 58); ctx.stroke();
      break;
    case 'pacifier':
      ctx.beginPath(); ctx.ellipse(32, 44, 5, 3.6, 0, 0, 7); fillStroke(ctx, c);
      ctx.strokeStyle = c2 ?? '#ff9ec7'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(32, 48.5, 2.6, 0, 7); ctx.stroke();
      break;
    case 'trumpet':
      rr(ctx, 31, 42.4, 16, 3, 1.4); fillStroke(ctx, c, '#b07d10', 1);
      ctx.beginPath(); ctx.moveTo(46, 43.5); ctx.lineTo(54, 38); ctx.lineTo(54, 51); ctx.closePath(); fillStroke(ctx, c, '#b07d10', 1);
      ctx.fillStyle = c2 ?? '#e09f3e';
      for (const x of [36, 39, 42]) { ctx.beginPath(); ctx.arc(x, 41, 1, 0, 7); ctx.fill(); }
      break;
    case 'rose':
      ctx.strokeStyle = c2 ?? '#52b788'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(22, 45); ctx.lineTo(42, 44); ctx.stroke();
      ctx.fillStyle = c2 ?? '#52b788'; ctx.beginPath(); ctx.ellipse(27, 47, 2.6, 1.2, 0.4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(45, 43.5, 4, 0, 7); fillStroke(ctx, c);
      ctx.strokeStyle = 'rgba(80,0,20,0.6)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(45, 43.5, 1.8, 0.5, 5.5); ctx.stroke();
      break;
  }
}

function drawHairFront(ctx: CanvasRenderingContext2D, style: number, c: string, back = false) {
  if (back) {
    // nhìn từ sau: chỉ vẽ phần nhô ra ngoài đầu
    if (style === 6) {
      for (let i = 0; i < 9; i++) { const t = Math.PI * (1.0 + i * 0.125); ctx.beginPath(); ctx.arc(32 + Math.cos(t) * 18, 30 + Math.sin(t) * 16, 5.5, 0, 7); fillStroke(ctx, c); }
      return;
    }
    if (style === 8) { drawBraids(ctx, c); return; }
    if (style === 7) { drawMohawk(ctx, c); return; }
  }
  ctx.beginPath();
  // nền chỏm tóc
  ctx.moveTo(12, 34);
  ctx.bezierCurveTo(11, 12, 53, 12, 52, 34);
  if (style === 3) {
    // mái bằng
    ctx.lineTo(52, 30); ctx.quadraticCurveTo(32, 26, 12, 30);
  } else if (style === 2 || style === 8) {
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
  } else if (style === 6) {
    // xoăn: vòng lọn tóc quanh đỉnh đầu
    for (let i = 0; i < 9; i++) {
      const t = Math.PI * (1.0 + i * 0.125);
      ctx.beginPath(); ctx.arc(32 + Math.cos(t) * 18, 29 + Math.sin(t) * 15, 5.5, 0, 7); fillStroke(ctx, c);
    }
    for (const x of [24, 32, 40]) { ctx.beginPath(); ctx.arc(x, 24, 4.5, 0, 7); fillStroke(ctx, c); }
  } else if (style === 7) {
    drawMohawk(ctx, c);
  } else if (style === 8) {
    drawBraids(ctx, c);
  }
  // bóng tóc
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(32, 32, 16, Math.PI * 1.15, Math.PI * 1.4); ctx.stroke();
}

function drawMohawk(ctx: CanvasRenderingContext2D, c: string) {
  ctx.beginPath();
  ctx.moveTo(25, 18); ctx.lineTo(24, 6); ctx.lineTo(28, 10); ctx.lineTo(30, -1); ctx.lineTo(33, 8); ctx.lineTo(36, 0); ctx.lineTo(38, 10); ctx.lineTo(41, 5); ctx.lineTo(40, 18);
  ctx.closePath();
  fillStroke(ctx, c);
}

function drawBraids(ctx: CanvasRenderingContext2D, c: string) {
  for (const x of [11, 53]) {
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(x, 38 + i * 6, 3.6, 3.8, 0, 0, 7); fillStroke(ctx, c); }
    ctx.fillStyle = '#ff6b9a'; rr(ctx, x - 2.5, 61, 5, 2.6, 1.2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, 66, 2.6, 3.6, 0, 0, 7); fillStroke(ctx, c);
  }
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
    case 'catears':
      ctx.strokeStyle = c; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(32, 32, 19, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
      for (const dir of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(32 + dir * 7, 15); ctx.lineTo(32 + dir * 16, 1); ctx.lineTo(32 + dir * 19, 19); ctx.closePath(); fillStroke(ctx, c);
        ctx.beginPath(); ctx.moveTo(32 + dir * 10, 15); ctx.lineTo(32 + dir * 15.5, 6); ctx.lineTo(32 + dir * 17, 16.5); ctx.closePath();
        ctx.fillStyle = c2 ?? '#ff9ec7'; ctx.fill();
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
  return `av_${a.skin}_${a.hair}_${a.hairColor}_${a.top}_${a.bottom}_${a.hat ?? '-'}_${a.acc ?? '-'}_${a.hand ?? '-'}_${a.mouth ?? '-'}_${a.ride ?? '-'}`;
}
