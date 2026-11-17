# TBW1 权重格式

> TBW1 是模型机的权重文件：固定的二进制布局，整个文件原样上链、原样放进内存、被二值乘加单元直接读。

## 总体

- 全部小端。
- 开头 64 字节文件头，紧跟张量表，每项 64 字节。
- 每个张量的数据从 4096 的倍数开始，空隙填 0。所以内存突发和 4 KB 页对得上，链上 24,000 字节一块可以任意切。
- 大小和偏移都是 u32，文件上限 4 GB。

## 文件头（64 字节）

| 偏移 | 长度 | 字段 | 说明 |
|---|---|---|---|
| 0 | 4 | `magic` | ASCII `TBW1` |
| 4 | 2 | `version` | u16，`1` |
| 6 | 2 | `n_tensors` | u16，张量个数 |
| 8 | 4 | `align` | u32，`4096` |
| 12 | 4 | `file_size` | u32，整个文件的字节数 |
| 16 | 32 | `model_id` | 训练配置的 sha256（转换来的模型填源文件的 sha256，只作溯源） |
| 48 | 16 | 保留 | 填 0 |

## 张量表项（64 字节）

第 i 项在偏移 `64 + 64·i`。

| 偏移 | 类型 | 字段 | 说明 |
|---|---|---|---|
| 0 | u32 | `id` | 序号 |
| 4 | u8 | `kind` | 数据类型，见下表 |
| 5 | u8 | `flags` | 标志；TRI2SL 必须为 0 |
| 6 | u16 | `group` | `scale_kind = 3` 时每组几个输入 |
| 8 | u32 | `rows` | 行数（输出通道） |
| 12 | u32 | `cols` | 列数（输入） |
| 16 | u32 | `offset` | 数据起点，4096 对齐 |
| 20 | u32 | `bytes` | 数据字节数 |
| 24 | u32 | `scale_offset` | 缩放表起点；没有填 0 |
| 28 | u8 | `scale_kind` | 缩放方式，见下表 |
| 29 | char[27] | `name` | 张量名，不足补 0 |
| 56 | u8 | `layout` | 只对 `kind = 4` 有意义，`1` = q2sl v1；其余类型填 0 |
| 57 | 7 字节 | 保留 | 填 0 |

## kind

| 值 | 名字 | 每个元素 | 用在哪 |
|---|---|---|---|
| 0 | BIN1 | 1 位，±1 | 二值线性层 |
| 1 | INT8 | 1 字节，二补码 | 嵌入、输出头 |
| 2 | INT16 | 2 字节 | norm、偏置、配置、查找表 |
| 3 | FP16 | 2 字节 | 非二值部分 |
| 4 | TRI2SL | 三值，2 位切片 | 三值模型（只给 ARM 小电脑上的运行时） |
| 5 | FP32 | 4 字节 | 三值模型的 norm 原样存 |

## BIN1 位怎么排

1. 行优先，第 r 行是第 r 个输出通道的权重。
2. 每行补到 64 位的整数倍：`row_words = ceil(cols / 64)`，一行 `row_words × 8` 字节。
3. 每个 64 位字按小端存。第 w 个字的第 i 位对应输入 `64·w + i`。
4. 位为 1 表示 +1，位为 0 表示 −1。
5. 补位一律为 0，乘加单元按 `cols` 截断。

例：512 行 × 384 列的 BIN1，每行 6 个字、48 字节，共 24,576 字节。

## scale_kind

| 值 | 含义 | 输出 |
|---|---|---|
| 0 | 不缩放 | `y = acc` |
| 1 | 每行一个 int16，Q8.8 | `y = (acc · s_r) >> 8` |
| 2 | 每行一个 int8 移位量 k | k ≥ 0 时 `y = acc << k`，否则 `y = acc >> −k` |
| 3 | 每组一个 int16，Q8.8 | `y = (Σ_g acc_g · s_rg) >> 8`，每 `group` 个输入一组 |

