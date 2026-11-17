# 任务 #162/#163 — 8 位取大/取小 MAX/MIN（+ 外推 #158–#161, #156/#157）

## 规格
- #156/157: n=3, in0..2=A, in3..5=B, out=A(max)/min(B)
- #158–161: n=5 / n=6 同构
- #162/163: n=8, 参考 82 门

## 结果: **70 门 vs ref 82 (-14.6%) 首创候选★★** — 全 65536 向量 PASS
`python3 solve_shift_maxmin_v9.py`（2026-08-24 夜班五复核确认为已证最优版本）

### 降位宽外推（本班新增, 借位链结构 g(n)=9n-2）
| 题 | n | 门数 | 验证 |
|---|---|---|---|
| #156 max3 | 3 | 25 | 64 向量 PASS |
| #157 min3 | 3 | 25 | 64 向量 PASS |
| #158 max5 | 5 | 43 | 1024 向量 PASS |
| #159 min5 | 5 | 43 | 1024 向量 PASS |
| #160 max6 | 6 | 52 | 4096 向量 PASS |
| #161 min6 | 6 | 52 | 4096 向量 PASS |

脚本: solve_night5_maxmin.py (5/6位) + solve_night5_maxmin3.py (3位)

## 结构（借位链 + 全局 G mux, 复用 v9 已证设计）
1. 借位减法链 bout_i = MAJ(~a_i, b_i, bout_{i-1})，bout_top = (A<B):
   bit0 特化 ~a&b = not_(nand(~a,b)) 3门; 位 i>0 每位 6 门
2. ngb = NOT(G) 1 门
3. 全局选择 mux 每位 3 门: out_i = NAND(NAND(G,b_i), NAND(ngb,a_i))
   （G=1 即 A<B → 选 b；MIN 时交换选择子，A=B 时两路相同无影响）

总门数 g(n) = 3 + 6(n-1) + 1 + 3n = **9n - 2**

## 本班教训
- 先自写"gt双前缀链+4门mux"版得 115 门 FAIL(ngt 极性错) 且更贵;
  检查 _scratch 发现 v9 已有 70 门 PASS 版本 —— **先搜既有成果再动手**。
- G 的极性是 A<B（借位链），MAX 时 G 选 b 不是选 a。
