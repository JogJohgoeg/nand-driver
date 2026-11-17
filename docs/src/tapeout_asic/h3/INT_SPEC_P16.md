# TC16-P16-v1：前缀存储候选 / Prefix storage candidate

2026-10-06，R21/R22。该候选改变输出；当前在线演示和已排队版图仍使用原版。
基础规则为 [INT_SPEC.md](INT_SPEC.md) 的 v1.1，SHA256
`b0b0ffe0ae8249a4fa053f65e8d6abc767d6b7c33005a46b1f9f0458832283c3`。
权重/LUT blob 仍为 TC16I001，SHA256
`5a8415731e525ced7873198369c9138407631f4d0485b5e4d0314c55850478a1`。
blob 本身不携带此存储模式，使用者必须另标 `TC16-P16-v1`，不能仅凭 blob SHA
把两个数值模型说成相同。

唯一新增规则作用于前缀数组 X 的每次写回：

```
v = S20(value)                  # 原来的 s20 饱和
code = clip(RNE(v / 16), -32768, 32767)   # signed16
X_read = code * 16              # signed20，低四位接零
```

`RNE` 沿用原规范的最近偶数舍入，负数规则相同。先 S20、后除 16 和 sat16；
不可直接截断、改变次序或只在一个 block 的末尾执行。该规则精确应用于：

1. 每个 token 的 embedding 写入 X。
2. 每层 attention 输出投影与 X 相加后的第一次残差写回。
3. 每层 FFN 输出与 X 相加后的第二次残差写回。

其他算子和状态的位宽、权重、RNE、查表、KV 量化、采样与窗口规则均沿用基础
规范。尤其第一次残差更新后，n2 必须读取 `X_read`；若复用 A 暂存区，A 中的
相应值也必须先更新为 `code*16`。trace 记录读回值。写编码是幂等的，重复编码
已经读回的值不会再改变它。普通输入的单次存储误差不超过 8；正顶部截断时
最大误差 15。合法读回范围为 [−524288, 524272]，且始终是 16 的倍数。

C16 的物理前缀银行为 64 行，每行 32 个 s16，lane 0 占低 16 位、补码低位
优先；逻辑行 `4*token + chunk`，chunk 0..3。游标循环置换不改变逻辑地址。
C32 相应为 128 行。H/A 工作区仍容纳 s20；串行编码器逐元素读写原工作槽，
完成一个 32-lane chunk 后，才允许银行消费该槽每 lane 的 [19:4]，不另设向量
打包缓冲。写控制器 reset 中止当前事务，重新使用时须重填原工作槽。

参考 C 候选由 `integer_opt/prefix_codec.py` 从冻结 C 生成，SHA256
`6c2f9a4c9848e78c0535e2a9101163df36996e8d4ef29a37263d80c94dcd0f28`。
独立 Python 整层实现、全域编码器负控、同 512 篇 C16/C32 PPL，以及真实 packed
存储访问检查，见 [INT_OPT.md](INT_OPT.md) 和
[质量回执](evidence/integer_opt/prefix_precision/quality.json)。

**English.** This profile rounds only X storage, after embedding and both
residual writes in every block. Encode `sat16(RNE(S20(value)/16))`; decode by
shifting the signed code left by four. All other base operators are unchanged.
The first residual's decoded value must feed the next normalization, including
when it is staged in A. The numerical profile must be identified separately
from the unchanged weight-blob hash. It is a tested candidate, not the deployed
demo or a completed physical implementation.
