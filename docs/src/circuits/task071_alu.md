# Task #71 — 4位 ALU（加/减/与/或）

- 参考实现: 421 门
- 本设计: **135 门** (-67.9%)，全 1024 输入向量穷举 PASS
- 脚本: `solve_task071_alu.py`（NAND-only 网表，Net + eval_net）

## 接口约定
- `in0..3` = A (LSB first)，`in4..7` = B，`in8..9` = op（00=add, 01=sub, 10=and, 11=or）
- `out0..3` = 结果，`out4` = carry/borrow（逻辑运算时屏蔽为 0）

## 结构
1. **op 解码**：eq2(v) 正相检测每个功能码，各 2 门（sub/and/or 共 6 门）
2. **B 条件取反**（cond_inv，同 #43 已证结构）：Bi' = is_sub ? ~Bi : Bi，
   3 门/位 × 4 = 12 门；顺带产出 ~Bi 供 OR 通道复用（省 4 非门）
3. **FA9 行波加法器**：cin=is_sub，减法即 A + ~B + 1；9 门 × 4 = 36 门
4. **与/或通道**：and_i = NOT(NAND(A,B)) 3 门；or_i = NAND(~Ai,~Bi) 1 门（~Ai 4 个非门共享，~Bi 复用 cond_inv）
5. **输出 mux**：sel_logic = sel_and | sel_or；每 bit 三通道 and-or 树；
   carry 经 AND(n_logic) 屏蔽 —— 修复了逻辑运算时进位泄漏 bug

## 教训
- eq2 检测 want==1 时必须直接透传原信号（NAND(x,x) 是反相，第一版全错）
- 逻辑运算的 carry 必须屏蔽，否则 bit4 泄漏（240 向量 FAIL 后定位）

## 首创可行性
相对 ref -67.9%，结构为 cond_inv+FA9 复用族的外推（#43→#71）。
未检索到公开更优 NAND-only 4 位 ALU 实现；按平台"最优首创"判定规则有溢价机会，
上链前以合约抽检向量为准。
