#!/usr/bin/env python3
"""Local container test for the g44 multi-circuit split (evidence, no chain writes).

Deploys the official TapeOut CPU on a fresh PyEVM chain, tapes out the 5 slice circuits,
deploys G44Container, checks run() against the single g44 netlist on random contexts, and
reports the container run gas receipt.  Nothing is sent to BSC.
"""
import json
import os
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASIC = HERE.parent
REPO = ASIC.parents[2]
ARENA = REPO / "circuits" / "_scratch" / "dlgn_ctrl" / "arena"
sys.path[:0] = [str(ARENA), str(REPO / "circuits" / "_scratch" / "dlgn_ctrl"), str(ASIC)]
os.chdir(ARENA)

from web3 import Web3, EthereumTesterProvider
from eth_tester import EthereumTester, PyEVMBackend

ART = json.load(open(REPO / "circuits" / "_scratch" / "stateful_cpu" / "official_artifacts.json"))
BACKEND = PyEVMBackend(genesis_parameters={"gas_limit": 4_000_000_000})
w = Web3(EthereumTesterProvider(EthereumTester(BACKEND)))
w.eth.default_account = w.eth.accounts[0]
owner = w.eth.accounts[0]


def deploy(abi, bytecode, *args):
    c = w.eth.contract(abi=abi, bytecode=bytecode)
    addr = w.eth.wait_for_transaction_receipt(c.constructor(*args).transact()).contractAddress
    return w.eth.contract(address=addr, abi=abi)


def main():
    ti = deploy(ART["Transistors"]["abi"], ART["Transistors"]["bytecode"])
    ci = deploy(ART["Circuits"]["abi"], ART["Circuits"]["bytecode"])
    impl = deploy(ART["CircuitFactory"]["abi"], ART["CircuitFactory"]["bytecode"])
    data = impl.functions.initialize(owner, ti.address, ci.address, owner, 0, 0)._encode_transaction_data()
    prox = deploy(ART["ERC1967Proxy"]["abi"], ART["ERC1967Proxy"]["bytecode"], impl.address, bytes.fromhex(data[2:]))
    factory = w.eth.contract(address=prox.address, abi=ART["CircuitFactory"]["abi"])
    w.eth.wait_for_transaction_receipt(factory.functions.createCPU("rung", "RNG", "offline", 50_000_000, 0).transact())
    cpu = w.eth.contract(address=factory.functions.cpuAt(0).call(), abi=ART["Circuits"]["abi"])
    t = w.eth.contract(address=cpu.functions.transistors().call(), abi=ART["Transistors"]["abi"])
    w.eth.wait_for_transaction_receipt(t.functions.mint(0, 50_000_000).transact())

    cids = []
    for i in range(5):
        d = json.load(open(HERE / ("netlist_resyn_g44_slice%d.json" % i)))
        nl = bytes.fromhex(d["nl_hex"][2:])
        r = w.eth.wait_for_transaction_receipt(
            cpu.functions.tapeout(nl, d["nIn"], d["nOut"]).transact({"gas": 1_500_000_000}))
        cid = cpu.functions.nextId().call()
        cids.append(cid)
        print("slice %d: cid %d, %d records, burn %d gas" % (i, cid, d["nNand"], r.gasUsed))

    cont_bin = open("/tmp/g44container/G44Container.bin").read().strip()
    cont_abi = json.load(open("/tmp/g44container/G44Container.abi"))
    wiring = bytes.fromhex(open(HERE / "container_wiring.hex").read().strip())
    cont = deploy(cont_abi, cont_bin, cpu.address, cids, wiring)
    print("container deployed at", cont.address)

    g44 = json.load(open(HERE / "netlist_resyn_g44_resyn.json"))
    h = g44["nl_hex"][2:]
    nIn, nOut, nRec = g44["nIn"], g44["nOut"], len(h) // 14
    def full_eval(bits):
        wv = [0] * (2 + nIn + nRec); wv[0] = 0; wv[1] = 1
        for i in range(nIn): wv[2 + i] = bits[i]
        for i in range(nRec):
            o = i * 14
            wv[2 + nIn + i] = 1 - (wv[int(h[o+2:o+8], 16)] & wv[int(h[o+8:o+14], 16)])
        return [wv[2 + nIn + nRec - nOut + k] for k in range(nOut)]

    def pack_bits(bits):
        b = bytearray(24)
        for i, v in enumerate(bits):
            if v: b[i >> 3] |= 1 << (i & 7)
        return bytes(b)

    rng = random.Random(99)
    mism = 0
    for _ in range(5):
        bits = [rng.randrange(2) for _ in range(192)]
        want = full_eval(bits)
        got_b6 = cont.functions.run(pack_bits(bits)).call()
        got = [got_b6[j] for j in range(6)]
        if got != want:
            mism += 1
            print("MISMATCH", want, got)
    print("container vs single netlist: %d/5 mismatches" % mism)

    ctx = pack_bits([rng.randrange(2) for _ in range(192)])
    f = cont.functions.run(ctx)
    est = f.estimate_gas({"gas": 4_000_000_000})
    r = w.eth.wait_for_transaction_receipt(f.transact({"gas": 4_000_000_000}))
    print("container run gas: estimate %d, receipt %d" % (est, r.gasUsed))
    out = {"slices": [{"cid": c} for c in cids], "container": cont.address,
           "mismatches5": mism, "runGasEstimate": est, "runGasReceipt": r.gasUsed}
    (HERE / "container_test.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
