# TBW1 weight format

> TBW1 is the model machine's weight file: a fixed binary layout. The whole file goes on chain as is, goes into memory as is, and is read directly by the binary multiply-accumulate unit.

## Overview

- Everything is little-endian.
- The file starts with a 64-byte header, followed by the tensor table, 64 bytes per entry.
- Each tensor's data starts at a multiple of 4096, and gaps are filled with 0. So memory bursts line up with 4 KB pages, and the file can be cut anywhere into the 24,000-byte chunks used on chain.
- Sizes and offsets are all u32, so a file is at most 4 GB.

## File header (64 bytes)

| Offset | Length | Field | Description |
|---|---|---|---|
| 0 | 4 | `magic` | ASCII `TBW1` |
| 4 | 2 | `version` | u16, `1` |
| 6 | 2 | `n_tensors` | u16, number of tensors |
| 8 | 4 | `align` | u32, `4096` |
| 12 | 4 | `file_size` | u32, size of the whole file in bytes |
| 16 | 32 | `model_id` | sha256 of the training config (a converted model holds the sha256 of its source file, for provenance only) |
| 48 | 16 | Reserved | Filled with 0 |

## Tensor table entry (64 bytes)

Entry i is at offset `64 + 64·i`.

| Offset | Type | Field | Description |
|---|---|---|---|
| 0 | u32 | `id` | Index |
| 4 | u8 | `kind` | Data type, see the table below |
| 5 | u8 | `flags` | Flags; must be 0 for TRI2SL |
| 6 | u16 | `group` | Inputs per group when `scale_kind = 3` |
| 8 | u32 | `rows` | Number of rows (output channels) |
| 12 | u32 | `cols` | Number of columns (inputs) |
| 16 | u32 | `offset` | Start of the data, 4096-aligned |
| 20 | u32 | `bytes` | Size of the data in bytes |
| 24 | u32 | `scale_offset` | Start of the scale table; 0 if there is none |
| 28 | u8 | `scale_kind` | Scaling method, see the table below |
| 29 | char[27] | `name` | Tensor name, padded with 0 |
| 56 | u8 | `layout` | Only meaningful for `kind = 4`, `1` = q2sl v1; 0 for every other type |
| 57 | 7 bytes | Reserved | Filled with 0 |

## kind

| Value | Name | Per element | Used for |
|---|---|---|---|
| 0 | BIN1 | 1 bit, ±1 | Binary linear layers |
| 1 | INT8 | 1 byte, two's complement | Embedding, output head |
| 2 | INT16 | 2 bytes | norm, bias, config, lookup tables |
| 3 | FP16 | 2 bytes | Non-binary parts |
| 4 | TRI2SL | Ternary, 2-bit slices | Ternary models (only for the runtime on ARM small computers) |
| 5 | FP32 | 4 bytes | A ternary model's norm, stored as is |

## How BIN1 bits are laid out

1. Row-major: row r holds the weights of output channel r.
2. Each row is padded to a whole multiple of 64 bits: `row_words = ceil(cols / 64)`, so a row is `row_words × 8` bytes.
3. Each 64-bit word is stored little-endian. Bit i of word w maps to input `64·w + i`.
4. A 1 bit means +1, a 0 bit means −1.
5. Padding bits are always 0; the multiply-accumulate unit cuts off at `cols`.

Example: a 512-row × 384-column BIN1 tensor has 6 words, 48 bytes, per row, for 24,576 bytes in total.

## scale_kind

| Value | Meaning | Output |
|---|---|---|
| 0 | No scaling | `y = acc` |
| 1 | One int16 per row, Q8.8 | `y = (acc · s_r) >> 8` |
| 2 | One int8 shift amount k per row | `y = acc << k` when k ≥ 0, otherwise `y = acc >> −k` |
| 3 | One int16 per group, Q8.8 | `y = (Σ_g acc_g · s_rg) >> 8`, one group per `group` inputs |

- `>>` is always an arithmetic right shift, rounding toward negative infinity. Intermediate values are computed exactly as int64, and the low 32 bits are kept at the end.
- When `scale_kind = 3`, `group` is a multiple of 64, and the scale table is row-major as `[rows][ceil(cols/group)]`.
- The scale table is int16, stored at `scale_offset`, also 4096-aligned.
- 2 is not recommended: pure powers of 2 raised Bonsai's perplexity by 65%. Use 3 with `group = 128` by default.

## What the multiply-accumulate unit computes

When the input x is a bit vector (1 means +1):

```text
acc = cnt − 2·popcount((x XOR w_r) & mask)      cnt is the number of inputs taking part
```

When the input is an n-bit two's complement integer (n = 2–16), x is stored as bit planes; plane b holds bit b of every x_i:

```text
P_b = 2·popcount(x_b & w_r & mask) − popcount(x_b & mask)
acc = Σ_{b<n−1} 2^b·P_b − 2^{n−1}·P_{n−1}        i.e. Σ_i w_i·x_i
```

Each plane is laid out like one BIN1 row: 64-bit little-endian, padding bits 0, and plane b starts at `X_ADDR + b·row_words·8`.

## profile: tell the model by its tensor names

| Has this tensor | profile | Runs on |
|---|---|---|
| `q3.cfg` | q3s6, ternary Qwen3 | s6rt on ARM small computers |
| `qexp` | tbt1, binary Transformer | TBRT, the model machine runtime |
| `cfg8` | w1a8 | TBRT |
| None of these | bmlp, toy model | TBRT |

## Example: the toy model

[toy_bmlp.tbw1](../../machine/toy_bmlp.tbw1), 102,400 bytes, sha256 `11c1c4b177a2308ee64732335335e044e4cf32ce0ddef75210b0d5fa4f5ed568`. It is the one that runs on the [model machine page](../machine/index.md).

```sh List the file header and tensor table using only the Python standard library
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

Output:

| id | Name | kind | Rows × columns | offset | bytes | scale_kind |
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

The first line prints `b'TBW1' 1 10 4096 102400 102400`: version 1, 10 tensors, alignment 4096, and both the recorded size and the actual size are 102,400.
