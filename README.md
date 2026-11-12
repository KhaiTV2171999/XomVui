# 🏡 Xóm Vui

Game mạng xã hội ảo 2D chơi trên trình duyệt: nhân vật chibi, nông trại, chat cộng đồng, khu giải trí với **Bầu Cua Tôm Cá** và **Tiến Lên Miền Nam**.

Toàn bộ hình ảnh (nhân vật, bản đồ, nhà cửa) và âm thanh đều được tạo bằng code, không dùng tài nguyên của game nào khác.

## Chạy trên máy

Yêu cầu: **Node.js 22+** và **Docker** (để chạy PostgreSQL).

```bash
docker compose up -d   # PostgreSQL ở cổng 5434 (user/pass/db: xomvui)
npm run setup          # cài thư viện cho root, server, client
npm run dev            # server :3001 + client :5173
```

Mở http://localhost:5173. Chơi chung trong mạng LAN: mở `http://<IP-máy>:5173` trên máy/điện thoại khác cùng Wi-Fi.

Chuyển dữ liệu cũ từ SQLite (nếu có `server/data/game.db`) sang PostgreSQL:

```bash
npm run migrate:sqlite --prefix server   # GHI ĐÈ dữ liệu đang có trong Postgres
```

## Biến môi trường

| Biến | Nơi dùng | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | server | Chuỗi kết nối Postgres. Mặc định `postgres://xomvui:xomvui@localhost:5434/xomvui` |
| `DATABASE_SSL` | server | Đặt `1` khi dùng Postgres cần SSL (Neon, Supabase, Render…) |
| `PORT` | server | Cổng server, mặc định `3001` |
| `CLIENT_ORIGIN` | server | Domain client được phép gọi API, phân tách bằng dấu phẩy. Để trống = cho phép mọi domain |
| `VITE_SERVER_URL` | client (lúc build) | Địa chỉ server khi client và server ở 2 domain khác nhau, ví dụ `https://xomvui-api.onrender.com` |

Xem thêm `server/.env.example` và `client/.env.example`.

## Deploy

Server cần **chạy liên tục** (Socket.IO, vòng bầu cua 20 giây, lượt Tiến lên), nên không chạy được trên nền tảng serverless như Vercel. Cách tách đôi:

1. **Database:** PostgreSQL bất kỳ (Neon, Supabase, Render Postgres…). Lấy chuỗi kết nối.
2. **Server** lên Render / Railway / Fly.io / VPS:
   - Lệnh cài: `npm install --prefix server` · Lệnh chạy: `npm start --prefix server`
   - Biến: `DATABASE_URL`, `DATABASE_SSL=1`, `CLIENT_ORIGIN=https://<tên>.vercel.app`
3. **Client** lên Vercel: Root Directory `client`, Framework `Vite`, biến `VITE_SERVER_URL=https://<server>`.

Bảng sẽ tự được tạo ở lần chạy server đầu tiên.

## Tính năng

| Mục | Nội dung |
|---|---|
| Tài khoản | Đăng ký / đăng nhập, mật khẩu băm scrypt, quà đăng nhập 300 xu/ngày |
| Nhân vật | 5 màu da, 6 kiểu tóc, 9 màu tóc, 33 món đồ, hoạt ảnh bước đi nhìn trước/sau |
| Thế giới | Vào game là ở Nông trại riêng (rào, vườn, ao, chuồng, nhà). Bản đồ minh hoạ + xe buýt đi Khu vui chơi (dãy phố, đu quay) và Công viên. Tìm đường tránh vật cản |
| Nông trại | 8 loại cây, đồng hồ đếm ngược, tưới nước để lớn nhanh, mở rộng tới 26 ô, nuôi gà/bò/cừu, chó giữ nhà |
| Bạn bè | Kết bạn, nhắn tin riêng, thăm vườn, tưới giúp (+5 xu), hái trộm (chủ giữ ít nhất một nửa), bị chó đuổi (phạt 30 xu) |
| Khu giải trí | Bầu cua (bàn chung realtime) và Tiến lên miền Nam (thêm bot, đủ luật chặt heo, cóng) |
| Âm thanh | Nhạc nền và hiệu ứng tổng hợp bằng WebAudio, bật/tắt được |

## Kiến trúc

```
shared/    Dữ liệu dùng chung: vật phẩm, bản đồ, luật Tiến lên
server/    Node.js + Express + Socket.IO + PostgreSQL (pg)
  src/db.ts       truy vấn + transaction (AsyncLocalStorage)
  src/game/       world, farm, shop, social, baucua, tienlen
  scripts/        migrate-sqlite.ts
client/    Vite + React (giao diện) + Phaser 3 (thế giới game)
  src/avatar/     vẽ nhân vật chibi bằng Canvas
  src/game/       Phaser scene, texture, tìm đường A*
  src/ui/         các panel React
```

Server là nơi duy nhất quyết định xu, kết quả xúc xắc, chia bài và thời gian cây lớn. Xu được cộng/trừ bằng câu lệnh SQL nguyên tử (không thể âm), nông trại được khoá dòng khi sửa, nên không thể hack xu từ trình duyệt hay bấm nhanh để nhân đôi.

## Lưu ý pháp lý

Xu trong game là **tiền ảo**, chỉ kiếm được bằng cách chơi. Không nạp tiền thật, không đổi ra tiền thật. Nếu sau này muốn có nạp tiền, nên tách hẳn khu bầu cua/bài khỏi loại xu nạp được, và tìm hiểu quy định về giấy phép trò chơi điện tử (G1) trước khi phát hành.
