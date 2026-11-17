# 题209: 16-4 优先编码器（高级, comb, 16入4出）

## 规格（与题24同约定）
- 输入 in0..in15, **in15 优先级最高**（编号 = 置位下标）
- 输出 out3..out0 = 最高有效请求位的二进制编号
- 全零输入 → 0000（本实现实测如此，与规格一致；上链前无需再确认）
- 题库参考 g=124, d=37, K=124, C=6.28M

## 结构：递归分治树（NAND-only）
enc(width) 返回 (V 有效信号, code 高位在前):
- width=1: V=in（tap, 0 门）, code=[]
- merge(Vh,ch; Vl,cl):
    - nv  = NOT Vh                       (1 门)
    - 结果最高位 = Vh                     (免费 tap)
    - 每编码位: t1=NAND(ch_i,Vh), t2=NAND(cl_i,nv), out=NAND(t1,t2)   (每位 3 门)
    - nvl = NOT Vl; V = NAND(nv,nvl)     (2 门)

门数递推 T(n)=2T(n/2)+3log2(n)+2, T(1)=0:
T(2)=2? 实测: T(2)=2(两个NOT)+... 总计 **78 门**。

## 验证
```
python3 solve_shift_penc16.py
# [#209 penc16] gates=78 ref=124 (-37.1%) verify=PASS vectors=65536
```
- 全 65536 向量 PASS（2026-08-23 夜班）
- 全零输入输出 0000 ✓
- 抽查: in=1→000, in=2→001(bit序 out0=LSB), in=513(in9&in0)→1001 ✓

## 结论
**-37.1% 首创候选 ★★★**（比参考少 46 门）。C/g = 6280972/78 ≈ 80525，
为当前所有已完成设计的价值密度之最。Genesis 零工本优先上链。
