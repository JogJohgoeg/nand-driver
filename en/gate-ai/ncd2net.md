# From graph to gates

> ncd2net compiles a neural network diagram into a netlist made only of two-input NAND gates, and checks it bit for bit.

::: buttons
- [Open the netlist bench](https://nand.aihashrate.stream/ncd2net/)
:::

On the netlist bench, every netlist is evaluated gate by gate in your browser, and you can compare it with the floating-point model right there. It doesn't connect to a server.

## What it does

The input is a pyncd diagram with its sizes set (pyncd is an open-source Python library that describes neural network structure with string diagrams). The output is a NAND netlist in TapeOut format.

1. Expand the diagram's structure into scalar integer operations (fixed point).
2. Track the range of every value and give each wire exactly enough bits, so nothing overflows.
3. Generate Verilog and map it to two-input NAND gates with the open-source synthesis tools yosys / abc.
4. Output the netlist, the integer weights, and the check results.

## Supported operators

| Operator in the diagram | How the gate circuit computes it |
|---|---|
| Linear layer | Integer multiply-add, then rounding and saturation |
| Embedding | One lookup table per output dimension |
| Causal softmax | Mask by row first, then normalize; exponent from a lookup table |
| LayerNorm | Exact sum; square root computed bit by bit (only add, subtract, and shift) |
| Add, ReLU | Add with fraction bits aligned / keep the positive part |

RoPE, SiLU, attention with sinks, Sinkhorn, and other operators were also added.

## How it is checked

1. **Bit for bit against the fixed-point reference.** If the input is at most 24 bits, test every input. Above that, run 100,000 random inputs.
2. **Formal equivalence.** A combinational equivalence check between the reference implementation and the NAND netlist. The result covers every input. Above 24 bits, this is the only proof.
3. **Against floating point.** Compare with pyncd's own torch compile (same integer weights) and measure the error. This step looks at precision; it is not an equivalence proof.

## Results (2026-09-17)

Format: activations 10 bits with 4 fraction bits; weights 4 bits with 3 fraction bits. Error unit is 1/16.

| Diagram | Input bits | NAND gates | Depth | Check | Mean error vs torch |
|---|---|---|---|---|---|
| Attention core | 24 | 1,024 | 94 | Exhaustive 2^24, match | 0.0037 |
| Attention block | 16 | 5,999 | 325 | Exhaustive 2^16, match | 0.021 |
| Feed-forward residual block | 8 | 674 | 61 | Exhaustive 2^8, match | 0.015 |
| One Transformer layer | 16 | 7,809 | 415 | Exhaustive 2^16, match | 0.024 |
| Full one-layer algebraic Transformer | 4 | 86 | 3 | Exhaustive 2^4, match | 0.021 |

> These are very small diagrams, only to show that the compile-and-check path works. Gate count grows with bit width and lookup table size. Division and square root cost the most.

## Next

- [Gate brain](index.md): a whole small model turned into gates, computed in the browser.
- [Netlist format](../reference/netlist.md): the byte format of TapeOut netlists.
