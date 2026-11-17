# 任务 #43 — 4 位加减法器（op 选择）

## 规格
- nIn=9 (A=in0..3, B=in4..7, op=in8), nOut=5
- 语义: op=0 加法 {cout,R}; op=1 减法 (5位二补码结果 = borrow,R)
- 参考: 344 门

## 结果: **56 门 (-83.7%) 首创候选★★★** — 全 512 向量 PASS
`python3 solve_shift43.py`（2026-08-24 夜班四验证）

## 结构
1. 条件取反 B：cond_inv(a) = NAND 标准结构 4 门/位 × 4 = 16 门
   （n1=NAND(a,op), n2=NAND(a,n1), n3=NAND(op,n1), x=NAND(n2,n3)，输出 = a XOR op）
2. 行波进位 4 位，cin=op 直连（add: cin=0, sub: cin=1），FA9×4 = 36 门
   - FA9 文献结构（_scratch/fa9_verify.py），勿重写
3. out4 = cout XOR op（NAND-XOR 4 门）：加法时=carry，减法时=borrow=~carry

合计 16+36+4 = 56 门。参考 344 门是极臃肿实现，C/g 从 6859 升至 ~42k。

## 踩坑
- cin 方向：sub 需要 cin=1 即 cin=**op** 本身，不是 ~op（第一次写反全盘 FAIL）。
- spec 口径：减法结果须按 5 位二补码取模 (& 0x1F)；borrow 语义与 mod-32 结果逐向量等价。

## 复用价值
cond_inv(4门/位) + FA9 行波 + carry/borrow XOR 输出 —— 可直接外推到 8/16 位加减法器类题。
