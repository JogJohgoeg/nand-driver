# Task 061 — 4×4 乘法器 (NAND-only)

## 结论
**124 门 = 参考持平**（无溢价）。全 256 向量 PASS。
- 贪心调度基线: 140 门（v3/v6，劣于参考，弃用）
- **DP 最优调度: 124 门**（solve_task061_dp.py）

## 结构
- PP 与门: 16 × 2 门 = 32
- FA(9门)×8 = 72, HA(5门)×4 = 20
- 合计 **124**

### 关键点 1: 真·9 门 FA（含 cout）
此前实现是 11 门（5 门 xor + 单独 xu 进位门）。正确结构共享 `p=~(x·c)`:
```
n1=~ab; n2=a~ab; n3=b~ab; x=nand(n2,n3)   # 4门 xor
p=~xc; q=~(x p); r=~(c p); s=nand(q,r)     # 4门 xor(x,c)
cout=NAND(n1, p)=ab|x·c                    # 1门, 免费!
```
8 门下界已穷举证伪（值空间 BFS 到深度 8, ~295万状态无解）。

### 关键点 2: 压缩调度 DP
列初始高度 [1,2,3,4,3,2,1]，FA 净 -2/列、HA 净 -1/列、carry=fa+ha 下移。
DP 最优: fa/ha per col = (0,0),(0,1),(1,1),(2,1),(2,1),(2,0),(1,0)
→ FA=8, HA=4。贪心（v3 的逐列吃满）多用了 FA。

### 审计教训
"对称部分积复用"（pp(i,j) vs pp(j,i) 共享与门）是伪优化——
A_i·B_j 与 A_j·B_i 是不同的 NAND 门，不可合并。（v4/v5 已废弃）

## 后续
124 持平参考、无溢价；Genesis 上链零工本可做，Behemoth/TapeOut 不值得烧。
若未来发现 <124 结构（如 PP 补码 Booth 编码融合）再升级。

验证: `python3 solve_task061_dp.py` → gates=124 ref=124 verify=PASS (256/256)
