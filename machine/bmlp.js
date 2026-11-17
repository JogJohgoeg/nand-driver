/* 模型机玩具模型 tbrt-bmlp-v0 的浏览器版：读 TBW1 文件，按整数金标准（model_machine/sys/common/tbw1.py 的 gen）一个字节一个字节生成。
   只有整数运算：二值层 acc = cols − 2·popcount(x XOR w)，输出层 (acc·scale) >> 8，采样用 xorshift32，所以和 Python、板上逐字节相同。
   用法：const m = TBMLP.parse(arrayBuffer); for (const b of TBMLP.gen(m, {n: 200})) …   （b 是 0..127 的字节） */
(function (root) {
  "use strict";
  var KIND = { BIN1: 0, INT8: 1, INT16: 2 };

  function parse(buf) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf);
    if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== "TBW1") throw new Error("不是 TBW1 文件");
    var version = dv.getUint16(4, true), n = dv.getUint16(6, true), size = dv.getUint32(12, true);
    if (version !== 1 || size !== buf.byteLength) throw new Error("TBW1 文件头不对（版本 " + version + "，登记 " + size + " 字节，实际 " + buf.byteLength + "）");
    var t = {};
    for (var i = 0; i < n; i++) {
      var e = 64 + 64 * i, name = "";
      for (var j = 0; j < 27 && u8[e + 29 + j]; j++) name += String.fromCharCode(u8[e + 29 + j]);
      var kind = u8[e + 4], rows = dv.getUint32(e + 8, true), cols = dv.getUint32(e + 12, true);
      var off = dv.getUint32(e + 16, true), nb = dv.getUint32(e + 20, true), sOff = dv.getUint32(e + 24, true), sKind = u8[e + 28];
      if (off + nb > size) throw new Error(name + " 越过文件尾");
      var x = { kind: kind, rows: rows, cols: cols, scaleKind: sKind };
      if (kind === KIND.BIN1) x.words = new Uint32Array(buf.slice(off, off + nb));   // 每行 ceil(cols/64) 个 64 位字 = 2 倍个 32 位字，小端
      else if (kind === KIND.INT8) x.data = new Int8Array(buf.slice(off, off + nb));
      else if (kind === KIND.INT16) x.data = new Int16Array(buf.slice(off, off + nb));
      else throw new Error(name + "：这个演示只认 BIN1 / INT8 / INT16");
      if (sKind === 1) x.scale = new Int16Array(buf.slice(sOff, sOff + 2 * rows));
      t[name] = x;
    }
    ["cfg", "emb", "h0", "h0.b", "h1", "h1.b", "out", "out.b", "samp.lut", "prompt"].forEach(function (k) {
      if (!t[k]) throw new Error("缺张量 " + k + "（不是 tbrt-bmlp-v0）");
    });
    var c = t.cfg.data;
    return { t: t, K: c[0], E: c[1], H: c[2], nGen: c[3], seed: (((c[5] & 0xffff) << 16) | (c[4] & 0xffff)) >>> 0 || 1, topk: c[6] };
  }

  function pop32(v) {
    v = v - ((v >>> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }

  // 一层二值乘加：x 是按 64 位补齐的位向量（补的位为 0，和权重补的 0 相同，XOR 后不计数）
  function accel(w, x, out) {
    var rw = Math.ceil(w.cols / 64) * 2;
    for (var r = 0; r < w.rows; r++) {
      var p = 0, base = r * rw;
      for (var k = 0; k < rw; k++) p += pop32((w.words[base + k] ^ x[k]) >>> 0);
      out[r] = w.cols - 2 * p;
    }
    return out;
  }

  function bits(len) { return new Uint32Array(Math.ceil(len / 64) * 2); }
  function setBit(v, i) { v[i >>> 5] |= 1 << (i & 31); }

  function xorshift32(s) {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    return s >>> 0;
  }

  // 前 topk 个（同分下标小的优先），权重 lut[min(ymax−y, 255)]，xorshift32 抽一个
  function sample(y, lut, topk, state) {
    var order = [];
    for (var i = 0; i < y.length; i++) order.push(i);
    order.sort(function (a, b) { return y[b] - y[a] || a - b; });
    order = order.slice(0, topk);
    var ymax = y[order[0]], ws = order.map(function (i) { return lut[Math.min(ymax - y[i], 255)]; });
    state = xorshift32(state);
    var r = state % ws.reduce(function (a, b) { return a + b; }, 0);
    for (var j = 0; j < order.length; j++) {
      if (r < ws[j]) return [order[j], state];
      r -= ws[j];
    }
    return [order[order.length - 1], state];
  }

  // opts.prompt：字节数组（省略就用文件里的 prompt，这时输出和金标准逐字节相同）；opts.n：生成多少个
  function* gen(m, opts) {
    opts = opts || {};
    var t = m.t, K = m.K, E = m.E, n = opts.n == null ? m.nGen : opts.n;
    var prompt = opts.prompt || Array.prototype.slice.call(t.prompt.data);
    var ctx = [];
    for (var i = 0; i < K; i++) ctx.push(32);
    prompt.forEach(function (c) { ctx.push(c & 0x7f); });
    var state = m.seed, lut = t["samp.lut"].data;
    var a0 = new Int32Array(t.h0.rows), a1 = new Int32Array(t.h1.rows), y = new Int32Array(t.out.rows);
    for (var s = 0; s < n; s++) {
      var x = bits(K * E), w = ctx.slice(-K);
      for (var p = 0; p < K; p++) for (var q = 0; q < E; q++) if (t.emb.data[w[p] * E + q] >= 0) setBit(x, p * E + q);
      accel(t.h0, x, a0);
      var x1 = bits(t.h0.rows);
      for (var r = 0; r < a0.length; r++) if (a0[r] + t["h0.b"].data[r] >= 0) setBit(x1, r);
      accel(t.h1, x1, a1);
      var x2 = bits(t.h1.rows);
      for (r = 0; r < a1.length; r++) if (a1[r] + t["h1.b"].data[r] >= 0) setBit(x2, r);
      accel(t.out, x2, y);
      for (r = 0; r < y.length; r++) y[r] = ((y[r] * t.out.scale[r]) >> 8) + t["out.b"].data[r];
      var got = sample(y, lut, m.topk, state);
      state = got[1];
      ctx.push(got[0]);
      yield got[0];
    }
  }

  root.TBMLP = { parse: parse, gen: gen };
})(typeof window !== "undefined" ? window : globalThis);
