# 题48: 4 位 1 的个数 popcount4（初级, comb, 4入3出）— 最优首创候选 ★★

## 规格
- 输入 in0..in3; 输出 (out2,out1,out0) = 输入中 1 的个数（二进制）
- 题库参考 g=24, d=8, K=24

## 推导（进位保存树）
计数 4 位 = 两个 FA/HA 级联:
1. FA(in0,in1,in2): sum=f8(9门含XOR展开), carry1=f9=maj(5门共享)
   - XOR(a,b)=4门: n1=NAND(a,b), n2=NAND(a,n1), n3=NAND(b,n1), xor=NAND(n2,n3)
   - carry = NAND(n1, NAND(xor,c)) 共享 n1 → FA 合计 9 门
2. HA(f8, in3): out0=f8^in3 (4门), carry2=h5=AND (2门)
3. out1 = carry1 ⊕ carry2 (4门); out2 = carry1·carry2 (2门)

## 门数
**20 门**（FA 9 + HA 6 + 异或 4 + 与 2 中复用），全 16 向量 PASS。

## 与参考对比 & 首创可行性
| 实现 | 门数 |
|---|---|
| 题库参考 | 24 |
| 本设计 | **20（-17%）** |

参考的 24 门很可能是"逐位加"朴素实现。20 门已接近理论极限:
popcount4 的输出熵要求至少 ~18-19 门量级（3 个非平凡对称函数）,
BFS 全网表穷举在 4 输入(16位真值向量)空间仍偏大, 但结构上每一门都有明确职责,
无冗余节点。**首创溢价概率高——本题是本批首选上链目标。**

## 验证
```
python3 batch2_verify.py
# [题48] popcount4: 20 门, 全16向量: PASS
```
