// Trò "Xây nhà cao tầng" — mô phỏng DÙNG CHUNG cho client (vẽ, phản hồi tức thì) và server (chấm điểm thật).
// Hoàn toàn tất định: cùng seed + cùng thời điểm thả → cùng kết quả, nên server tính lại được mọi lần thả.

export const TW = {
  /** Bề rộng / chiều cao một tầng (đơn vị thế giới) */
  W: 110,
  H: 110, // khối vuông
  LIVES: 3,
  /** Lệch tối đa vẫn đặt được (tỉ lệ bề rộng); lệch hơn thì tầng rơi */
  LAND: 0.65,
  /** Lệch ≤ chừng này thì tính "Hoàn hảo" (khớp thẳng tắp) */
  PERFECT: 7,
  /** Trọng tâm cả toà lệch quá tỉ lệ này × bề rộng thì toà nhà đổ (chỉ từ tầng TOPPLE_MIN trở lên) */
  TOPPLE: 0.55,
  TOPPLE_MIN: 4,
  /** Thời gian tối thiểu từ lúc tầng xuất hiện tới lúc được thả (ms) */
  MIN_DT: 250,
  /** Thời gian một trận solo 2 người (ms) */
  DUEL_MS: 90_000,
  MAX_FLOORS: 400,
};

export interface TowerState {
  seed: number;
  /** Tọa độ x tâm các tầng đã xây (tầng nền ở x = 0 không tính) */
  blocks: number[];
  lives: number;
  score: number;
  combo: number;
  perfects: number;
  over: boolean;
  /** Đồng hồ lắc của toà nhà (ms): cộng dồn thời gian các tầng đã treo — client & server cùng biết */
  t: number;
  /** Lý do kết thúc */
  end?: 'lives' | 'topple' | 'time' | 'max';
}

export interface DropResult {
  kind: 'perfect' | 'land' | 'miss';
  /** x của tầng lúc thả (toạ độ màn hình, đã gồm độ lắc) */
  x: number;
  /** x lưu trong toà nhà (bỏ độ lắc) */
  bx: number;
  /** Độ lắc của ngọn lúc thả */
  sway: number;
  offset: number;
  gained: number;
  /** Toà nhà đổ sau lần thả này */
  topple?: boolean;
}

/** PRNG nhỏ gọn, tất định */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newTower(seed: number): TowerState {
  return { seed, blocks: [], lives: TW.LIVES, score: 0, combo: 0, perfects: 0, over: false, t: 0 };
}

