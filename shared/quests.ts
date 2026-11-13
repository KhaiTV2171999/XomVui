// Nhiệm vụ hằng ngày (dùng chung client + server). Làm mới mỗi ngày theo giờ Việt Nam.

export type QuestKind = 'harvest' | 'plant' | 'water' | 'gift' | 'play' | 'chat' | 'visit';

export interface QuestReward {
  coins?: number;
  xp?: number;
  /** item id → số lượng */
  items?: Record<string, number>;
}

export interface QuestDef {
  id: QuestKind;
  icon: string;
  title: string;
  goal: number;
  reward: QuestReward;
  /** Gợi ý làm ở đâu */
  hint: string;
}

export const DAILY_QUESTS: QuestDef[] = [
  { id: 'harvest', icon: '🌾', title: 'Thu hoạch 3 ô đất', goal: 3, reward: { coins: 80, xp: 10 }, hint: 'Ra nông trại, chạm vào cây đã chín' },
  { id: 'plant', icon: '🌱', title: 'Gieo 5 hạt giống', goal: 5, reward: { items: { 'seed:ngo': 3 }, xp: 5 }, hint: 'Chọn hạt ở thanh công cụ rồi chạm ô đất trống' },
  { id: 'water', icon: '💧', title: 'Tưới cây giúp hàng xóm 3 lần', goal: 3, reward: { coins: 60, xp: 10 }, hint: 'Ghé nông trại người khác và tưới cây đang lớn' },
  { id: 'visit', icon: '🏡', title: 'Ghé thăm 2 nông trại hàng xóm', goal: 2, reward: { coins: 50 }, hint: 'Mở Cư dân → chọn người → Thăm nông trại' },
  { id: 'gift', icon: '🎁', title: 'Tặng quà cho 1 cư dân', goal: 1, reward: { coins: 100, items: { feed: 5 } }, hint: 'Kết bạn rồi bấm 🎁 Tặng quà trong hồ sơ của họ' },
  { id: 'play', icon: '🎪', title: 'Chơi 2 ván ở Khu giải trí', goal: 2, reward: { coins: 100, xp: 10 }, hint: 'Bầu cua, Tiến lên, Xây nhà hay Ma Sói đều được' },
  { id: 'chat', icon: '💬', title: 'Chào hỏi 3 câu ở chat cộng đồng', goal: 3, reward: { coins: 30 }, hint: 'Bấm Trò chuyện và gửi lời chào mọi người' },
];

/** Rương quà khi nhận đủ thưởng mọi nhiệm vụ trong ngày: xu + 1 món đồ bất ngờ chưa có. */
export const CHEST_REWARD = { coins: 300, xp: 30 };

export interface QuestState {
  day: string;
  progress: Partial<Record<QuestKind, number>>;
  claimed: QuestKind[];
  chest: boolean;
}
