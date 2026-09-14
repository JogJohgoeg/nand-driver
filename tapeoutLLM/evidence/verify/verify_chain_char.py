#!/usr/bin/env python3
"""Verify the page on-chain character path (item 2, tp-2ea.18).

Rebuilds exactly the calldata the page sends for cid 285, eth_calls the public RPC,
decodes the returned symbol and compares it with the independent Python evaluator.
Read-only: eth_blockNumber + eth_call only.
"""
import json
import pathlib
import sys
import urllib.request
HERE = pathlib.Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parents[1] / "dlgn_ctrl")]
from build_onestep_page import py_eval
from compile import selector
_env = pathlib.Path.home() / ".tapeout_env"
RPC = next(s.split("=", 1)[1].strip().strip("'\"") for s in _env.read_text().splitlines()
           if s.startswith(("BSC_RPC_URL=", "export BSC_RPC_URL=")))
UA = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (TapeoutLLM verify)"}
CPU = "0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38"
CID = 285
SYMS = json.load(open(HERE / "alphabet.json"))["symbols"]
STEP = selector("step(uint256,bytes,bytes)")
def u(x):
    return x.to_bytes(32, "big")
def calldata(bits, cid=CID):
    inp = bytearray((len(bits) + 7) // 8)
    for i, b in enumerate(bits):
        if b:
            inp[i >> 3] |= 1 << (i & 7)
    pad = bytes(inp).ljust((len(inp) + 31) // 32 * 32, b"\0")
    return STEP + u(cid) + u(0x60) + u(0x60 + 32) + u(0) + u(len(inp)) + pad
def rpc(method, params):
    q = urllib.request.Request(RPC, json.dumps(dict(jsonrpc="2.0", id=1, method=method, params=params)).encode(), UA)
    with urllib.request.urlopen(q, timeout=60) as r:
        return json.load(r)

def ctx_bits(text, rnd, n_in):
    s = (" " * 32 + text)[-32:]
    idx = {sym: i for i, sym in enumerate(SYMS)}
    bits = [0] * n_in
    for i, ch in enumerate(s):
        c = idx.get(ch, 0)
        for j in range(6):
            bits[i * 6 + j] = (c >> j) & 1
    if n_in >= 200:
        for j in range(8):
            bits[192 + j] = (rnd >> j) & 1
    return bits
def code6(bits6):
    return sum((int(b) & 1) << j for j, b in enumerate(bits6[:6]))

def main():
    net = json.load(open(HERE / "netlist_resyn_cap_s.json"))
    nl, n_in, n_out = net["nl_hex"][2:], net["nIn"], net["nOut"]
    text = sys.argv[1] if len(sys.argv) > 1 else "to be, or not to be: that is the question"
    rnd = int(sys.argv[2]) if len(sys.argv) > 2 else 137
    bits = ctx_bits(text, rnd, n_in)
    py = py_eval(nl, n_in, n_out, bits) & 0x3F
    data = "0x" + calldata(bits).hex()
    blk = rpc("eth_blockNumber", [])["result"]
    res = rpc("eth_call", [{"to": CPU, "data": data}, "latest"])
    if "result" not in res:
        print("REVERT", res.get("error"))
        return
    raw = res["result"][2:]
    off2 = int(raw[64:128], 16) * 2
    n2 = int(raw[off2:off2 + 64], 16)
    ob = bytes.fromhex(raw[off2 + 64:off2 + 64 + n2 * 2])
    ch = code6([(ob[j >> 3] >> (j & 7)) & 1 for j in range(6)])
    print("block", blk, "node", RPC, "calldata", len(bytes.fromhex(data[2:])), "nNand", net["nNand"])
    print("data", data)
    print("result", res["result"])
    print("python", py, SYMS[py], "chain", ch, SYMS[ch], "agree", py == ch)
if __name__ == "__main__":
    main()