/** Thông số đung đưa của tầng thứ n (0 = tầng đầu tiên thả lên nền). Càng cao càng rộng & nhanh. */
export function swingOf(seed: number, n: number) {
  const r = mulberry32((seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0);
  const amp = Math.min(175, 95 + n * 3.2) * (0.92 + r() * 0.16);
  const period = Math.max(1.05, 2.3 - n * 0.035) * (0.94 + r() * 0.12); // giây cho 1 chu kỳ
  const phase = r() * Math.PI * 2;
  return { amp, period, phase };
}

/** Vị trí x của tầng đang treo ở thời điểm dt (ms) kể từ khi xuất hiện. */
export function hangX(seed: number, n: number, dtMs: number) {
  const s = swingOf(seed, n);
  return s.amp * Math.sin((2 * Math.PI * dtMs) / 1000 / s.period + s.phase);
}

/**
 * Độ lắc của NGỌN toà nhà ở đồng hồ lắc T (ms). Càng cao lắc càng mạnh, trọng tâm càng lệch càng lắc nhiều.
 * Tầng thứ i lắc theo tỉ lệ chiều cao (nền đứng yên, ngọn lắc đủ biên độ).
 */
export function swayAt(st: TowerState, T: number) {
  const n = st.blocks.length;
  if (n < 2) return 0;
  const lean = Math.min(1, Math.abs(centerOfMass(st)) / (TW.W * TW.TOPPLE));
  const amp = Math.min(70, 6 + n * 2.6) * (1 + lean * 0.8);
  const period = Math.max(2.2, 3.4 - n * 0.02); // giây
  // Gió: từ tầng WIND_FROM, đẩy ngọn nghiêng hẳn về một phía theo từng đợt
  return amp * Math.sin((2 * Math.PI * T) / 1000 / period) + windAt(st.seed, T) * windAmp(n);
}

/** Tầng bắt đầu có gió */
export const WIND_FROM = 5;
const GUST_MS = 6000;

/** Sức đẩy tối đa của gió lên ngọn ở độ cao n tầng */
export function windAmp(n: number) {
  return n < WIND_FROM ? 0 : Math.min(48, (n - WIND_FROM + 1) * 2.4);
}

/** Gió ở đồng hồ T: −1 (thổi sang trái) … +1 (sang phải). Đợt ~6 giây, có lúc lặng, chuyển mượt giữa các đợt. */
export function windAt(seed: number, T: number) {
  const gust = (k: number) => {
    const r = mulberry32((seed ^ Math.imul(k + 7, 0x85ebca6b)) >>> 0);
    const calm = r() < 0.3;
    return calm ? 0 : (r() * 2 - 1);
  };
  const k = Math.floor(T / GUST_MS);
  const f = (T % GUST_MS) / GUST_MS;
  const e = f * f * (3 - 2 * f); // smoothstep
  return gust(k) * (1 - e) + gust(k + 1) * e;
}

export const topX = (st: TowerState) => (st.blocks.length ? st.blocks[st.blocks.length - 1] : 0);
export const floors = (st: TowerState) => st.blocks.length;

/** Trọng tâm cả toà (so với nền ở x = 0). */
export function centerOfMass(st: TowerState) {
  if (!st.blocks.length) return 0;
  return st.blocks.reduce((a, b) => a + b, 0) / st.blocks.length;
}

/** Thả tầng hiện tại sau dtMs kể từ khi nó xuất hiện. Sửa trực tiếp st và trả kết quả. */
export function drop(st: TowerState, dtMs: number): DropResult | null {
  if (st.over) return null;
  const dt = Math.max(TW.MIN_DT, Math.min(600_000, Math.round(dtMs)));
  const n = st.blocks.length;
  const x = hangX(st.seed, n, dt);
  const T = st.t + dt;
  const sway = swayAt(st, T); // ngọn đang lắc tới đâu lúc thả
  st.t = T;
  const top = topX(st);
  let bx = x - sway; // vị trí so với toà nhà
  const offset = bx - top;
  const ad = Math.abs(offset);
  if (ad > TW.W * TW.LAND) {
    st.lives -= 1;
    st.combo = 0;
    if (st.lives <= 0) { st.over = true; st.end = 'lives'; }
    return { kind: 'miss', x, bx, sway, offset, gained: 0 };
  }
  let gained: number;
  let kind: DropResult['kind'];
  if (ad <= TW.PERFECT) {
    bx = top; // khớp thẳng tắp
    st.combo += 1;
    st.perfects += 1;
    kind = 'perfect';
    gained = 10 + 5 * Math.min(st.combo, 10);
  } else {
    st.combo = 0;
    kind = 'land';
    gained = 10 + Math.round(8 * (1 - ad / (TW.W * TW.LAND)));
  }
  st.blocks.push(Math.round(bx * 100) / 100);
  st.score += gained;
  const res: DropResult = { kind, x: bx + sway, bx, sway, offset, gained };
  if (st.blocks.length >= TW.TOPPLE_MIN && Math.abs(centerOfMass(st)) > TW.W * TW.TOPPLE) { st.over = true; st.end = 'topple'; res.topple = true; }
  else if (st.blocks.length >= TW.MAX_FLOORS) { st.over = true; st.end = 'max'; }
  return res;
}
