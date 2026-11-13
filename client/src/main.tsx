import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initAudioUnlock, sfx } from './sound';
import { useStore } from './store';
import './styles.css';

// Âm thanh: mở khoá sau lần chạm đầu tiên, tiếng bấm nút cho mọi <button>.
initAudioUnlock();
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) sfx('click');
}, true);

// Xu tăng/giảm, lên cấp, lỗi → âm thanh tương ứng.
let prev = useStore.getState();
useStore.subscribe((s) => {
  if (s.me && prev.me && s.me.id === prev.me.id) {
    if (s.me.level > prev.me.level) sfx('levelup');
    else if (s.me.coins > prev.me.coins) sfx('coin');
    else if (s.me.coins < prev.me.coins) sfx('buy');
  }
  const last = s.toasts[s.toasts.length - 1];
  if (last && last !== prev.toasts[prev.toasts.length - 1] && last.kind === 'error') sfx('error');
  prev = s;
});

// Bàn phím iPhone không thu nhỏ trang mà đẩy trang lên → đo vùng thật sự nhìn thấy
// (visualViewport) để các bảng chat co lại vừa phía trên bàn phím.
// Chiều cao vùng hiển thị của trang (cửa sổ). Web app iPhone dùng thanh trạng thái liền màu
// (không trong suốt) nên chiều cao này khớp đúng màn hình, không hở dải ở đáy.
function appHeight() {
  return window.innerHeight;
}
const syncAppH = () => document.documentElement.style.setProperty('--app-h', `${appHeight()}px`);
syncAppH();
window.addEventListener('resize', syncAppH);
window.addEventListener('orientationchange', () => setTimeout(syncAppH, 300));

const vv = window.visualViewport;
if (vv) {
  let raf = 0, lastH = -1, lastTop = -1;
  const apply = () => {
    raf = 0;
    const h = Math.round(vv.height), top = Math.round(vv.offsetTop);
    if (h === lastH && top === lastTop) return; // không đổi → khỏi tính lại bố cục
    lastH = h; lastTop = top;
    const el = document.documentElement;
    // Bàn phím đang mở (vùng nhìn thấy thấp hơn hẳn cửa sổ) → bỏ phần đệm thanh home
    const kbd = window.innerHeight - h > 120;
    // Không có bàn phím: các bảng phủ màn hình dùng chiều cao màn hình thật (đã bù thanh trạng thái)
    el.style.setProperty('--vvh', `${kbd ? h : appHeight()}px`);
    el.style.setProperty('--vvtop', `${top}px`);
    el.classList.toggle('kbd', kbd);
    // Bàn phím đã đóng mà iOS vẫn để trang lệch lên (hở dải trống ở đáy) → kéo về
    if (!kbd && (window.scrollY !== 0 || top !== 0)) window.scrollTo(0, 0);
  };
  const sync = () => { if (!raf) raf = requestAnimationFrame(apply); };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  apply();
}
// Khi bàn phím đóng, iOS đôi khi để trang bị lệch lên — kéo về lại (thử vài lần vì
// bàn phím đóng có hiệu ứng trượt, vị trí chỉ ổn định sau ~300ms).
const resetScroll = () => {
  const a = document.activeElement;
  if (a && a !== document.body && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};
document.addEventListener('focusout', () => { setTimeout(resetScroll, 50); setTimeout(resetScroll, 350); });
window.addEventListener('orientationchange', () => setTimeout(resetScroll, 400));

createRoot(document.getElementById('root')!).render(<App />);
