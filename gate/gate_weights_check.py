#!/usr/bin/env python3
"""门电路大脑的模型文件：照区块链上的登记自己核一遍。只读，只用 Python 标准库，一个文件就能跑。
Check the gate-brain model files against the on-chain record yourself. Read-only, standard library only, single file.

核的是这一条链：
  1. BNB Chain 上 282.732 这个站点容器登记的 gate/weights.lock.json 的大小和 sha256（只读调用 fileInfo）
  2. 取回这份清单（先从网关取；取不到或对不上，就用只读调用 readRange 直接从链上读），算 sha256 和第 1 步比
  3. 主站上的两份权重清单 manifest.json、manifest.gz.json，和第 2 步清单里登记的大小、sha256 比
  4. 权重块：每块的压缩包和清单比，解压后再和清单比（默认随机抽 2 块；--all 是全部 36 块，约 577 MB）

用法：
  python3 gate_weights_check.py                 抽 2 块
  python3 gate_weights_check.py --sample 5      抽 5 块
  python3 gate_weights_check.py --all           全部
  python3 gate_weights_check.py --lock 文件     链上还没有登记时，改用手头的一份清单，只核第 3、4 步；会明说「没有核链上」
  --base URL   权重所在的地址（默认主站）；--rpc URL  指定一个 BNB Chain 只读节点（默认轮流试几个公开节点）

退出码：0 全部一致；1 有不一致或读不到；2 链上还没有登记（且没给 --lock）。
取回来的文件只在内存里算哈希、解压、比对，不写到硬盘，不执行。只发只读请求，不需要钱包。
"""
import argparse, gzip, hashlib, json, random, sys, urllib.request

REGISTRY = "0xd006ffdd5ae313b17729621a00999cd3c71ce5e6"     # 登记站点文件的合约
CONTAINER = "0x39d97ab281f04a5bc3aCc562f8DeA3f0b4266aA3"    # 282.732 站点容器
PATH = "gate/weights.lock.json"
GATEWAY = "https://282-732.aihashrate.stream/"
BASE = "https://nand.aihashrate.stream/gate-weights/"
NODES = ["https://bsc-dataseed1.binance.org", "https://bsc-dataseed.bnbchain.org", "https://bsc-rpc.publicnode.com"]
SEL_INFO, SEL_RANGE = "6c609107", "15a4cae2"                # fileInfo(address,string)、readRange(address,string,uint256,uint256)
UA = "gate_weights_check/2"


