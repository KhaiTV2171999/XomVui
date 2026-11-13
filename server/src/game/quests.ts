import type { Socket } from 'socket.io';
import { ITEMS } from '../../../shared/catalog';
import { CHEST_REWARD, DAILY_QUESTS, QuestKind, QuestReward, QuestState } from '../../../shared/quests';
import { addCoins, addItem, addXp, bumpQuest, GameError, getInventory, getQuestDay, markChest, markQuestClaimed, pruneQuests, tx } from '../db';
import { handle, online, OnlinePlayer, pushMe, toast, vnDay } from './online';

const DEF = new Map(DAILY_QUESTS.map((q) => [q.id, q]));

async function stateOf(uid: number): Promise<QuestState> {
  const day = vnDay();
  const r = await getQuestDay(uid, day);
  return { day, progress: r.progress, claimed: r.claimed as QuestKind[], chest: r.chest };
}

async function pushQuests(uid: number) {
  const s = online.get(uid)?.socket;
  if (s) s.emit('quest:state', await stateOf(uid));
}

// Chống đếm trùng: ván bầu cua / nông trại đã ghé (trong ngày)
const seen = new Set<string>();
let seenDay = vnDay();

/**
 * Cộng tiến độ nhiệm vụ (gọi từ các module game). Không bao giờ ném lỗi ra ngoài.
 * key: nếu có, mỗi key chỉ được đếm một lần mỗi ngày (vd. cùng một ván, cùng một nông trại).
 */
export function questBump(uid: number, kind: QuestKind, n = 1, key?: string) {
  const q = DEF.get(kind);
  if (!q) return;
  const day = vnDay();
  if (day !== seenDay) { seen.clear(); seenDay = day; }
  if (key) {
    const k = `${uid}:${kind}:${key}`;
    if (seen.has(k)) return;
    seen.add(k);
  }
  (async () => {
    const before = (await getQuestDay(uid, day)).progress[kind] ?? 0;
    if (before >= q.goal) return;
    const v = await bumpQuest(uid, day, kind, n, q.goal);
    if (v >= q.goal) toast(uid, `✅ Xong nhiệm vụ "${q.title}" — mở 📜 Nhiệm vụ để nhận quà!`, 'success');
    await pushQuests(uid);
  })().catch((e) => console.error('[quest]', e));
}

async function giveReward(uid: number, r: QuestReward) {
  if (r.coins) await addCoins(uid, r.coins);
  for (const [id, n] of Object.entries(r.items ?? {})) await addItem(uid, id, n);
  if (r.xp) {
    const lv = await addXp(uid, r.xp);
    if (lv.leveledUp) toast(uid, `🎉 Lên cấp ${lv.level}!`, 'success');
  }
}

// Dọn tiến độ cũ mỗi 6 giờ
setInterval(() => {
  const d = new Date(Date.now() + 7 * 3600_000 - 7 * 86400_000).toISOString().slice(0, 10);
  pruneQuests(d).catch((e) => console.error('[quest prune]', e));
}, 6 * 3600_000);

export function registerQuests(socket: Socket, p: OnlinePlayer) {
  const uid = p.userId;

  handle(socket, 'quest:list', async () => ({ state: await stateOf(uid) }));

  handle<{ id: string }>(socket, 'quest:claim', async ({ id }) => {
    const q = DEF.get(id as QuestKind);
    if (!q) throw new GameError('Nhiệm vụ không tồn tại');
    const day = vnDay();
    await tx(async () => {
      const r = await getQuestDay(uid, day);
      if ((r.progress[q.id] ?? 0) < q.goal) throw new GameError('Chưa hoàn thành nhiệm vụ này');
      if (!(await markQuestClaimed(uid, day, q.id))) throw new GameError('Bạn đã nhận quà rồi');
      await giveReward(uid, q.reward);
    });
    await Promise.all([pushMe(uid), pushQuests(uid)]);
    return { reward: q.reward };
  });

  // Rương quà cuối ngày: nhận đủ mọi nhiệm vụ → xu + một món đồ bất ngờ chưa có
  handle(socket, 'quest:chest', async () => {
    const day = vnDay();
    const res = await tx(async () => {
      const r = await getQuestDay(uid, day);
      if (DAILY_QUESTS.some((q) => !r.claimed.includes(q.id))) throw new GameError('Nhận quà đủ các nhiệm vụ để mở rương nhé');
      if (!(await markChest(uid, day))) throw new GameError('Hôm nay bạn đã mở rương rồi');
      await giveReward(uid, CHEST_REWARD);
      const inv = await getInventory(uid);
      const pool = Object.values(ITEMS).filter((i) => i.kind === 'clothing' && (i.price ?? 0) >= 100 && (i.price ?? 0) <= 1500 && !(inv[i.id] > 0));
      const gift = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
      if (gift) await addItem(uid, gift.id, 1);
      return { item: gift?.id ?? null };
    });
    await Promise.all([pushMe(uid), pushQuests(uid)]);
    return { ...CHEST_REWARD, item: res.item };
  });
}
