# 题227: 8 位饱和减法 sat_sub8（高级, comb, 16入8出）

## 规格
- 输入 in0..in7 = A（LSB first）, in8..in15 = B
- 输出 out7..out0 = max(A-B, 0)，下饱和到 0
- 题库参考 g=98, d=24, K=98, C=1354752

## 结构：二补码减法 + 借位掩码（NAND-only）
D = A + ~B + 1；借位 br = ~cout（A<B ⇔ cout=0）。out_i = D_i & cout。

- **位 0 特化**（cin=1）: na0,nb0（2 反相）→ t1=NAND(a0,nb0),
  c1=NAND(na0,b0)=a0|~b0 即进位, d0=NAND(t1,c1)=xor(a0,b0)。共 5 门。
- **位 1..7**: 每位 nb_i 反相(1) + 9 门 FA 文献结构(cout=NAND(g1,g5) 免费)
  = 10 门/位 ×7 = 70 门。
- **掩码**: x_i=NAND(ds_i,cout), out_i=NAND(x_i,x_i)。2 门/位 ×8 = 16 门。

总计 **5 + 70 + 16 = 91 门** vs ref 98 → **-7.1% 首创候选★**

## 关键教训（本班调试）
1. 掩码方向: 二补码减法的 MSB 进位 cout=1 表示**无借位**(A≥B)，
   直接作使能，无需反相器。
2. out = d & c 不能写成 NAND(x,c)：必须 NAND(x,x) 二次反相
   （x=~(d&c)，NAND(x,x)=d&c）。首版两处方向错误均由全向量仿真当场抓出。

## 验证
```
python3 solve_shift_sat227.py
# [#227 sat_sub8] gates=91 ref=98 (-7.1%) verify=PASS vectors=65536
```
- 全 65536 向量 PASS（2026-08-23 晚班）
- 抽查: 0-1→0 ✓, 255-0→255 ✓, 100-50→50 ✓

## 结论
Genesis 可上；无 LATCH。若 exact_synth 后续证明 <91 可再压，当前为已知最优候选。
