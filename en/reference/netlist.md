# Netlist format

> A TapeOut circuit's netlist is a list of two-input NAND gates: pairs says which two wires each gate connects to, taps says which wires the outputs come from.

## Fields

| Field | Type | Meaning |
|---|---|---|
| `pairs` | `[[a, b], …]` | NAND gates in order. `pairs[i] = [a, b]` means this gate's output = NAND(wire a, wire b). Required |
| `taps` | `[int, …]` | Which wire output o comes from. Required |
| `nIn` | int | Number of inputs |
| `nOut` | int | Number of outputs, equal to `len(taps)` |
| `g` | int | Number of gates, equal to `len(pairs)` |
| `d` | int | Depth: the largest depth among all output wires |
| `C` | int | Cost `g · d³` |
| `srcId` or `id` | int | Problem number. Different files use different key names for the same thing |
| `last_outs` | bool | Whether the outputs are exactly the last `nOut` gates |

The on-chain format adds:

| Field | Meaning |
|---|---|
| `enc` | `"chain"` |
| `n_base` | `2 + nIn`: the constants ZERO and ONE plus the inputs |
| `nl_hex` | The on-chain netlist bytes in hexadecimal, starting with `0x` |
| `nl_len` | Number of bytes `nl_hex` decodes to |

## Wire numbers

There are two numberings; they differ in the constants.

**Inputs from 0** (common in design tool output):

| Wire | What it is | Depth |
|---|---|---|
| `0 … nIn−1` | Inputs `in0 … in{nIn−1}` | 0 |
| `nIn + i` | Gate i | `1 + max(depth a, depth b)` |

**On-chain format** (constants take 0 and 1):

| Wire | What it is | Depth |
|---|---|---|
| `0` | Constant ZERO, not a gate | 0 |
| `1` | Constant ONE, not a gate | 0 |
| `2 … nIn+1` | Inputs | 0 |
| `n_base + i` | Gate i, counted in `g` | `1 + max(depth a, depth b)` |

## Gates

```text
val[w] = 1 − (val[a] & val[b])
```

- There is only one kind of gate: the two-input NAND.
- `NAND(x, x) = NOT(x)`. That is how inversion works; there is no separate polarity field.
- A gate's two inputs may only refer to wires that already exist: inputs, constants or earlier gates.
- The order of the two inputs doesn't change the result, and no order is enforced.

## Depth and cost

- Inputs and constants have depth 0; a gate's depth = 1 + the larger depth of its two inputs.
- `d` = the largest depth among all output wires.
- `C = g · d³`. `g` doesn't count the constants ZERO and ONE.

## Outputs must be the last gates

The on-chain format requires `taps` to be exactly the last `nOut` gates:

```text
base = nIn (inputs from 0) or n_base (on-chain format)
taps == [base + g − nOut, …, base + g − 1], and 0 < nOut ≤ g
```

If not, convert first: copy the output gates to the end, then delete gates nobody uses. Conversion may add gates or depth, so the cost is computed from `g` and `d` after conversion.

## On-chain netlist bytes (`nl_hex`)

A pure NAND netlist uses 7 bytes per gate:

| Offset | Length | Content |
|---|---|---|
| 0 | 1 | opcode, `0` = NAND2 |
| 1 | 3 | Wire number of input a, big-endian |
| 4 | 3 | Wire number of input b, big-endian |

Total length = `g × 7`. Wire numbers are in the on-chain format.

## Truth table bit order

- `in0` is the lowest bit of the input combination number.
- In the hexadecimal of the official vectors, `in_k` is bit `k % 8` of byte `k // 8`.

## Example

One circuit with 6 inputs and 3 outputs, in both formats:

| Item | Inputs from 0 | On-chain format |
|---|---|---|
| `nIn`, `nOut` | 6, 3 | 6, 3 |
| `g`, `d` | 47, 8 | 47, 8 |
| `C` | 24,064 = 47 × 8³ | Same as left |
| `n_base` | — | 8 |
| First three gates | `[0,0]`, `[2,2]`, `[6,7]` | `[2,2]`, `[4,4]`, `[8,9]` |
| `taps` | `[50, 51, 52]` = starting at 6 + 47 − 3 | `[52, 53, 54]` = starting at 8 + 47 − 3 |
| `nl_len` | — | 329 = 47 × 7 |
| Start of `nl_hex` | — | `0x00 000002 000002 …` (the first gate, NAND(2, 2)) |

## Invalid netlists

- `len(taps) ≠ nOut`
- `g ≠ len(pairs)`
- `C ≠ g · d³`
- A gate refers to a wire that only comes later (a loop, or undefined)

## Not decided yet

- The full table of on-chain opcodes besides `0` (LATCH and others for sequential circuits).
- An explicit version field `schema_version` and a wire-numbering field `wire_base`: only proposals, not used yet.
