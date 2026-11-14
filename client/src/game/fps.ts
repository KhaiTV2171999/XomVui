/** Cho phép cảnh game "xin" chạy 60 khung hình/giây tạm thời (vd. nhân vật mình đang đi). */
let booster: ((ms?: number) => void) | null = null;
export function setFpsBooster(fn: ((ms?: number) => void) | null) { booster = fn; }
export function boostFps(ms?: number) { booster?.(ms); }
