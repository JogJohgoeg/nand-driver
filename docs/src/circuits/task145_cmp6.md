# 任务 #145 — 6 位比较器（<, =, >）

## 规格
- nIn=12 (A=in0..5, B=in6..11), nOut=3 (out0=lt, out1=eq, out2=gt)
- 参考: 89 门

## 结果: **71 门 (-20.2%) 首创候选★★** — 全 4096 向量 PASS
`python3 solve_shift145.py`（2026-08-24 夜班四验证）

## 结构
复用 gt 双前缀链（solve_night3.design_gtn，g(n)=12n-6 规律，n=6 时 gt 链 66 门），
末尾追加:
- ngt = NOT(gt)（1 门）
- neq = NOT(eq)（1 门）
- lt = NOT(NAND(ngt, neq)) = ~(~gt & ~eq) = ~(gt|eq)（2 门）

合计 67 + 4 = 71 门。eq/lt 都从已证链免费延伸，无新风险面。

## 外推
- #144 (5位比较器, ref75): 预期 55+4 = 59 门 (-21.3%)，待验证
- #161/#160 (MIN/MAX): 在 lt/gt 基础上再加 MUX 树
- 同规律: #146/#147 若存在同族题同样适用
