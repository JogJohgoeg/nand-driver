// SPDX-License-Identifier: CC0-1.0
// TGW1 executor, second path: compute only what the requested output rows need, and keep what did not change.
// The file format has no state. This is an optimisation of the executor, never part of a file's meaning: for the
// same file and the same input it must give, on the requested output bits, exactly the bits Executor.run gives
// when it computes everything. Executor (tgw1.js) stays as it is and is the reference.
//
// Everything it relies on is read from the S segment, none of it is about a model:
//   * a module instance is a pure function of the input bits it reads; which bits follows from the ports of its
//     records (a TRI record makes "index + 1" repetitions)                                   -> reads() in tgw1.js
//   * demand: an output bit needs the repetition that makes it; a repetition needs the units its ports read
//   * reuse: a unit (one repetition of a record of an entered module) is recomputed only if something it reads
//     changed: the stamps of the units it reads and the content of the input bits it reads that can change
// Entered modules: the top module and every module called by a PREV chain record of an entered module.
// verify: recompute every reused unit and compare. bug: one of three deliberate mistakes (negative controls only).
import { Reject, reads, mem } from './tgw1.js';

const SRC_IN = 0xFFFF, SRC_Z = 0xFFFE, SRC_O = 0xFFFD, SRC_PREV = 0xFFFC, K_LEAF = 0, K_MOD = 1, K_LOOK = 2, K_WIRE = 3, F_LAST = 1;
const { alloc, get, put, copy, fill } = mem;

