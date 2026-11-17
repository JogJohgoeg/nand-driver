# Task #100 — 16 位 + 8 位加法（NAND-only）

## 规格
- 输入: in0..15 = A (16bit, LSB first), in16..23 = B (8bit, LSB first)
- 输出: out0..15 = 和, out16 = 进位
- 参考门数: 108

## 本设计: 108 门 = 参考持平（全向量 PASS）
实现脚本: `solve_task100_add168.py`

结构:
1. bit0: HA(a0, b0) — 5 门
2. bits 1..7: FA 行波 ×7 — 9 门/个 = 63 门
3. bits 8..15: HA 链 (a_i + carry) ×8 — 5 门/个 = 40 门
4. out16 = 末级进位 (wire)

## 核心突破: 9 门 NAND 全加器
本班从文献定位并穷举验证了标准 **9 门 NAND FA**（此前会话一直用 11 门结构）:

```
g1 = NAND(A,B)
g2 = NAND(A,g1)
g3 = NAND(B,g1)
g4 = NAND(g2,g3)      # x = A^B
g5 = NAND(x,Cin)
g6 = NAND(x,g5)
g7 = NAND(Cin,g5)
Sum   = NAND(g6,g7)    # x ^ Cin
Cout  = NAND(g1,g5)    # ab | x·Cin = maj
```
验证: `_scratch/fa9_verify.py` — 8/8 向量 PASS。

## 验证
- 3005 条随机 + 边界向量 PASS (`solve_task100_add168.py main`)
- 结构化穷举 1536 向量 (B×{0,1,255,65535,255,43605,65280}) PASS (`_scratch/verify100_full.py`)

## 结论
108 门持平参考，无首创溢价。价值在于 9 门 FA 可复用到 #36/#40/#61 等 S 级加法类题目。
