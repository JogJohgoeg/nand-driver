# TC16-P12-v1：12 位前缀候选 / 12-bit prefix candidate

2026-10-06，R24。它是独立数值候选，尚未替换在线演示、原 v1.1 或 P16 硬件。
基础仍是 [INT_SPEC.md](INT_SPEC.md) v1.1，SHA256
`b0b0ffe0ae8249a4fa053f65e8d6abc767d6b7c33005a46b1f9f0458832283c3`。
相同 TC16I001 权重/LUT blob 的 SHA256 为
`5a8415731e525ced7873198369c9138407631f4d0485b5e4d0314c55850478a1`。
blob 不编码此存储模式，须另标 `TC16-P12-v1`。
本轮质量回执的内部名 `TC16-P12-experiment` 指同一组规则与下列同一 C 源 SHA。

只有前缀 X 写入的规则变化，精确地在 embedding 和每层两次残差写回处执行：

```
v = S20(value)
code = clip(RNE(v / 256), -2048, 2047)   # signed12
X_read = code * 256                    # signed20，低八位接零
```

仍为最近偶数舍入，先 S20 后 RNE 和 sat12；不能截断或推迟到 block 末尾。
第一残差暂存在 A 时也先写 `X_read`，之后 n2 读取这个值。trace 记录解码值。
所有其他算子、权重、KV8、LUT、采样与窗口规则不变。

有效解码范围 [−524288, 524032]，皆为 256 的倍数。一般单次误差至多 128，
正顶部截断时最大 255。编码幂等。C16 银行为 64×384 bit，每行 32 个补码 s12，
lane0 占低 12 位；逻辑地址仍为 `4*token+chunk`。C32 是 128 行。
H/A 保持 s20，串行原位改写后用每 lane 的 [19:8] 送银行，不另加向量缓冲。
P16 写控制/存储宏尚未因此自动成为 P12 硬件，需要明确接入与逐拍验证。

C 候选由 `integer_opt/prefix_codec12.py` 从冻结 C 生成，SHA256
`36f0128d0abc78ea76ffa80c4a360b5bf07c4b98942bc5dccdf2f2ced1f22388`。
132 N 编码器对全部 1,048,576 输入逐位同 C；11 组完整 Python/C 前向与实际
截断负控通过。同 512 篇 C16 PPL 4.439650935（+0.872042%），C32 3.995206293
（+0.773624%），均低于相对冻结整数基线的 1% 门槛，但余量小于 P16。
见 [INT_OPT.md](INT_OPT.md)、[质量](evidence/integer_opt/prefix_precision12/quality.json)
与[等价](evidence/integer_opt/prefix_precision12/equivalence.json)。

**English.** Encode every X write as `sat12(RNE(S20(value)/256))`, decode by
an eight-bit left shift. This changes embedding and both residual storage
points; all other operators remain v1.1. The decoded first residual must
feed the next normalization. The fixed512-story C16/C32 regressions are
0.872042% /0.773624%, below the1% gate. This remains a separate candidate,
with its own profile ID; it is not the deployed demo or a physical result.