function norm(iv) {
  iv = iv.filter(x => x[1] > x[0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  for (const [a, b] of iv) { const l = out[out.length - 1]; if (l && a <= l[1]) { if (b > l[1]) l[1] = b; } else out.push([a, b]); }
  return out;
}
const cut = (iv, a, b) => iv.filter(x => x[1] > a && x[0] < b).map(x => [Math.max(x[0], a), Math.min(x[1], b)]);
function same(p, q, n) { for (let i = 0; i < n; i += 32) { const k = Math.min(32, n - i); if (get(p + i, k) !== get(q + i, k)) return false; } return true; }

export class Inc {
  constructor(ex, opt = {}) {
    this.ex = ex; this.st = ex.st; this.verify = !!opt.verify; this.bug = opt.bug || null;
    const st = this.st;
    this.entered = new Set(); const todo = [st.top];
    while (todo.length) {
      const mi = todo.pop(); if (this.entered.has(mi)) continue; this.entered.add(mi);
      for (const rec of st.modules[mi].recs) if (rec.kind === K_MOD && rec.chain && ex.need[rec.target].size === 0) todo.push(rec.target);
    }
    this.kind = new Map();
    for (const mi of this.entered) {
      if (ex.need[mi].size) throw new Reject('按需执行', '进入的模块依赖重复序号');
      this.kind.set(mi, st.modules[mi].recs.map(rec => {
        const ow = this.outW(rec);
        if (rec.tri) throw new Reject('按需执行', '进入的模块里有 tri 记录');
        if (rec.kind === K_WIRE) return ['wire', rec.rep, ow];
        if (rec.chain) { if (rec.kind !== K_MOD || !(rec.flags & F_LAST) || !this.entered.has(rec.target)) throw new Reject('按需执行', '进入的模块里有不支持的链记录'); return ['stage', 1, ow]; }
        return ['unit', rec.rep, ow];
      }));
    }
    this.root = null; this.counter = 0; this.readMemo = new Map(); this.unitMemo = new Map();
    this.stats = { unitsComputed: 0, unitsReused: 0, verified: 0, verifyMismatches: 0 };
  }
  outW(rec) { const st = this.st; return rec.kind === K_LEAF ? st.leaves[rec.target].outW : rec.kind === K_MOD ? st.modules[rec.target].nOut : rec.kind === K_LOOK ? rec.target : rec.inW; }
  newInst(mi, stack, dyn) {
    const m = this.st.modules[mi], kinds = this.kind.get(mi);
    const inst = { mi, stack, dyn, outPos: [], stamp: [], sig: [], child: new Map(), dynSig: new Map() };
    m.recs.forEach((rec, ri) => {
      const [kind, nu, ow] = kinds[ri];
      inst.outPos.push(kind === 'stage' ? -1 : mem.keep(nu * ow));
      if (kind !== 'stage') fill(inst.outPos[ri], nu * ow, 0);
      inst.stamp.push(new Int32Array(nu)); inst.sig.push(new Array(nu).fill(null));
    });
    return inst;
  }
  reads(mi, stack) { return reads(this.st, this.ex.need, this.readMemo, mi, stack); }

  // bits [a, b) of source `src` inside entered module mi -> ['in', a, b] | ['rec', record, first, last] | ['bits', record, a, b]
  resolve(mi, src, a, b, out) {
    if (src === SRC_Z || src === SRC_O || b <= a) return;
    if (src === SRC_IN) { out.push(['in', a, b]); return; }
    const [kind, , ow] = this.kind.get(mi)[src], rec = this.st.modules[mi].recs[src];
    if (kind === 'unit') out.push(['rec', src, Math.floor(a / ow), Math.floor((b - 1) / ow)]);
    else if (kind === 'stage') out.push(['bits', src, a, b]);
    else for (let q = Math.floor(a / ow); q <= Math.floor((b - 1) / ow); q++) {
      let pos = q * ow;
      for (const p of rec.ports) {
        const lo = Math.max(a, pos), hi = Math.min(b, pos + p.width);
        if (hi > lo) { const base = p.off + q * p.stride - pos; this.resolve(mi, p.src, lo + base, hi + base, out); }
        pos += p.width;
      }
    }
  }
  portSources(mi, ri, r, live) {
    const rec = this.st.modules[mi].recs[ri], out = []; let pos = 0;
    for (const p of rec.ports) {
      for (const [a, b] of cut(live, pos, pos + p.width)) {
        if (p.src === SRC_PREV) { if (r === 0) this.resolve(mi, p.init, p.stride + a - pos, p.stride + b - pos, out); else out.push(['prev', p.off + a - pos, p.off + b - pos]); }
        else { const base = p.off + r * p.stride - pos; this.resolve(mi, p.src, a + base, b + base, out); }
      }
      pos += p.width;
    }
    return out;
  }
  units(mi, ri, r, stack) {
    const key = mi + ':' + ri + ':' + r;
    if (this.unitMemo.has(key)) return this.unitMemo.get(key);
    const rec = this.st.modules[mi].recs[ri];
    const live = rec.kind === K_MOD ? this.reads(rec.target, [...stack, this.ex.need[rec.target].has(1) ? r : -1]) : [[0, rec.inW]];
    const recs = new Map(), bits = new Map(), ins = [];
    for (const u of this.portSources(mi, ri, r, live)) {
      if (u[0] === 'in') ins.push([u[1], u[2]]);
      else if (u[0] === 'rec') { if (!recs.has(u[1])) recs.set(u[1], []); recs.get(u[1]).push([u[2], u[3] + 1]); }
      else { if (!bits.has(u[1])) bits.set(u[1], []); bits.get(u[1]).push([u[2], u[3]]); }
    }
    const rr = [];
    for (const j of [...recs.keys()].sort((a, b) => a - b)) for (let [lo, hi] of norm(recs.get(j))) {
      if (this.bug === 'drop_unit' && hi - lo > 1) hi -= 1;   // deliberate mistake: forget the newest unit read
      rr.push([j, lo, hi]);
    }
    const bb = []; for (const j of [...bits.keys()].sort((a, b) => a - b)) for (const [a, b] of norm(bits.get(j))) bb.push([j, a, b]);
    const res = { rr, bb, ins: norm(ins) };
    this.unitMemo.set(key, res);
    return res;
  }

  // inputBytes: runtime input bits packed LSB first; intervals: [[a, b], ...] over the output wires.
  // Returns a reader over the output; only the units of the last record those intervals touch are meaningful.
  run(inputBytes, intervals) {
    const st = this.st, ex = this.ex, top = st.modules[st.top];
    mem.toFloor();
    if (!this.root) {
      this.topIn = mem.keep(top.nIn);
      const f = alloc(ex.fixedBits); mem.setWords(ex.fixed, f); copy(f, this.topIn + st.inBits, ex.fixedBits); mem.toFloor();
      this.root = this.newInst(st.top, [], [[0, st.inBits]]);
    }
    fill(this.topIn, st.inBits, 0);
    for (let i = 0; i < inputBytes.length; i++) put(this.topIn + 8 * i, Math.min(8, st.inBits - 8 * i), inputBytes[i]);
    const kinds = this.kind.get(st.top), [, nu, ow] = kinds[kinds.length - 1], want = new Uint8Array(nu);
    for (const [a, b] of intervals) for (let u = Math.floor(a / ow); u <= Math.floor((b - 1) / ow); u++) want[u] = 1;
    const plan = this.plan(this.root, want);          // creates every instance it needs: kept wires first
    const pos = this.forward(this.root, this.topIn, plan);
    mem.toFloor();
    return { bits: (off, w) => get(pos + off, w), sbits: (off, w) => mem.gs(pos + off, w), width: top.nOut };
  }
  child(inst, ri, r) {
    const key = ri + ':' + r;
    if (!inst.child.has(key)) {
      const rec = this.st.modules[inst.mi].recs[ri], dyn = []; let pos = 0;
      for (const p of rec.ports) {
        if (p.src === SRC_PREV) { if (r > 0 || (p.init !== SRC_Z && p.init !== SRC_O)) dyn.push([pos, pos + p.width]); }
        else if (p.src === SRC_IN) { const base = p.off + r * p.stride - pos; for (const [a, b] of cut(inst.dyn, pos + base, pos + base + p.width)) dyn.push([a - base, b - base]); }
        else if (p.src !== SRC_Z && p.src !== SRC_O) dyn.push([pos, pos + p.width]);
        pos += p.width;
      }
      inst.child.set(key, this.newInst(rec.target, [...inst.stack, -1], norm(dyn)));
    }
    return inst.child.get(key);
  }
  plan(inst, wantLast) {
    const mi = inst.mi, m = this.st.modules[mi], kinds = this.kind.get(mi);
    const demand = kinds.map(k => new Uint8Array(k[1])), sbits = new Map(), needIn = [], stage = new Map();
    demand[demand.length - 1].set(wantLast);
    const add = u => {
      if (u[0] === 'in') needIn.push([u[1], u[2]]);
      else if (u[0] === 'rec') demand[u[1]].fill(1, u[2], u[3] + 1);
      else { demand[u[1]][0] = 1; if (!sbits.has(u[1])) sbits.set(u[1], []); sbits.get(u[1]).push([u[2], u[3]]); }
    };
    for (let ri = m.recs.length - 1; ri >= 0; ri--) {
      const [kind, , ow] = kinds[ri], rec = m.recs[ri];
      if (kind === 'unit') {
        for (let r = 0; r < demand[ri].length; r++) if (demand[ri][r]) {
          const u = this.units(mi, ri, r, inst.stack);
          for (const [j, lo, hi] of u.rr) demand[j].fill(1, lo, hi);
          for (const [j, a, b] of u.bb) { demand[j][0] = 1; if (!sbits.has(j)) sbits.set(j, []); sbits.get(j).push([a, b]); }
          for (const x of u.ins) needIn.push(x);
        }
      } else if (kind === 'stage' && demand[ri][0]) {
        let outNeed = ri !== m.recs.length - 1 ? norm(sbits.get(ri) || []) : [[0, ow]];
        const plans = new Array(rec.rep);
        for (let r = rec.rep - 1; r >= 0; r--) {
          const ch = this.child(inst, ri, r), ck = this.kind.get(ch.mi), [, cn, cw] = ck[ck.length - 1], w = new Uint8Array(cn);
          for (const [a, b] of outNeed) w.fill(1, Math.floor(a / cw), Math.floor((b - 1) / cw) + 1);
          plans[r] = this.plan(ch, w);
          outNeed = [];
          for (const u of this.portSources(mi, ri, r, norm(plans[r].needIn))) { if (u[0] === 'prev') outNeed.push([u[1], u[2]]); else add(u); }
          outNeed = norm(outNeed);
          if (!outNeed.length && r > 0) throw new Reject('按需执行', '一级不读上一级');
        }
        stage.set(ri, plans);
      }
    }
    return { demand, stage, needIn };
  }
  srcPos(inst, inPos, src) { const p = src === SRC_IN ? inPos : inst.outPos[src]; if (p < 0) throw new Reject('按需执行', '读到了没有算的一级'); return p; }
  // gather the ports of repetition r of record rec into ip
  gather(inst, inPos, rec, r, ip, prevPos) {
    const m = this.st.modules[inst.mi], kinds = this.kind.get(inst.mi); let o = 0;
    const width = src => (src === SRC_IN ? m.nIn : kinds[src][0] === 'stage' ? kinds[src][2] : kinds[src][1] * kinds[src][2]);
    for (const p of rec.ports) {
      if (p.src === SRC_Z) fill(ip + o, p.width, 0);
      else if (p.src === SRC_O) fill(ip + o, p.width, 1);
      else if (p.src === SRC_PREV) {
        if (r === 0) { if (p.init === SRC_Z) fill(ip + o, p.width, 0); else if (p.init === SRC_O) fill(ip + o, p.width, 1); else { if (p.stride + p.width > width(p.init)) throw new Reject('口', '读到来源末尾之外'); copy(this.srcPos(inst, inPos, p.init) + p.stride, ip + o, p.width); } }
        else copy(prevPos + p.off, ip + o, p.width);
      } else {
        const off = p.off + p.stride * r;
        if (off + p.width > width(p.src)) throw new Reject('口', '读到来源末尾之外');
        copy(this.srcPos(inst, inPos, p.src) + off, ip + o, p.width);
      }
      o += p.width;
    }
  }
  signature(inst, inPos, ri, r) {
    const u = this.units(inst.mi, ri, r, inst.stack), key = ri + ':' + r;
    if (!inst.dynSig.has(key)) inst.dynSig.set(key, norm(u.ins.flatMap(([a, b]) => cut(inst.dyn, a, b))));
    const s = [];
    for (const [j, lo, hi] of u.rr) { s.push(-1); for (let k = lo; k < hi; k++) s.push(inst.stamp[j][k]); }
    if (this.bug !== 'no_content') {                 // deliberate mistake: do not look at changed input bits
      const words = (base, a, b) => { s.push(-2); for (let k = a; k < b; k += 32) s.push(get(base + k, Math.min(32, b - k)) | 0); };
      for (const [j, a, b] of u.bb) words(inst.outPos[j], a, b);
      for (const [a, b] of inst.dynSig.get(key)) words(inPos, a, b);
    }
    return Int32Array.from(s);
  }
  // compute repetition r of unit record ri into the temporary wires at dst
  compute(inst, inPos, ri, r, dst) {
    const rec = this.st.modules[inst.mi].recs[ri], ex = this.ex, st = this.st, ow = this.kind.get(inst.mi)[ri][2];
    if (rec.kind === K_LOOK) {
      const pi = rec.ports[0], pt = rec.ports[1], m = st.modules[inst.mi];
      if (pt.width % ow) throw new Reject('查表', '表宽不是每项位数的整数倍');
      if (pt.src === SRC_Z || pt.src === SRC_O) throw new Reject('查表', '表必须是线');
      const index = get(this.srcPos(inst, inPos, pi.src) + pi.off + pi.stride * r, pi.width);
      if (index >= pt.width / ow) throw new Reject('查表', '下标出界');
      copy(this.srcPos(inst, inPos, pt.src) + pt.off + pt.stride * r + index * ow, dst, ow);
      return;
    }
    const ip = alloc(rec.inW);
    this.gather(inst, inPos, rec, r, ip, 0);
    if (rec.kind === K_LEAF) { if (rec.inW !== st.leaves[rec.target].inW) throw new Reject('叶子记录', '各口位宽之和不等于叶子输入'); ex.leaf(rec.target, ip, dst); return; }
    if (rec.inW !== st.modules[rec.target].nIn) throw new Reject('模块记录', '各口位宽之和不等于模块输入');
    const fs = ex.fastmods.get(rec.target);
    if (fs !== undefined) { ex.fastCalls++; mem.nativePlaneDot(ip, dst, fs); return; }
    const res = ex.module(rec.target, ip, [...inst.stack, ex.need[rec.target].has(1) ? r : -1]);
    copy(res.pos, dst, ow);
  }
  forward(inst, inPos, plan) {
    const mi = inst.mi, m = this.st.modules[mi], kinds = this.kind.get(mi);
    for (let ri = 0; ri < m.recs.length; ri++) {
      const [kind, nu, ow] = kinds[ri], rec = m.recs[ri];
      if (kind === 'wire') { for (let r = 0; r < rec.rep; r++) this.gather(inst, inPos, rec, r, inst.outPos[ri] + r * ow, 0); }
      else if (kind === 'stage') {
        if (!plan.demand[ri][0]) continue;
        let prev = 0;
        for (let r = 0; r < rec.rep; r++) {
          const mark = mem.mark(), ip = alloc(rec.inW);
          this.gather(inst, inPos, rec, r, ip, prev);
          prev = this.forward(this.child(inst, ri, r), ip, plan.stage.get(ri)[r]);
          mem.release(mark);
        }
        inst.outPos[ri] = prev;
      } else {
        for (let r = 0; r < nu; r++) if (plan.demand[ri][r]) {
          const s = this.signature(inst, inPos, ri, r), old = inst.sig[ri][r], out = inst.outPos[ri] + r * ow;
          const hit = inst.stamp[ri][r] && old && old.length === s.length && old.every((v, i) => v === s[i]);
          const mark = mem.mark();
          if (hit) {
            this.stats.unitsReused++;
            if (this.verify) { const t = alloc(ow); this.compute(inst, inPos, ri, r, t); this.stats.verified++; if (!same(t, out, ow)) { this.stats.verifyMismatches++; throw new Reject('核对模式', `留用的结果和重算的不同（模块 ${mi} 记录 ${ri} 第 ${r} 次）`); } }
          } else if (this.bug === 'shift' && r > 0 && !inst.stamp[ri][r] && inst.stamp[ri][r - 1]) {
            copy(out - ow, out, ow); inst.stamp[ri][r] = ++this.counter; inst.sig[ri][r] = s;   // deliberate mistake
          } else {
            const t = alloc(ow); this.compute(inst, inPos, ri, r, t); this.stats.unitsComputed++;
            if (!inst.stamp[ri][r] || !same(t, out, ow)) { copy(t, out, ow); inst.stamp[ri][r] = ++this.counter; }
            inst.sig[ri][r] = s;
          }
          mem.release(mark);
        }
      }
    }
    return inst.outPos[m.recs.length - 1];
  }
}
