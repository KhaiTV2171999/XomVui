import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Ổ exFAT không báo thay đổi file ổn định → dùng polling để không bỏ sót file vừa sửa.
    watch: { usePolling: true, interval: 300 },
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
