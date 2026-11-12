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

createRoot(document.getElementById('root')!).render(<App />);
