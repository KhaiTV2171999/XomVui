/** Thiết bị cảm ứng màn nhỏ (điện thoại / tablet nhỏ): ưu tiên tiết kiệm pin (giới hạn khung hình khi đứng yên). */
export const IS_MOBILE = typeof window !== 'undefined'
  && window.matchMedia('(pointer: coarse)').matches
  && Math.min(window.screen.width, window.screen.height) <= 820;

/** Mật độ điểm ảnh dùng để vẽ canvas (giới hạn 2 để không quá nặng) — giữ nét trên mọi máy. */
export const DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
