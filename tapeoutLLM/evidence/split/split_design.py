#!/usr/bin/env python3
"""tp-2ea.14 follow-on: multi-circuit split design for the 19.6k g44 model.

Mainnet cap: 5,723 NAND records (40,061 B) per tape-out, so the 19,567-record g44
netlist must be split.  This slices the combinational DAG along topological levels
into chunks of <= 5,723 records, remaps wire ids per chunk, verifies the chained
evaluation reproduces the original bit-for-bit, and reports the container cost.
Read-only; no chain writes.
"""
import json
import random
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
CAP = 5723
STEP_PER_NAND = 2293
BURN_PER_NAND = 2923
HOP_OVERHEAD = 60000   # model estimate per hop: container CALL + ABI decode/encode


def decode(fn):
    d = json.load(open(HERE / fn))
    h = d["nl_hex"][2:] if d["nl_hex"].startswith("0x") else d["nl_hex"]
    nIn, nOut = d["nIn"], d["nOut"]
    recs = []
    for i in range(len(h) // 14):
        o = i * 14
        recs.append((int(h[o:o+2], 16), int(h[o+2:o+8], 16), int(h[o+8:o+14], 16)))
    return nIn, nOut, recs


def levels(nIn, recs):
    lv = [0] * len(recs)
    for i, (op, a, b) in enumerate(recs):
        la = 0 if a < 2 + nIn else lv[a - (2 + nIn)]
        lb = 0 if b < 2 + nIn else lv[b - (2 + nIn)]
        lv[i] = 1 + max(la, lb)
    return lv


def pack_slices(recs, lv, cap=CAP):
    order = sorted(range(len(recs)), key=lambda i: (lv[i], i))
    slices, cur = [], []
    for i in order:
        cur.append(i)
        if len(cur) >= cap:
            slices.append(cur); cur = []
    if cur:
        slices.append(cur)
    return slices


def build_slice(nIn, nOut, recs, idx, total):
    wire = lambda r: 2 + nIn + r
    produced = {wire(r) for r in idx}
    final_outs = {2 + nIn + total - nOut + k for k in range(nOut)}
    prim = sorted({w for r in idx for w in (recs[r][1], recs[r][2]) if w < 2 + nIn})
    prev = sorted({w for r in idx for w in (recs[r][1], recs[r][2])
                   if w >= 2 + nIn and w not in produced})
    consumers = Counter()
    for r, (op, a, b) in enumerate(recs):
        if r not in idx:
            consumers[a] += 1; consumers[b] += 1
    outs = sorted(w for r in idx if consumers.get(wire(r), 0) > 0 or wire(r) in final_outs
                  for w in [wire(r)])
    nIn_local = len(prim) + len(prev)
    loc = {0: 0, 1: 1}
    for k, w in enumerate(prim, start=2):
        loc[w] = k
    for k, w in enumerate(prev, start=2 + len(prim)):
        loc[w] = k
    for j, r in enumerate(idx):
        loc[wire(r)] = 2 + nIn_local + j
    local_recs = [(op, loc[a], loc[b]) for op, a, b in (recs[r] for r in idx)]
    return nIn_local, local_recs, prim, prev, outs


def eval_slice(nIn_local, local_recs, bits):
    nRec = len(local_recs)
    w = [0] * (2 + nIn_local + nRec)
    w[0], w[1] = 0, 1
    for i in range(nIn_local):
        w[2 + i] = bits[i]
    for i, (op, a, b) in enumerate(local_recs):
        w[2 + nIn_local + i] = 1 - (w[a] & w[b])
    return w


def full_eval(nIn, recs, bits):
    nRec = len(recs)
    w = [0] * (2 + nIn + nRec); w[0], w[1] = 0, 1
    for i in range(nIn): w[2 + i] = bits[i]
    for i, (op, a, b) in enumerate(recs):
        w[2 + nIn + i] = 1 - (w[a] & w[b])
    return w


def main(fn="netlist_resyn_g44_resyn.json"):
    nIn, nOut, recs = decode(fn)
    lv = levels(nIn, recs)
    slices = pack_slices(recs, lv)
    total = len(recs)
    built = [build_slice(nIn, nOut, recs, idx, total) for idx in slices]
    # ---- verification: chained slice evaluation == original on random inputs
    rng = random.Random(7)
    mism = 0
    for _ in range(2000):
        bits = [rng.randrange(2) for _ in range(nIn)]
        prim_vals = {w: bits[w - 2] for w in range(2, 2 + nIn)}
        wire_vals = {0: 0, 1: 1}
        for si, idx in enumerate(slices):
            nIn_local, local_recs, prim, prev, outs = built[si]
            inbits = [prim_vals[w] for w in prim] + [wire_vals[w] for w in prev]
            wv = eval_slice(nIn_local, local_recs, inbits)
            for j, r in enumerate(idx):
                wire_vals[2 + nIn + r] = wv[2 + nIn_local + j]
        got = [wire_vals[2 + nIn + total - nOut + k] for k in range(nOut)]
        want = full_eval(nIn, recs, bits)
        if got != [want[2 + nIn + total - nOut + k] for k in range(nOut)]:
            mism += 1
    print(f"{fn}: {total} records, {max(lv)} levels, {len(slices)} slices; "
          f"chained-vs-original mismatch {mism}/2000")
    tot_cut = 0
    for si, idx in enumerate(slices):
        nIn_local, local_recs, prim, prev, outs = built[si]
        tot_cut += len(prev)
        step = STEP_PER_NAND * len(idx) + HOP_OVERHEAD
        print(f"  slice {si}: {len(idx):5d} records  nIn={nIn_local:5d} "
              f"({len(prim):4d} prim + {len(prev):4d} prev)  nOut={len(outs):5d}  "
              f"step~{step:,}")
    total_step = sum(STEP_PER_NAND * len(i) + HOP_OVERHEAD for i in slices)
    total_burn = sum(BURN_PER_NAND * len(i) for i in slices)
    print(f"container: {len(slices)} hops, {tot_cut} intermediate wires; "
          f"step gas ~{total_step:,} ({total_step/68444479:.2f} blocks); "
          f"burn gas ~{total_burn:,}")
    print("single-circuit g44: step 45,738,885 gas (0.668 block), over the 40,061 B cap")


if __name__ == "__main__":
    main()
