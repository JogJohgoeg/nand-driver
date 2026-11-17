// 颜色运行时读 tokens
const TK = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const TKA = (n, a) => { const h = TK(n); return 'rgba(' + [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',') + ',' + a + ')'; };
// 版图查看器：按缩放取对应级别的瓦片，每张瓦片经 verify.js 核过才画；拖动平移、滚轮 / 双指缩放、按钮。
// 坐标：原生像素（pic 数据里的 shapes 用同一套，左上原点）。z = levels-1 是原生分辨率，每降一级缩一半。
import { checkedURL } from './verify.js';

export class Viewer {
  constructor(canvas, { tid, width, height, levels, tile = 512, rows, onTile, onView }) {
    Object.assign(this, { canvas, tid, W: width, H: height, L: levels, T: tile, rows, onTile, onView });
    this.ctx = canvas.getContext('2d');
    this.imgs = new Map();          // key → Image | 'bad' | 'wait'
    this.have = [];                 // 已经核过、画得出来的瓦片 { z, x, y, im }：要的那一级还没到时，先拿它们按现在的缩放画
    this.hl = []; this.hlColor = TK('--warn');
    this.ptrs = new Map();
    this.resize(); this.fit();
    new ResizeObserver(() => { this.resize(); this.draw(); }).observe(canvas);
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); this.ptrs.set(e.pointerId, [e.offsetX, e.offsetY]); });
    canvas.addEventListener('pointerup', (e) => this.ptrs.delete(e.pointerId));
    canvas.addEventListener('pointercancel', (e) => this.ptrs.delete(e.pointerId));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  }
  resize() {
    const r = this.canvas.getBoundingClientRect(), d = devicePixelRatio || 1;
    this.cw = r.width; this.ch = r.height;
    this.canvas.width = Math.round(r.width * d); this.canvas.height = Math.round(r.height * d);
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
    if (this.cw > 0 && this.ch > 0) {          // 藏在别的 tab 里时量不到尺寸：等露出来再适配 / 飞过去
      if (!this.fitted) this.fit();
      if (this.pending) { const p = this.pending; this.pending = null; this.fly(p); }
    }
  }
  fit() { if (!this.cw || !this.ch) return; this.fitted = true; this.s = Math.min(this.cw / this.W, this.ch / this.H); this.ox = (this.cw - this.W * this.s) / 2; this.oy = (this.ch - this.H * this.s) / 2; this.draw(); }
  minS() { return Math.min(this.cw / this.W, this.ch / this.H) * 0.5; }
  atFit() { const f = Math.min(this.cw / this.W, this.ch / this.H); return f > 0 && Math.abs(this.s - f) < f * 1e-3 && Math.abs(this.ox - (this.cw - this.W * f) / 2) < 1 && Math.abs(this.oy - (this.ch - this.H * f) / 2) < 1; }
  rel() { const f = Math.min(this.cw / this.W, this.ch / this.H); return f > 0 ? this.s / f : 1; }      // 现在是「全图」的几倍
  zoomAt(x, y, f) {
    const s = Math.min(Math.max(this.s * f, this.minS()), 4);
    this.ox = x - (x - this.ox) * (s / this.s); this.oy = y - (y - this.oy) * (s / this.s); this.s = s; this.draw();
  }
  zoom(f) { this.zoomAt(this.cw / 2, this.ch / 2, f); }
  move(e) {
    const p = this.ptrs.get(e.pointerId); if (!p) return;
    if (this.ptrs.size === 1) { this.ox += e.offsetX - p[0]; this.oy += e.offsetY - p[1]; }
    else if (this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()], o = a === p ? b : a;
      const d0 = Math.hypot(p[0] - o[0], p[1] - o[1]), d1 = Math.hypot(e.offsetX - o[0], e.offsetY - o[1]);
      if (d0 > 0) this.zoomAt((o[0] + e.offsetX) / 2, (o[1] + e.offsetY) / 2, d1 / d0);
    }
    this.ptrs.set(e.pointerId, [e.offsetX, e.offsetY]); this.draw();
  }
  level() {                                  // 屏幕 1 像素对应的级别：取够清楚的最低一级
    let z = this.L - 1;
    while (z > 0 && Math.pow(2, z - 1 - (this.L - 1)) >= this.s * (devicePixelRatio || 1)) z--;
    return z;
  }
  path(z, x, y) { return `tiles/${this.tid}/${z}/${x}_${y}.webp`; }
  want(z, x, y) {
    const k = this.path(z, x, y); if (this.imgs.has(k)) return this.imgs.get(k);
    const row = this.rows.get(k); if (!row) { this.imgs.set(k, 'none'); return 'none'; }
    this.imgs.set(k, 'wait');
    checkedURL(k, row).then((u) => { const im = new Image(); im.onload = () => { this.imgs.set(k, im); this.have.push({ z, x, y, im }); this.onTile?.(true, k); this.draw(); }; im.src = u; },
      () => { this.imgs.set(k, 'bad'); this.onTile?.(false, k); this.draw(); });
    return 'wait';
  }
  retryBad() { for (const [k, v] of this.imgs) if (v === 'bad') this.imgs.delete(k); this.draw(); }
  draw() {
    this.onView?.(this.rel(), this.atFit());      // 倍数、是不是全图，当场报出去，不等下一帧
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); });
  }
  paint() {
    const { ctx } = this, z = this.level(), f = Math.pow(2, this.L - 1 - z), span = this.T * f;   // 一张瓦片覆盖的原生像素
    ctx.fillStyle = TK('--bg-deeper'); ctx.fillRect(0, 0, this.cw, this.ch);
    // 底格：芯片范围内画一层细格子（格子跟着芯片走，疏密随缩放自己调到 48–96 像素一格）。瓦片还没到的地方露出来的就是它，所以一张瓦片都没到时缩放、拖动也当场看得见
    {
      const L0 = Math.max(this.ox, 0), T0 = Math.max(this.oy, 0), R0 = Math.min(this.ox + this.W * this.s, this.cw), B0 = Math.min(this.oy + this.H * this.s, this.ch);
      let step = Math.max(this.W, this.H); while (step * this.s >= 96) step /= 2;
      ctx.lineWidth = 1; ctx.strokeStyle = TK('--line'); ctx.beginPath();
      for (let x = Math.ceil((L0 - this.ox) / this.s / step) * step; this.ox + x * this.s <= R0; x += step) { const X = Math.round(this.ox + x * this.s) + .5; ctx.moveTo(X, T0); ctx.lineTo(X, B0); }
      for (let y = Math.ceil((T0 - this.oy) / this.s / step) * step; this.oy + y * this.s <= B0; y += step) { const Y = Math.round(this.oy + y * this.s) + .5; ctx.moveTo(L0, Y); ctx.lineTo(R0, Y); }
      if (R0 > L0 && B0 > T0) ctx.stroke();
    }
    // 垫底：别的级别里已经核过的瓦片，从粗到细按现在的缩放画上（要的这一级到了再盖上去）
    for (const t of this.have.slice().sort((a, b) => a.z - b.z)) {
      if (t.z === z) continue;
      const ts = this.T * Math.pow(2, this.L - 1 - t.z), tw = Math.min(ts, this.W - t.x * ts), th = Math.min(ts, this.H - t.y * ts);
      const ax = this.ox + t.x * ts * this.s, ay = this.oy + t.y * ts * this.s;
      if (ax < this.cw && ay < this.ch && ax + tw * this.s > 0 && ay + th * this.s > 0) ctx.drawImage(t.im, ax, ay, tw * this.s, th * this.s);
    }
    const nx = Math.ceil(this.W / span), ny = Math.ceil(this.H / span);
    const x0 = Math.max(0, Math.floor(-this.ox / this.s / span)), x1 = Math.min(nx - 1, Math.floor((this.cw - this.ox) / this.s / span));
    const y0 = Math.max(0, Math.floor(-this.oy / this.s / span)), y1 = Math.min(ny - 1, Math.floor((this.ch - this.oy) / this.s / span));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const w = Math.min(span, this.W - x * span), h = Math.min(span, this.H - y * span);
      const sx = this.ox + x * span * this.s, sy = this.oy + y * span * this.s, sw = w * this.s, sh = h * this.s;
      const im = this.want(z, x, y);
      if (im instanceof Image) ctx.drawImage(im, sx, sy, sw, sh);
      else if (im === 'bad') {
        ctx.fillStyle = TK('--panel'); ctx.fillRect(sx, sy, sw, sh);
        ctx.fillStyle = TK('--bad'); ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('这块图没核对上', sx + sw / 2, sy + sh / 2);
      }
    }
    if (this.hl.length) {                    // 其余压暗，选中的单元留亮并描边
      const rs = this.hl.map(([x, y, w, h]) => [this.ox + x * this.s - 2, this.oy + y * this.s - 2, Math.max(w * this.s, 4) + 4, Math.max(h * this.s, 4) + 4]);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, this.cw, this.ch);
      for (const r of rs) ctx.rect(...r);
      ctx.fillStyle = TKA('--bg-deeper', .62); ctx.fill('evenodd'); ctx.restore();
      ctx.lineWidth = 3; ctx.strokeStyle = this.hlColor;
      for (const r of rs) ctx.strokeRect(...r);
    }
  }
  highlight(shapes, color) {
    this.hl = shapes; this.hlColor = color || TK('--warn');
    if (shapes.length) { if (this.cw && this.ch) this.fly(shapes); else this.pending = shapes; }
    this.draw();
  }
  fly(shapes) {                              // 把这些单元放到视野中间，四周留出上下文
    {
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      for (const [x, y, w, h] of shapes) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x + w); d = Math.max(d, y + h); }
      const pad = Math.max(c - a, d - b) * 0.6 + 300;
      this.s = Math.min(this.cw / (c - a + 2 * pad), this.ch / (d - b + 2 * pad), 2);
      this.ox = this.cw / 2 - (a + c) / 2 * this.s; this.oy = this.ch / 2 - (b + d) / 2 * this.s;
    }
    this.draw();
  }
}
