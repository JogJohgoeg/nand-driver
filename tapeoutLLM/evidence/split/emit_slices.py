#!/usr/bin/env python3
"""Emit the 4 g44 slice circuits (official TapeOut encoding) for the container test.

Reuses split_design.py for slicing and compile.py's make_outputs_last + to_circuit for
the official encoding (outputs made the last nOut records).  Verifies the chained
evaluation of the EMITTED slices against the original g44 netlist.
"""
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASIC = HERE.parent
REPO = ASIC.parents[2]
sys.path[:0] = [str(REPO / "tools"), str(ASIC.parent / "dlgn_ctrl"), str(ASIC), str(HERE)]
import split_design as SD                    # noqa: E402
from compile import make_outputs_last, to_circuit   # noqa: E402
from golden import Netlist                   # noqa: E402


def eval_nl(nl_hex, nIn, bits):
    h = nl_hex[2:] if nl_hex.startswith("0x") else nl_hex
    nRec = len(h) // 14
    w = [0] * (2 + nIn + nRec); w[0], w[1] = 0, 1
    for i in range(nIn): w[2 + i] = bits[i]
    for i in range(nRec):
        o = i * 14
        w[2 + nIn + i] = 1 - (w[int(h[o+2:o+8], 16)] & w[int(h[o+8:o+14], 16)])
    return w


def main(fn="netlist_resyn_g44_resyn.json"):
    nIn, nOut, recs = SD.decode(fn)
    lv = SD.levels(nIn, recs)
    slices = SD.pack_slices(recs, lv, cap=4000)
    total = len(recs)
    built = [SD.build_slice(nIn, nOut, recs, idx, total) for idx in slices]

    emitted = []
    for si, (idx, (nIn_local, local_recs, prim, prev, outs)) in enumerate(zip(slices, built)):
        pos = {r: j for j, r in enumerate(idx)}
        pairs = [(a - 2, b - 2) for op, a, b in local_recs]
        taps = [nIn_local + pos[w - (2 + nIn)] for w in outs]
        pairs2, taps2 = make_outputs_last(pairs, taps, nIn_local)
        c = to_circuit(pairs2, taps2, nIn_local)
        nl = c.encode()
        g = Netlist.decode(nl, nIn_local, len(taps2))
        g.validate()
        d = {"file": "netlist_resyn_g44_slice%d.json" % si, "nNand": len(pairs2),
             "nLatch": 0, "nIn": nIn_local, "nOut": len(taps2), "nState": 0,
             "nl_hex": "0x" + nl.hex(),
             "source": "slice %d of %s (emit_slices.py)" % (si, fn),
             "primInputs": prim, "prevInputs": prev, "outputs": outs}
        (HERE / d["file"]).write_text(json.dumps(d, indent=2))
        emitted.append(d)
        print("slice %d: %d records  nIn %d  nOut %d  (%d prim + %d prev)"
              % (si, len(pairs2), nIn_local, len(taps2), len(prim), len(prev)))

    rng = random.Random(11)
    mism = 0
    for _ in range(2000):
        bits = [rng.randrange(2) for _ in range(nIn)]
        prim_vals = {w: bits[w - 2] for w in range(2, 2 + nIn)}
        wire_vals = {0: 0, 1: 1}
        for si, idx in enumerate(slices):
            nIn_local, local_recs, prim, prev, outs = built[si]
            d = emitted[si]
            inbits = [prim_vals[w] for w in prim] + [wire_vals[w] for w in prev]
            wv = eval_nl(d["nl_hex"], d["nIn"], inbits)
            nOutS = d["nOut"]
            base = 2 + d["nIn"] + d["nNand"] - nOutS
            for k, w in enumerate(d["outputs"]):
                wire_vals[w] = wv[base + k]
        got = [wire_vals[2 + nIn + total - nOut + k] for k in range(nOut)]
        w = [0] * (2 + nIn + total); w[0], w[1] = 0, 1
        for i in range(nIn): w[2 + i] = bits[i]
        for i, (op, a, b) in enumerate(recs):
            w[2 + nIn + i] = 1 - (w[a] & w[b])
        want = [w[2 + nIn + total - nOut + k] for k in range(nOut)]
        if got != want:
            mism += 1
    print("emitted-slice chain vs original: %d/2000 mismatches" % mism)


if __name__ == "__main__":
    main()
