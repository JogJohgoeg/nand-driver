# Agents-API session controller v2 — report

Local combinational map of `spec.logic` through Yosys/ABC NAND, exhaustive 2^26
equivalence, then wrap as `Circuit(16, 15)` with 10 latches. No RPC, no wallet,
no `tapeout`.

## ABC variants (after `extract_nand_netlist` + `dce`)

| name | script | nNand | depth |
|---|---|---|---|
| plain | `synth -top top; abc -g NAND; opt_clean` | **147** | 26 |
| opt_full | `synth; opt -full; abc -g NAND; opt_clean` | 147 | 26 |
| abc2 | two `abc -g NAND` passes | 147 | 26 |
| abc3 | three `abc -g NAND` passes | 147 | 26 |
| nofsm | `synth -nofsm; abc -g NAND` | 147 | 26 |
| flatten | `synth -flatten; abc -g NAND` | 147 | 26 |
| D6 / D8 / D10 / D12 / D16 / D20 | `abc -g NAND -D N` | 147 | 26 |
| opt_full_abc2 | `opt -full` then two `abc` | 147 | 26 |
| flatten_opt | flatten + `opt -full` + `abc` | 147 | 26 |
| aigmap | `synth; aigmap; abc -g NAND` | 147 | 26 |
| abc9 | `synth -abc9` | FAIL (FPGA-only) | — |

Kept **plain** (tied for fewest NAND). Comb netlist: **147 NAND, depth 26**.

## Final wrapped netlist

- `nIn=16` observations, `nOut=15` actions, `nLatch=10` / `nState=10`
- comb 147 NAND + `make_outputs_last` (next-state taps then actions; last 15
  gates = `spec.OUT`) + `Circuit.outputs` identity buffers
- **nNand=189**, nLatch=10, nl 1363 bytes
- Farm inputs 0..15 → official wires 2..17; farm 16..25 → the 10 latch wires

## Verification

- 4096 random scalar comb vectors vs `spec.logic`: **0 mismatches**
- Exhaustive bigint truth table over all **2^26** input/state rows
  (`~(a&b)&MASK` vs `spec.logic(..., MASK)`): **0 mismatches**
- Wrapped `c.step` vs `spec.step_scalar`: 20000 random (state, input) pairs
  plus all 2^16 inputs from the zero state: **0 mismatches**

## Sample trace

`env1=1, env0=0` = partner sandbox, latched on the first step (turns stay 0
because that step is `tool_search`, not `call_model`). An opening idle
`call_model` plus retry/secret/3×spawn/`sub_done` would saturate `turns_max=7`
and abort before compact; the first observation therefore latches env and
searches in one step. `env_sel1` stays 1 thereafter.

| step | phase | actions | note |
|---|---|---|---|
| 0 | MODEL | tool_search, env_sel1 | start (env=partner sandbox) → tool search |
| 1 | MODEL | run_mcp, tool_parallel, env_sel1 | mcp tool batch |
| 2 | TOOL | run_mcp, tool_parallel, env_sel1 | tool fails once |
| 3 | TOOL | call_model, env_sel1 | retry ok |
| 4 | MODEL | call_model, vault_grant, env_sel1 | secret request granted |
| 5 | MODEL | call_model, spawn_sub, env_sel1 | spawn sub 1/3 |
| 6 | MODEL | call_model, spawn_sub, env_sel1 | spawn sub 2/3 |
| 7 | MODEL | call_model, spawn_sub, env_sel1 | spawn sub 3/3 |
| 8 | MODEL | wait_sub, env_sel1 | 4th request waits |
| 9 | SUB | call_model, env_sel1 | one finishes / continues |
| 10 | MODEL | compact, env_sel1 | compact |
| 11 | MODEL | finish, pay, env_sel1 | model done + judge ok |
| 12 | DONE | env_sel1 | DONE ignores further input |

RESULT nNand=189 nLatch=10 exhaustive=0 mismatches