def sha(b): return hashlib.sha256(b).hexdigest()
def word(n): return "%064x" % n
def addr(a): return "0" * 24 + a[2:].lower()
def strarg(s):
    h = s.encode().hex(); return word(len(h) // 2) + h + "0" * ((64 - len(h) % 64) % 64)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    return urllib.request.urlopen(req, timeout=180).read()


class Rpc:
    """只发 eth_call 和 eth_blockNumber 两种只读请求。"""
    def __init__(self, urls): self.urls, self.used = urls, None

    def __call__(self, method, params):
        assert method in ("eth_call", "eth_blockNumber")
        last = None
        for u in ([self.used] if self.used else self.urls):
            try:
                body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
                req = urllib.request.Request(u, data=body, headers={"Content-Type": "application/json", "User-Agent": UA})
                r = json.loads(urllib.request.urlopen(req, timeout=60).read())
                if "result" not in r: raise ValueError(str(r.get("error")))
                self.used = u; return r["result"]
            except Exception as e:
                last = e
        raise RuntimeError("连不上 BNB Chain 的只读节点：%s" % last)


def chain_lock(rpc, block):
    res = rpc("eth_call", [{"to": REGISTRY, "data": "0x" + SEL_INFO + addr(CONTAINER) + word(64) + strarg(PATH)}, block])[2:]
    w = lambda i: res[64 * i:64 * (i + 1)]
    size, h, chunks = int(w(0), 16), w(2), int(w(4), 16)
    if not chunks:
        return None, None, "链上还没有登记 " + PATH
    try:
        b = get(GATEWAY + PATH); src = "网关"
        if len(b) != size or sha(b) != h:
            raise ValueError("网关上的那份和登记不符")
    except Exception as e:
        out, off = bytearray(), 0
        while off < size:
            n = min(96000, size - off)
            r = rpc("eth_call", [{"to": REGISTRY, "data": "0x" + SEL_RANGE + addr(CONTAINER) + word(128) + word(off) + word(n) + strarg(PATH)}, block])[2:]
            ln = int(r[64:128], 16); out += bytes.fromhex(r[128:128 + 2 * ln]); off += ln
            if not ln: break
        b, src = bytes(out), "直接从链上读（网关：%s）" % e
    if len(b) != size or sha(b) != h:
        return None, None, "取到的清单和链上登记不符：%s… %d 字节 ≠ %s… %d 字节" % (sha(b)[:12], len(b), h[:12], size)
    return b, "链上登记 sha256 %s… %d 字节，区块 %d，清单来自%s" % (h[:12], size, int(block, 16), src), None


def main():
    ap = argparse.ArgumentParser(description="照链上登记核门电路大脑的模型文件（只读）")
    ap.add_argument("--all", action="store_true"); ap.add_argument("--sample", type=int, default=2)
    ap.add_argument("--lock"); ap.add_argument("--base", default=BASE); ap.add_argument("--rpc")
    a = ap.parse_args()
    bad = 0

    def say(ok, what, detail=""):
        nonlocal bad
        bad += not ok
        print(("一致  " if ok else "不一致") + "  " + what + ("  " + detail if detail else ""))

    b = note = None
    try:
        rpc = Rpc([a.rpc] if a.rpc else NODES)
        block = rpc("eth_blockNumber", [])
        b, note, err = chain_lock(rpc, block)
    except Exception as e:
        err = str(e)
    if err and not a.lock:
        print(err + "（链上还没有登记时，可以用 --lock 给一份清单，先核后面几步）")
        return 2 if "还没有登记" in err else 1
    chain_checked = not err
    if err:
        b = open(a.lock, "rb").read()
        note = "用的是手头这份清单，没有核链上（%s）：sha256 %s… %d 字节" % (err, sha(b)[:12], len(b))
    print("清单：" + note)
    lock = json.loads(b)
    if lock.get("format") != "gatebrain-weights-lock-v1":
        print("清单的格式不对"); return 1
    for key in ("manifest", "manifest_gz"):
        e = lock[key]; m = get(a.base + e["file"])
        say(len(m) == e["bytes"] and sha(m) == e["sha256"], e["file"], "sha256 %s %d 字节" % (sha(m), len(m)))
        if key == "manifest":
            man = json.loads(m)
            agree = len(man["chunks"]) == len(lock["chunks"]) and all(
                r[0] == c["file"] and r[1] == c["bytes"] and r[2] == c["sha256"] for r, c in zip(lock["chunks"], man["chunks"]))
            say(agree, "权重清单里每一块的记录 = 链上那份清单", "%d 块" % len(lock["chunks"]))
    n = len(lock["chunks"])
    idx = list(range(n)) if a.all else sorted(random.sample(range(n), max(0, min(a.sample, n))))
    for i in idx:
        f, nb, h, gb, gh = lock["chunks"][i]
        z = get(a.base + f + ".gz")
        okz = len(z) == gb and sha(z) == gh
        raw = gzip.decompress(z) if okz else b""
        say(okz and len(raw) == nb and sha(raw) == h, f + ".gz",
            "压缩包 sha256 %s %d 字节；解压后 sha256 %s %d 字节" % (sha(z), len(z), sha(raw) if raw else "-", len(raw)))
    print("汇总：%s；%s；权重核了 %d / %d 块，不一致 %d 处" % (
        "全部一致" if not bad else "有不一致", "链上登记核过" if chain_checked else "链上登记没有核", len(idx), n, bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
