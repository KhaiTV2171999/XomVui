// Lưới va chạm + tìm đường A* để nhân vật đi vòng qua nhà, rào, ao...

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;

  constructor(readonly w: number, readonly h: number, readonly cell = 16) {
    this.cols = Math.ceil(w / cell);
    this.rows = Math.ceil(h / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  private idx(c: number, r: number) { return r * this.cols + c; }
  private inside(c: number, r: number) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }
  isBlocked(c: number, r: number) { return !this.inside(c, r) || this.blocked[this.idx(c, r)] === 1; }
  private cellOf(x: number, y: number): [number, number] {
    return [Math.floor(x / this.cell), Math.floor(y / this.cell)];
  }
  blockedAt(x: number, y: number) { const [c, r] = this.cellOf(x, y); return this.isBlocked(c, r); }

  /** Chặn hình chữ nhật (toạ độ thế giới). */
  rect(x: number, y: number, w: number, h: number, value = 1) {
    const c0 = Math.max(0, Math.floor(x / this.cell));
    const r0 = Math.max(0, Math.floor(y / this.cell));
    const c1 = Math.min(this.cols - 1, Math.floor((x + w) / this.cell));
    const r1 = Math.min(this.rows - 1, Math.floor((y + h) / this.cell));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.blocked[this.idx(c, r)] = value;
    return this;
  }
  /** Mở lại một vùng (ví dụ lối vào cổng). */
  open(x: number, y: number, w: number, h: number) { return this.rect(x, y, w, h, 0); }

  /** Chặn hình elip (ao, đài phun nước). */
  ellipse(cx: number, cy: number, rx: number, ry: number) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = (c + 0.5) * this.cell, y = (r + 0.5) * this.cell;
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.blocked[this.idx(c, r)] = 1;
      }
    }
    return this;
  }

  /** Đường viền chữ nhật dày `t` (hàng rào). */
  frame(x: number, y: number, w: number, h: number, t = 18) {
    return this.rect(x - t / 2, y - t / 2, w + t, t).rect(x - t / 2, y + h - t / 2, w + t, t)
      .rect(x - t / 2, y - t / 2, t, h + t).rect(x + w - t / 2, y - t / 2, t, h + t);
  }

  private nearestFree(c: number, r: number): [number, number] | null {
    if (!this.isBlocked(c, r)) return [c, r];
    for (let rad = 1; rad < 40; rad++) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          if (this.isBlocked(c + dc, r + dr)) continue;
          const d = dc * dc + dr * dr;
          if (d < bestD) { bestD = d; best = [c + dc, r + dr]; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Có đi thẳng được từ A tới B không (lấy mẫu dọc đoạn thẳng). */
  lineFree(x0: number, y0: number, x1: number, y1: number) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(dist / (this.cell / 3));
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(1, steps);
      if (this.blockedAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  /**
   * Tìm đường từ (sx, sy) tới (tx, ty). Trả về danh sách điểm (không gồm điểm xuất phát).
   * Nếu đích bị chặn, đi tới ô trống gần nhất.
   */
  findPath(sx: number, sy: number, tx: number, ty: number): [number, number][] {
    let [sc, sr] = this.cellOf(sx, sy);
    const startFree = this.nearestFree(sc, sr);
    if (!startFree) return [[tx, ty]];
    [sc, sr] = startFree;
    const [tc0, tr0] = this.cellOf(tx, ty);
    const goal = this.nearestFree(tc0, tr0);
    if (!goal) return [];
    const [gc, gr] = goal;
    const goalX = goal[0] === tc0 && goal[1] === tr0 ? tx : (gc + 0.5) * this.cell;
    const goalY = goal[0] === tc0 && goal[1] === tr0 ? ty : (gr + 0.5) * this.cell;
    if (this.lineFree(sx, sy, goalX, goalY) && !this.blockedAt(sx, sy)) return [[goalX, goalY]];

    const n = this.cols * this.rows;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap: [number, number][] = []; // [f, idx]
    const push = (f: number, i: number) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const hcost = (c: number, r: number) => {
      const dx = Math.abs(c - gc), dy = Math.abs(r - gr);
      return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    const start = this.idx(sc, sr);
    const goalIdx = this.idx(gc, gr);
    g[start] = 0;
    push(hcost(sc, sr), start);
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let found = false;
    while (heap.length) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      if (cur === goalIdx) { found = true; break; }
      closed[cur] = 1;
      const c = cur % this.cols, r = Math.floor(cur / this.cols);
      for (const [dc, dr, cost] of dirs) {
        const nc = c + dc, nr = r + dr;
        if (this.isBlocked(nc, nr)) continue;
        // không cắt góc chéo qua vật cản
        if (dc && dr && (this.isBlocked(c + dc, r) || this.isBlocked(c, r + dr))) continue;
        const ni = this.idx(nc, nr);
        const ng = g[cur] + cost;
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          push(ng + hcost(nc, nr), ni);
        }
      }
    }
    if (!found) return [];

    const cells: [number, number][] = [];
    for (let i = goalIdx; i !== -1; i = came[i]) {
      cells.push([((i % this.cols) + 0.5) * this.cell, (Math.floor(i / this.cols) + 0.5) * this.cell]);
    }
    cells.reverse();
    cells[cells.length - 1] = [goalX, goalY];

    // Làm mượt: bỏ các điểm trung gian nếu nhìn thẳng thấy điểm sau.
    const out: [number, number][] = [];
    let ax = sx, ay = sy;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.lineFree(ax, ay, cells[j][0], cells[j][1])) j--;
      out.push(cells[j]);
      [ax, ay] = cells[j];
      i = j + 1;
    }
    return out;
  }
}
