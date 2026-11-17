// 竞技场只读版：小车、赛道、5 条测距线和 21 个与非门，全在浏览器里算（不连钱包、不发交易）。
// 逐行照 dlgn_ctrl/env.py 写，用同一组常数；arena.test.mjs 对 24 个固定起点和 Python 逐步对拍。
(function (G) {
  "use strict";
  var D = Math.PI / 180;
  var RAY = [60 * D, 30 * D, 0 * D, -30 * D, -60 * D];          // 左 2、左 1、正前、右 1、右 2
  var TH = [0.8, 1.6, 3.0], RAY_MAX = 4.0, RAY_STEP = 0.1, NS = 40;
  var SPEED = 0.25, TURN = 10 * D, W = 1.3, R0 = 8.0, N = 1440, GRID = 0.04, MAX_STEPS = 1200;
  // 链上第 279 号电路的 21 个与非门（输入 0–14 是 15 位传感器，14+i 是第 i 个门；输出两位：左、右）
  var PAIRS = [[1, 1], [13, 15], [16, 16], [15, 15], [13, 13], [18, 19], [8, 17], [11, 20], [5, 5], [10, 23], [21, 22],
    [25, 25], [3, 26], [4, 4], [9, 28], [29, 29], [27, 27], [24, 31], [30, 30], [32, 32], [22, 33]];
  var TAPS = [34, 35], NIN = 15;
  // 24 个固定起点：赛道上 8 个位置，每个位置正中、偏左、偏右各一次
  var STARTS = [];
  for (var i = 0; i < 8; i++) [[0, 0], [0.6, 0.4], [-0.6, -0.4]].forEach(function (s) { STARTS.push([i * N / 8, s[0], s[1]]); });

  function nand(bits) {
    var v = bits.slice();
    for (var k = 0; k < PAIRS.length; k++) v.push(1 - (v[PAIRS[k][0]] & v[PAIRS[k][1]]));
    return [v[TAPS[0]], v[TAPS[1]]];
  }
  function action(out) { return out[0] && !out[1] ? 1 : out[1] && !out[0] ? 2 : 0; }   // 1 左转、2 右转，其余直行
  function rint(x) {                                              // numpy.rint：一半时取偶数
    var f = Math.floor(x), r = x - f;
    return r > 0.5 ? f + 1 : r < 0.5 ? f : (f % 2 === 0 ? f : f + 1);
  }

  // 赛道：极坐标中心线，半宽 W；网格里每个格点离中心线不超过 W 就算在路上（用到才算，算过记住）
  var cx = new Float64Array(N), cy = new Float64Array(N), tx = new Float64Array(N), ty = new Float64Array(N), ext = 0;
  for (i = 0; i < N; i++) {
    var t = i * (2 * Math.PI / N), rho = R0 * (1.0 + 0.18 * Math.sin(3 * t) + 0.10 * Math.cos(2 * t));
    cx[i] = rho * Math.cos(t); cy[i] = rho * Math.sin(t); ext = Math.max(ext, Math.abs(cx[i]), Math.abs(cy[i]));
  }
  for (i = 0; i < N; i++) {
    var j = (i + 1) % N, dx = cx[j] - cx[i], dy = cy[j] - cy[i], l = Math.sqrt(dx * dx + dy * dy);
    tx[i] = dx / l; ty[i] = dy / l;
  }
  ext = ext + W + 1.0;
  var G0 = -ext, GN = Math.ceil(2 * ext / GRID) + 1, occ = new Uint8Array(GN * GN);
  function cell(a, b) {
    var k = a * GN + b;
    if (!occ[k]) {
      var px = G0 + GRID * a, py = G0 + GRID * b, m = Infinity;
      for (var q = 0; q < N; q++) { var ex = px - cx[q], ey = py - cy[q], d2 = ex * ex + ey * ey; if (d2 < m) m = d2; }
      occ[k] = Math.sqrt(m) <= W ? 1 : 2;
    }
    return occ[k] === 1;
  }
  function inside(x, y) {
    var a = Math.min(GN - 1, Math.max(0, rint((x - G0) / GRID))), b = Math.min(GN - 1, Math.max(0, rint((y - G0) / GRID)));
    return cell(a, b);
  }
  function nearest(x, y) {
    var best = 0, m = Infinity;
    for (var q = 0; q < N; q++) { var ex = cx[q] - x, ey = cy[q] - y, d2 = ex * ex + ey * ey; if (d2 < m) { m = d2; best = q; } }
    return best;
  }

  function Car(start) {
    var s = start || STARTS[0], c = s[0];
    this.x = cx[c] + s[1] * -ty[c]; this.y = cy[c] + s[1] * tx[c];
    this.th = Math.atan2(ty[c], tx[c]) + s[2];
    this.idx = c; this.progress = 0; this.steps = 0; this.crashed = false; this.done = false; this.lap = false;
    this.observe();
  }
  Car.prototype.observe = function () {
    var d = [], bits = [];
    for (var r = 0; r < 5; r++) {
      var a = this.th + RAY[r], ux = Math.cos(a), uy = Math.sin(a), dist = RAY_MAX;
      for (var k = 1; k <= NS; k++) {
        var kk = k * RAY_STEP;
        if (!inside(this.x + ux * kk, this.y + uy * kk)) { dist = kk - RAY_STEP; break; }
      }
      d.push(dist);
      for (var h = 0; h < 3; h++) bits.push(dist > TH[h] ? 1 : 0);
    }
    this.dists = d; this.bits = bits;
    return bits;
  };
  Car.prototype.decide = function () { this.out = nand(this.bits); return action(this.out); };
  Car.prototype.step = function (act) {
    if (this.done) return;
    if (act === 1) this.th += TURN; else if (act === 2) this.th -= TURN;
    this.x = this.x + SPEED * Math.cos(this.th); this.y = this.y + SPEED * Math.sin(this.th);
    this.steps++;
    if (!inside(this.x, this.y)) { this.crashed = true; this.done = true; this.observe(); return; }
    var j = nearest(this.x, this.y), adv = ((j - this.idx + N / 2) % N + N) % N - N / 2;
    this.progress += adv; this.idx = j;
    this.lap = this.progress >= N;
    if (this.lap || this.steps >= MAX_STEPS) this.done = true;
    this.observe();
  };
  // 把 15 位传感器读数打包成链上 eval 用的字节（每个字节低位在前），十六进制
  function packBits(bits) {
    var h = "";
    for (var b = 0; b < bits.length; b += 8) {
      var v = 0;
      for (var k = 0; k < 8 && b + k < bits.length; k++) v |= bits[b + k] << k;
      h += (v < 16 ? "0" : "") + v.toString(16);
    }
    return h;
  }
  G.Car = { Car: Car, STARTS: STARTS, nand: nand, action: action, packBits: packBits, N: N, W: W, cx: cx, cy: cy, tx: tx, ty: ty, GATES: PAIRS.length };
})(typeof window !== "undefined" ? window : globalThis);
