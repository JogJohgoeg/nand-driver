# One-step LM burn kit

Primary information: six LM netlists, their exact counts, the measured gas slopes and the
tapeout(bytes,uint32,uint32) calldata for each. The user burns; this agent sends nothing.

Required context: gas per step = 2,293 x NAND and gas to burn = 2,923 x NAND, both
MEASURED on a local CPU calibrated against the chain at 0.27% (local_cpu_gas.json), and the
BSC block gas limit is 68,444,479. The burn is the binding constraint: about 23,400 NAND per
transaction, against about 29,900 for a step.

Next judgement: burn v0_4k first (11.8 M to burn, 9.3 M per step) as the cheapest anchor that
replaces the model with a chain measurement; v1_23k is the best text that still fits one
transaction; v1_29k and v0 stay documented boundaries, not candidates.

| netlist | NAND | nIn | top-1 | step gas | burn gas | one tx | calldata |
|---|---:|---:|---:|---:|---:|---|---:|
| netlist_resyn_v0_4k_resyn.json | 1935 | 200 | 0.3138 | 4,458,014 | 5,722,670 | yes | 13,700 B |
| netlist_resyn_cap_s.json | 5069 | 200 | 0.3544 | 11,623,217 | 14,767,658 | yes | 35,620 B |
| netlist_resyn_cap_s4.json | 5120 | 200 | 0.3589 | 11,740,160 | 14,915,747 | yes | 35,972 B |
| netlist_resyn_netlist_v1_23k_resyn.json | 9043 | 200 | 0.38 | 20,735,599 | 26,432,689 | yes | 63,460 B |
| netlist_resyn_g44_resyn.json | 19567 | 192 | 0.4154 | 45,738,885 | 56,976,135 | yes | 137,124 B |
| netlist_resyn_s41_resyn.json | 20073 | 200 | 0.389 | 46,892,415 | 58,407,619 | yes | 140,644 B |
| netlist_resyn_netlist_v0_resyn.json | 17905 | 192 | 0.4259 | 41,056,165 | 52,336,315 | yes | 125,476 B |

## How to burn, step and check

1. tapeout(bytes nl, uint32 nIn, uint32 nOut), selector 0x7bd3ac1d, with the calldata in burn_calldata/<netlist>.tapeout.txt (one 0x... string per netlist).
2. circuitInfo(cid) must report (nIn, nOut, 0 latches, NAND) as in the table.
3. One character per step: step(cid, empty, packed_context) with 25 bytes (200 bits) for the
   ladder rows or 24 bytes (192 bits) for v0; bit i is bit i%8 of byte i/8; the random byte
   is bits 192..199, and all-zero bits reproduce the greedy argmax.
4. Re-check with: python3 compile_lm.py --model <model>.json --rules <model>_rules.json
   (bit-exactness against the discrete reference) and the sample text in samples_v0.txt.

## Boundaries

* Burn gas is a DIRECT measurement for v0_4k, v1_23k and v1_29k (burn_revert_probe.py, fresh local CPU) and the measured slope times NAND for the rest; a step measurement exists for v0_4k
  (9,292,259 gas for 4,053 NAND) and for the chain's 632-NAND anchor (0.27% agreement).
* Burning v1_29k or v0 in one transaction exceeds the block gas limit; chunked burning is
  not offered by the CPU's tapeout entry point.
* The models are deterministic 4-gram backoff tables with in-netlist sampling; byte 0 gives
  the greedy prediction, which is what the reported top-1 measures.

