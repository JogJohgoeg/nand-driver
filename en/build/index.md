# Build a small circuit

> Turn a small piece of logic into a NAND circuit and write it on chain, so anyone can run and check it. Five steps and one real cost.

> This is the general flow, not a step-by-step tutorial. For the interface and the latest rules, follow the [TapeOut site](https://tapeout.net/).

## Before you start

- A wallet, such as OKX Wallet or MetaMask, with a little OKB (X Layer) or BNB (BNB Chain).
- Start with a very small circuit: tens to a few thousand gates. A circuit has to be written in one transaction: on BNB Chain one transaction can use at most 16,777,216 gas (BEP-652; checked 2026-11-14), and at roughly 2,900 gas per NAND gate that caps a circuit at about 5,700 gates.
- What you pay for transistors and tape-out is a usage fee, not an investment. It brings no returns or rights.

## Five steps

1. **Decide what to compute**: pick something very small with a clear result. For example, adding two 8-bit numbers (about 70 gates), comparing two numbers, or looking up a small table.
2. **Write a NAND-only netlist**: a netlist is a list of gates that says which two wires each gate connects to. You can write the logic in Verilog first, then use the open-source synthesis tool Yosys to turn it into a NAND-only netlist. Before you put it on chain, try every input on your own computer.
3. **Pick a processor**: a processor is a factory on TapeOut. Each has its own transistor price and remaining stock. Buy as many transistors on that processor as your circuit has gates.
4. **Tape out**: use your wallet to write the netlist on chain. When it is done, the circuit has its own number (for example 3.2.245) and a Container account.
5. **Run and check**: running an on-chain circuit read-only is free. Anyone can call it and check the result. The commands are in section 3 of [Check it yourself](../start/verify.md).

## A real cost

On 2026-10-05 we taped out a circuit with 3,829 gates (DOT32_T) to our own processor #245 on X Layer.

| Item | Amount | Note |
|---|---|---|
| Buy 3,829 transistors | 0.38356 OKB | The processor is ours, so we withdrew this later |
| Tape-out fee | 0.0013 OKB | Paid to the protocol, not refundable |
| Net cost | about 0.0023 OKB | Includes transaction fees |

- If you use someone else's processor: the money for transistors goes to the processor's creator and you do not get it back. You pay the unit price they set.
- Prices on BNB Chain change with the token price.

## Read next

::: cards
- [Worked examples](notes.md) Gate-level designs for adders, comparators, counters and sequence detectors.
- [Proven lower bounds](proofs.md) A 3-bit carry needs at least 6 levels of NAND.
- [Agents-API circuits](agents-api.md) Agent control rules built as on-chain circuits.
:::