- `>>` 一律是算术右移，向负无穷取整。中间值按 int64 精确算，最后取低 32 位。
- `scale_kind = 3` 时 `group` 是 64 的倍数，缩放表行优先排成 `[rows][ceil(cols/group)]`。
- 缩放表是 int16，放在 `scale_offset`，同样 4096 对齐。
- 不推荐 2：纯 2 的幂把 Bonsai 的困惑度拉高了 65%。默认用 3、`group = 128`。

## 乘加单元算什么

输入 x 是位向量（1 表示 +1）时：

```text
acc = cnt − 2·popcount((x XOR w_r) & mask)      cnt 是参与的输入个数
```

输入是 n 位二补码整数（n = 2–16）时，x 按位平面存，平面 b 是所有 x_i 的第 b 位：

```text
P_b = 2·popcount(x_b & w_r & mask) − popcount(x_b & mask)
acc = Σ_{b<n−1} 2^b·P_b − 2^{n−1}·P_{n−1}        即 Σ_i w_i·x_i
```

每个平面和 BIN1 的一行同样排：64 位小端，补位为 0，平面 b 从 `X_ADDR + b·row_words·8` 开始。

## profile：看张量名认模型

| 有这个张量 | profile | 给谁跑 |
|---|---|---|
| `q3.cfg` | q3s6，三值 Qwen3 | ARM 小电脑上的 s6rt |
| `qexp` | tbt1，二值 Transformer | 模型机运行时 TBRT |
| `cfg8` | w1a8 | TBRT |
| 都没有 | bmlp，玩具模型 | TBRT |

## 例子：玩具模型

[toy_bmlp.tbw1](../machine/toy_bmlp.tbw1)，102,400 字节，sha256 `11c1c4b177a2308ee64732335335e044e4cf32ce0ddef75210b0d5fa4f5ed568`。就是[模型机页](../machine/index.md)里跑的那个。

```sh 只用 Python 标准库，列出文件头和张量表
python3 - toy_bmlp.tbw1 <<'EOF'
import struct, sys
b = open(sys.argv[1], 'rb').read()
magic, ver, n, align, size = struct.unpack_from('<4sHHII', b, 0)
print(magic, ver, n, align, size, len(b))
for i in range(n):
    tid, kind, flags, group, rows, cols, off, nb, s_off, sk, name, layout = struct.unpack_from('<IBBHIIIIIB27sB7x', b, 64 + 64 * i)
    print(tid, name.rstrip(b'\0').decode(), kind, f'{rows}x{cols}', hex(off), nb, sk)
EOF
```

输出：

| id | 名字 | kind | 行 × 列 | offset | bytes | scale_kind |
|---|---|---|---|---|---|---|
| 0 | `emb` | INT8 | 128 × 16 | `0x1000` | 2,048 | 0 |
| 1 | `h0` | BIN1 | 512 × 384 | `0x2000` | 24,576 | 0 |
| 2 | `h0.b` | INT16 | 512 × 1 | `0x8000` | 1,024 | 0 |
| 3 | `h1` | BIN1 | 512 × 512 | `0x9000` | 32,768 | 0 |
| 4 | `h1.b` | INT16 | 512 × 1 | `0x11000` | 1,024 | 0 |
| 5 | `out` | BIN1 | 128 × 512 | `0x12000` | 8,192 | 1 |
| 6 | `out.b` | INT16 | 128 × 1 | `0x15000` | 256 | 0 |
| 7 | `samp.lut` | INT16 | 256 × 1 | `0x16000` | 512 | 0 |
| 8 | `prompt` | INT8 | 16 × 1 | `0x17000` | 16 | 0 |
| 9 | `cfg` | INT16 | 8 × 1 | `0x18000` | 16 | 0 |

第一行打印 `b'TBW1' 1 10 4096 102400 102400`：版本 1，10 个张量，对齐 4096，登记大小和实际大小都是 102,400。
