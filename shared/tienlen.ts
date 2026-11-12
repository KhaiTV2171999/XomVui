// Luật Tiến lên miền Nam.
// Lá bài: số 0..51. rank = c >> 2 (0 = '3' ... 12 = '2'), suit = c & 3 (♠ < ♣ < ♦ < ♥).

export const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
export const SUITS = ['♠', '♣', '♦', '♥'];
export const rankOf = (c: number) => c >> 2;
export const suitOf = (c: number) => c & 3;
export const cardLabel = (c: number) => RANKS[rankOf(c)] + SUITS[suitOf(c)];

export type ComboType = 'single' | 'pair' | 'triple' | 'quad' | 'straight' | 'pairseq';
export interface Combo { type: ComboType; len: number; high: number; cards: number[] }

export const COMBO_NAMES: Record<ComboType, string> = {
  single: 'Rác', pair: 'Đôi', triple: 'Sám cô', quad: 'Tứ quý', straight: 'Sảnh', pairseq: 'Đôi thông',
};

export function analyze(cards: number[]): Combo | null {
  const cs = [...cards].sort((a, b) => a - b);
  const n = cs.length;
  if (!n || new Set(cs).size !== n) return null;
  const ranks = cs.map(rankOf);
  const high = cs[n - 1];
  if (n === 1) return { type: 'single', len: 1, high, cards: cs };
  if (ranks.every((r) => r === ranks[0])) {
    if (n === 2) return { type: 'pair', len: 1, high, cards: cs };
    if (n === 3) return { type: 'triple', len: 1, high, cards: cs };
    if (n === 4) return { type: 'quad', len: 1, high, cards: cs };
    return null;
  }
  if (n >= 3 && ranks[n - 1] !== 12) {
    let ok = true;
    for (let i = 1; i < n; i++) if (ranks[i] !== ranks[i - 1] + 1) ok = false;
    if (ok) return { type: 'straight', len: n, high, cards: cs };
  }
  if (n >= 6 && n % 2 === 0 && ranks[n - 1] !== 12) {
    let ok = true;
    for (let i = 0; i < n; i += 2) {
      if (ranks[i] !== ranks[i + 1]) ok = false;
      if (i > 0 && ranks[i] !== ranks[i - 2] + 1) ok = false;
    }
    if (ok) return { type: 'pairseq', len: n / 2, high, cards: cs };
  }
  return null;
}

export function beats(a: Combo, b: Combo | null): boolean {
  if (!b) return true;
  if (a.type === b.type && a.len === b.len) return a.high > b.high;
  const bIsTwo = rankOf(b.high) === 12;
  if (b.type === 'single' && bIsTwo) return a.type === 'quad' || (a.type === 'pairseq' && a.len >= 3);
  if (b.type === 'pair' && bIsTwo) return a.type === 'quad' || (a.type === 'pairseq' && a.len >= 4);
  if (b.type === 'pairseq' && b.len === 3) return a.type === 'quad' || (a.type === 'pairseq' && a.len >= 4);
  if (b.type === 'quad') return a.type === 'pairseq' && a.len >= 4;
  return false;
}

function combos<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, cur: T[]) => {
    if (cur.length === k) { out.push([...cur]); return; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  return out;
}

/** Liệt kê các bộ bài có thể đánh từ một tay bài (dùng cho bot và gợi ý). */
export function candidates(hand: number[]): Combo[] {
  const h = [...hand].sort((a, b) => a - b);
  const byRank: number[][] = Array.from({ length: 13 }, () => []);
  h.forEach((c) => byRank[rankOf(c)].push(c));
  const out: Combo[] = [];
  const push = (cs: number[]) => { const c = analyze(cs); if (c) out.push(c); };
  h.forEach((c) => push([c]));
  for (const g of byRank) {
    if (g.length >= 2) combos(g, 2).forEach(push);
    if (g.length >= 3) combos(g, 3).forEach(push);
    if (g.length === 4) push(g);
  }
  // Sảnh
  for (let s = 0; s <= 9; s++) {
    for (let len = 3; s + len - 1 <= 11; len++) {
      let ok = true;
      for (let r = s; r < s + len; r++) if (!byRank[r].length) ok = false;
      if (!ok) break;
      const base = [];
      for (let r = s; r < s + len - 1; r++) base.push(byRank[r][0]);
      for (const top of byRank[s + len - 1]) push([...base, top]);
    }
  }
  // Đôi thông
  for (let s = 0; s <= 9; s++) {
    for (let len = 3; s + len - 1 <= 11; len++) {
      let ok = true;
      for (let r = s; r < s + len; r++) if (byRank[r].length < 2) ok = false;
      if (!ok) break;
      const cs: number[] = [];
      for (let r = s; r < s + len - 1; r++) cs.push(byRank[r][0], byRank[r][1]);
      const top = byRank[s + len - 1];
      cs.push(top[0], top[top.length - 1]);
      push(cs);
    }
  }
  return out;
}

const LEAD_PRIORITY: Record<ComboType, number> = { straight: 5, pairseq: 1, triple: 4, pair: 3, single: 2, quad: 0 };

/** AI đơn giản cho bot. */
export function botChoose(hand: number[], current: Combo | null): Combo | null {
  const cands = candidates(hand);
  if (!current) {
    const low = Math.min(...hand);
    const withLow = cands.filter((c) => c.cards.includes(low) && c.type !== 'quad' && c.type !== 'pairseq');
    withLow.sort((a, b) => {
      const p = LEAD_PRIORITY[b.type] - LEAD_PRIORITY[a.type];
      if (p !== 0) return p;
      return b.cards.length - a.cards.length;
    });
    // Tránh dùng sảnh dài quá khi tay còn nhiều bài lẻ cao: đơn giản lấy cái đầu.
    return withLow[0] ?? analyze([low]);
  }
  const valid = cands.filter((c) => beats(c, current));
  if (!valid.length) return null;
  const same = valid.filter((c) => c.type === current.type && c.len === current.len).sort((a, b) => a.high - b.high);
  if (same.length) {
    const pick = same[0];
    // Giữ heo (2) nếu bài trên bàn còn nhỏ và tay còn nhiều bài
    if (rankOf(pick.high) === 12 && rankOf(current.high) < 9 && hand.length > 6 && Math.random() < 0.6) return null;
    return pick;
  }
  return valid.sort((a, b) => a.cards.length - b.cards.length)[0];
}

export function sortHand(hand: number[]) {
  return [...hand].sort((a, b) => a - b);
}
