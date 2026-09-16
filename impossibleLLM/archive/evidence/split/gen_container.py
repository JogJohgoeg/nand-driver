#!/usr/bin/env python3
"""Generate G44Container.sol from the 5 emitted g44 slice circuits.

The per-slice wiring is passed to the constructor as one bytes blob and stored in
storage (kept out of contract code so the container stays under the EIP-170 code-size
limit); run() copies it to memory and decodes with rd16/rd24 helpers.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
NS = 5
W0 = 2 + 192


def main():
    slices = [json.load(open(HERE / ("netlist_resyn_g44_slice%d.json" % i))) for i in range(NS)]
    prims = [[w - 2 for w in s["primInputs"]] for s in slices]
    prevs = [s["prevInputs"] for s in slices]
    outs = [s["outputs"] for s in slices]

    blob = bytearray()
    poff, voff, ooff = [], [], []
    for i in range(NS):
        poff.append(len(blob))
        for v in prims[i]: blob += v.to_bytes(2, "big")
        voff.append(len(blob))
        for v in prevs[i]: blob += v.to_bytes(3, "big")
        ooff.append(len(blob))
        for v in outs[i]: blob += v.to_bytes(3, "big")

    L = []
    L.append("// SPDX-License-Identifier: MIT")
    L.append("pragma solidity ^0.8.24;")
    L.append("")
    L.append("interface ICircuits {")
    L.append("  function step(uint256 cid, bytes calldata state, bytes calldata input) external view returns (bytes memory, bytes memory);")
    L.append("}")
    L.append("")
    L.append("contract G44Container {")
    L.append("  address public immutable CPU;")
    for i in range(NS):
        L.append("  uint256 public immutable C%d;" % i)
    L.append("  bytes public WIRING;")
    L.append("")
    L.append("  constructor(address cpu, uint256[%d] memory cids, bytes memory wiring) {" % NS)
    L.append("    CPU = cpu;")
    for i in range(NS):
        L.append("    C%d = cids[%d];" % (i, i))
    L.append("    WIRING = wiring;")
    L.append("  }")
    L.append("")
    L.append("  function rd16m(bytes memory b, uint off, uint i) internal pure returns (uint) {")
    L.append("    uint o = off + i * 2;")
    L.append("    return (uint256(uint8(b[o])) << 8) | uint256(uint8(b[o + 1]));")
    L.append("  }")
    L.append("  function rd24m(bytes memory b, uint off, uint i) internal pure returns (uint) {")
    L.append("    uint o = off + i * 3;")
    L.append("    return (uint256(uint8(b[o])) << 16) | (uint256(uint8(b[o + 1])) << 8) | uint256(uint8(b[o + 2]));")
    L.append("  }")
    L.append("  function setBit(bytes memory b, uint i, uint v) internal pure {")
    L.append("    if (v == 1) b[i >> 3] = bytes1(uint8(b[i >> 3]) | uint8(uint8(1) << uint8(i & 7)));")
    L.append("    else b[i >> 3] = bytes1(uint8(b[i >> 3]) & ~uint8(uint8(1) << uint8(i & 7)));")
    L.append("  }")
    L.append("  function getBit(bytes memory b, uint i) internal pure returns (uint) {")
    L.append("    return (uint8(b[i >> 3]) >> (i & 7)) & 1;")
    L.append("  }")
    L.append("  function ctxBit(bytes calldata ctx, uint i) internal pure returns (uint) {")
    L.append("    return (uint8(ctx[i >> 3]) >> (i & 7)) & 1;")
    L.append("  }")
    L.append("")
    L.append("  function run(bytes calldata ctx) external view returns (bytes6) {")
    L.append("    require(ctx.length >= 24, 'ctx');")
    L.append("    bytes memory W = WIRING;")
    buflen = (19567 + 7) // 8
    L.append("    bytes memory buf = new bytes(%d);" % buflen)
    for i, s in enumerate(slices):
        nIn = s["nIn"]; nOut = s["nOut"]
        np = len(prims[i]); nv = len(prevs[i])
        inp_len = (nIn + 7) // 8
        L.append("    {")
        L.append("      bytes memory inp = new bytes(%d);" % inp_len)
        if np:
            L.append("      for (uint i = 0; i < %d; i++) setBit(inp, i, ctxBit(ctx, rd16m(W, %d, i)));" % (np, poff[i]))
        if nv:
            L.append("      for (uint i = 0; i < %d; i++) setBit(inp, %d + i, getBit(buf, rd24m(W, %d, i) - %d));" % (nv, np, voff[i], W0))
        L.append("      (, bytes memory out) = ICircuits(CPU).step(C%d, '', inp);" % i)
        L.append("      for (uint i = 0; i < %d; i++) setBit(buf, rd24m(W, %d, i) - %d, getBit(out, i));" % (nOut, ooff[i], W0))
        L.append("    }")
    last6 = [W0 + 19567 - 6 + j for j in range(6)]
    L.append("    bytes6 res;")
    for j, w in enumerate(last6):
        L.append("    res |= bytes6(uint48(getBit(buf, %d)) << %d);" % (w - W0, (5 - j) * 8))
    L.append("    return res;")
    L.append("  }")
    L.append("}")
    L.append("")
    (HERE / "G44Container.sol").write_text(chr(10).join(L))
    (HERE / "container_wiring.hex").write_text(bytes(blob).hex())
    print("wrote G44Container.sol + container_wiring.hex; wiring", len(blob), "bytes")


if __name__ == "__main__":
    main()
