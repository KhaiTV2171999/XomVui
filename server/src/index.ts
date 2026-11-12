import express from 'express';
import { createServer } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Server } from 'socket.io';
import { DAILY_BONUS } from '../../shared/catalog';
import { addCoins, claimDaily, createSession, createUser, findUser, getProfile, initDb, Profile, userIdFromToken } from './db';
import { online, OnlinePlayer, pushMe, setIo, toast, vnDay } from './game/online';
import { joinZone, leaveZone, registerWorld } from './game/world';
import { registerFarm } from './game/farm';
import { registerShop } from './game/shop';
import { notifyFriendsPresence, pushFriends, registerSocial } from './game/social';
import { registerBauCua, startBauCua } from './game/baucua';
import { onDisconnectTienLen, registerTienLen } from './game/tienlen';

const PORT = Number(process.env.PORT) || 3001;
const app = express();
app.use(express.json());

// CORS: cho phép client ở domain khác (ví dụ Vercel) gọi API.
// CLIENT_ORIGIN="https://xomvui.vercel.app,https://xomvui.vn" — để trống thì cho phép mọi domain.
const ALLOWED = (process.env.CLIENT_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const originAllowed = (origin?: string) => !origin || !ALLOWED.length || ALLOWED.includes(origin);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.get('/api/health', (_req, res) => res.json({ ok: true }));

function hashPass(pw: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPass(pw: string, stored: string) {
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(pw, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function newSession(userId: number) {
  const token = randomBytes(24).toString('hex');
  await createSession(token, userId);
  return token;
}

/** Bọc route async: lỗi bất ngờ trả 500 thay vì làm sập server. */
const route = (fn: (req: express.Request, res: express.Response) => Promise<unknown>) =>
  (req: express.Request, res: express.Response) => {
    fn(req, res).catch((e) => {
      console.error('[api]', e);
      if (!res.headersSent) res.status(500).json({ error: 'Máy chủ gặp lỗi, thử lại sau' });
    });
  };

app.post('/api/register', route(async (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!/^[\p{L}\p{N}_]{3,16}$/u.test(username)) {
    return res.status(400).json({ error: 'Tên 3-16 ký tự, chỉ gồm chữ, số và _' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
  if (await findUser(username)) return res.status(400).json({ error: 'Tên đã có người dùng' });
  try {
    const id = await createUser(username, hashPass(password));
    res.json({ token: await newSession(id) });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return res.status(400).json({ error: 'Tên đã có người dùng' });
    throw e;
  }
}));

app.post('/api/login', route(async (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  const u = await findUser(username);
  if (!u || !checkPass(password, u.pass)) return res.status(400).json({ error: 'Sai tên hoặc mật khẩu' });
  res.json({ token: await newSession(u.id) });
}));

// Phục vụ bản build client (production)
const dist = path.resolve(process.cwd(), '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/(api|socket\.io)).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const server = createServer(app);
const io = new Server(server, { cors: { origin: (o, cb) => cb(null, originAllowed(o)) } });
setIo(io);

// Xác thực + đọc hồ sơ trước khi vào 'connection' để đăng ký handler đồng bộ (không mất sự kiện đầu tiên).
io.use((socket, next) => {
  (async () => {
    const uid = await userIdFromToken(String(socket.handshake.auth?.token ?? ''));
    if (!uid) return next(new Error('unauthorized'));
    socket.data.userId = uid;
    socket.data.profile = await getProfile(uid);
    next();
  })().catch((e) => { console.error('[auth]', e); next(new Error('server_error')); });
});

io.on('connection', (socket) => {
  const uid: number = socket.data.userId;
  const old = online.get(uid);
  if (old) {
    old.socket.emit('kicked', 'Tài khoản đăng nhập ở nơi khác');
    old.socket.disconnect(true);
  }
  const prof: Profile = socket.data.profile;
  const p: OnlinePlayer = {
    userId: uid, name: prof.name, level: prof.level, appearance: prof.appearance,
    socket, zone: null, x: 0, y: 0, lastChat: 0,
  };
  online.set(uid, p);

  registerWorld(socket, p);
  registerFarm(socket, p);
  registerShop(socket, p);
  registerSocial(socket, p);
  registerBauCua(socket, p);
  registerTienLen(socket, p);

  socket.on('disconnect', () => {
    if (online.get(uid)?.socket !== socket) return; // đã bị thay bởi kết nối mới
    leaveZone(p);
    onDisconnectTienLen(uid);
    online.delete(uid);
    notifyFriendsPresence(uid).catch((e) => console.error('[presence]', e));
  });

  (async () => {
    // Quà đăng nhập: claimDaily chỉ trả true lần đầu trong ngày (an toàn khi mở nhiều tab).
    if (await claimDaily(uid, vnDay())) {
      await addCoins(uid, DAILY_BONUS);
      setTimeout(() => toast(uid, `🎁 Quà đăng nhập hằng ngày: +${DAILY_BONUS} xu`, 'success'), 800);
    }
    await pushMe(uid);
    await pushFriends(uid);
    await notifyFriendsPresence(uid);
    if (prof.created) await joinZone(p, 'myfarm', 'login');
  })().catch((e) => console.error('[connect]', e));
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Cổng ${PORT} đang bị chương trình khác dùng (có thể là một server Xóm Vui khác đang chạy).`);
    console.error('   Hãy tắt nó đi rồi chạy lại "npm run dev".');
    process.exit(1);
  }
  throw err;
});

// Khởi tạo database rồi mới mở cổng.
initDb()
  .then(() => {
    startBauCua();
    server.listen(PORT, () => console.log(`🏡 Xóm Vui server chạy tại http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error('❌ Không kết nối được PostgreSQL. Đã chạy "docker compose up -d" chưa?');
    console.error('  ', e.message);
    process.exit(1);
  });
