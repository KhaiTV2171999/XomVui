/**
 * Địa chỉ server game (API + Socket.IO).
 * - Chạy local / cùng domain: để trống → dùng chính domain đang mở trang.
 * - Deploy tách đôi (client trên Vercel, server trên Railway/Render): đặt biến
 *   môi trường VITE_SERVER_URL=https://ten-server.up.railway.app khi build.
 */
export const SERVER_URL: string = (import.meta.env.VITE_SERVER_URL ?? '').replace(/\/$/, '');
