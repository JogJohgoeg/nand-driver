# One-tile MiniCPM datapath and RLT-mini submission candidate

**Primary information:** both required blocks fit in **one IHP SG13G2 Tiny Tapeout tile**. The routed netlist passes the pin-level conformance test; the GDS passes the official precheck. This is a local submission candidate, not a submitted or manufactured chip.

**Required context:** RLT-mini is an untrained four-token recurrent toy. The MiniCPM block performs real checkpoint-derived, signed int8 × int4 projection arithmetic with host-supplied operands. Physical verification, model provenance, transport speed and the remaining clock-fanout warning determine what the demonstration establishes.

**Next judgement:** decide whether this precisely bounded demonstration warrants an IHP26b submission: **€385 Academic/Industry, or €185 if eligible for Individual pricing**, including one development kit and the calculator's shipping line. The published deadline is **2026-09-21**. No purchase or submission has been made.

Expression: one submission detail, with a field-by-field process comparison and an ordered acceptance list. Updated 2026-09-13. Reader: the project owner deciding whether to submit and the engineer reproducing the evidence.

## What will be on silicon

The [block diagram and pin protocol](docs/info.md) describe the shared synchronous serial bus. The external clock is also the serial bit clock; the design has no internally generated or asynchronous serial clock. All 8 bidirectional pins are outputs in this design.

**RLT-mini hard logic:** a causal encoder and recurrent decoder, two-dimensional binary latent, four-token vocabulary, two-entry encoder and decoder attention windows, integer Q2 softmax lookup and fixed feedforward mixing. Seven flip-flops retain the complete recurrent state. Fast mode accepts one token each enabled clock; serial mode takes 16 clocks per token. The [independent reference](rlt_reference.py) enumerates all 512 state/input transitions. The equivalent TapeOut netlist contains **103 NANDs and 7 LATCHes, depth 15**. This is a structural model with fixed toy weights, not a trained language model or the full published RLT architecture.

**MiniCPM datapath:** signed 8-bit activation × signed 4-bit weight, exact 12-bit product, signed 32-bit accumulator and 13-bit row sequencer. It accepts row lengths 1–4095 or 6144. MiniCPM5-2B's actual hidden size is **2048**, FFN width **6144**, GQA heads **16 query / 2 KV**, head dimension **128**, and layer count **42**. The host supplies weights and activations, scaling, RMSNorm and SiLU. No model-weight SRAM is needed on this tile. Uniform int4 operands do not implement GGUF Q4_K_M block decoding. [Pinned official configuration](https://huggingface.co/openbmb/MiniCPM5-2B/blob/12a3808a956f869c767195e9266b59c4d21d92e2/config.json)

The physical tile intentionally contains these two required blocks and their transport. NEE, #279, a RISC-V referee and a trace hash unit are outside this candidate.

## Tile choice and physical evidence

| Field | IHP SG13G2 — selected | SKY130 — comparison |
|---|---:|---:|
| Required tiles | **1 × 1** | 1 × 1 |
| Official tile boundary | 202.08 × 154.98 µm | 161 × 111.52 µm |
| Tile area | 31,318.36 µm² | 17,954.72 µm² |
| Open-source flow | LibreLane 3.0.3 | OpenLane 2.3.10 |
| Placement density setting | 60% | 62% |
| Final standard-cell area, excluding fill | 21,025.3 µm² | 9,889.48 µm² |
| Final standard-cell count, excluding fill | 1,448 | 1,299 |
| Core utilization, excluding fill | 72.65% | 59.96% |
| Clock constraint | 100 ns / 10 MHz | 100 ns / 10 MHz |
| Worst setup slack across reported corners | +73.0449 ns | +67.7084 ns |
| Worst hold slack across reported corners | +0.110778 ns | +0.105923 ns |
| Setup / hold / slew / capacitance violations | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Remaining maximum-fanout violations | 1 | 4 |
| Final LVS errors | 0 | 0 |
| Official GDS precheck | **PASS** | **PASS** |
| Vectorless STA total power estimate | 0.157924 mW | 0.126617 mW |

The official [IHP geometry](https://github.com/TinyTapeout/tt-support-tools/blob/01d5d2814fa9dd61e9d211e0b235a4a592a9316a/tech/ihp-sg13g2/tile_sizes.yaml) and [SKY geometry](https://github.com/TinyTapeout/tt-support-tools/blob/01d5d2814fa9dd61e9d211e0b235a4a592a9316a/tech/sky130A/tile_sizes.yaml) govern this comparison. Extra tile sizes are supported; **N = 1 is justified by completed placement/routing and precheck**, not generic gate count. SKY initially failed placement at 60% density and completed at 62%.

Evidence: [IHP metrics](physical/ihp1/metrics.json), [SKY metrics](physical/sky1/metrics.json), [IHP precheck](physical/ihp1/precheck.log), [SKY precheck](physical/sky1/precheck.log), [IHP GDS](physical/ihp1/tt_um_tapeout_models.gds), [IHP layout render](physical/ihp1/tt_um_tapeout_models.png). The IHP raw total-instance area includes 7,916.23 µm² of filler, bringing it to the 28,941.5 µm² core area; comparing that number with SKY's non-fill area would be misleading.

The IHP timing corners are fast 1.32 V / −40°C, typical 1.20 V / 25°C and slow 1.08 V / 125°C, using nominal extracted interconnect. Constraints include 20 ns input/output delays. The flow summary's register-to-register setup field is N/A because its endpoint-unique selection chooses longer input paths. Explicit register-to-register queries give **+92.2082 ns worst setup and +0.110778 ns worst hold**; see [slow-corner report](physical/ihp1/r2r_slow_1p08V_125C.log) and [fast-corner report](physical/ihp1/r2r_fast_1p32V_m40C.log). No maximum-frequency claim is inferred from slack.

The remaining IHP fanout warning is **`clkbuf_0_clk/X`: fanout 16 against limit 8**. It has no accompanying slew, capacitance or timing violation, and precheck passes. It remains a disclosed signoff exception for operator review, not a claim of warning-free closure. The IHP template disables flow KLayout DRC; the independent official precheck runs the IHP DRC rules and passes. Power is a default-activity STA estimate, not measured silicon power or a workload-annotated estimate.

Standalone Yosys/ABC typical-library mappings quantify the budget before routing:

| Mapped block area | IHP SG13G2 | SKY130 |
|---|---:|---:|
| RLT-mini | 1,121.22 µm² | 609.33 µm² |
| MiniCPM MAC and row sequencer | 7,208.42 µm² | 3,841.18 µm² |
| Combined top with serial transport | 14,213.56 µm² | 7,276.98 µm² |

These are separately optimized, unconstrained synthesis measurements; they do not sum exactly and exclude placement, clock and hold repair. [Mapping logs](evidence/tt_um_tapeout_models_ihp.log) preserve the commands and library choices. The routed area above is the fit criterion.

## Correctness and useful throughput

Additional actual-prompt validation: [linear group-scale projection replay](LINEAR32.md) passes on the same RTL and routed IHP netlist. It computes the “Hello” prompt’s 2,048-term Q row as 64 group sums, yielding −1,258 Q12 with host scaling. The original test below remains preserved.

The same [Verilator pin-level testbench](test/test_models.cpp) passes against RTL and the final routed IHP netlist: **476,379 clocks**, **1,024 fast plus 1,024 serial RLT tokens**, complete 7-bit recurrent-state comparison, all **4,096 signed operand pairs**, a **6,144-term maximum-magnitude accumulation**, and reset, enable, clear, error and frame-abort cases. [RTL log](test/verilator.log), [routed-netlist log](test/gate_ihp.log).

The routed test uses the PDK's original combinational functions and sequential UDP tables. A [zero-delay simulation adapter](test/ihp_zero_delay.py) wires 57 `specify`-delayed inputs to their corresponding cell inputs because Verilator ignores those timing tasks. Without it, those wires are undriven and the first RLT token fails. This adapter is confined to functional simulation; hardening, STA, LVS and GDS use the original PDK. The test does not constitute SDF timing simulation or a proof over every possible serial-command sequence.

The MiniCPM test streams all **2,048 terms of one real layer-0 Q-projection row**, quantized from official BF16 weights, and obtains the exact integer reference accumulator **41**. Activations come from a deterministic synthetic Q12 layer input, not a natural-language prompt. Model revision, quantization and exact-chain-twin checks are recorded in [the parent MiniCPM evidence](../minicpm/exact_twin_row.json); operands are in [the tile vector](test/minicpm_slice.txt).

At the validated 10 MHz constraint, fast RLT transport supports **10 million toy tokens/s**, while serial RLT supports **625,000 toy tokens/s**. The MAC requires 16 clocks per operand pair: **625,000 MAC/s** before row overhead. A 2,048-term row uses **32,832 clocks = 3.2832 ms**, about 304.6 rows/s. A full MiniCPM token's 2.249 billion dense MACs alone would require roughly **3,599 seconds** at this serial rate, before attention, nonlinearities and row overhead. The silicon demonstration is a real model arithmetic slice; full-model acceleration requires wider transport, operand reuse and many MAC lanes.

## Shuttle, price and submission gate

The official [shuttle schedule](https://tinytapeout.com/chips/) lists **IHP26b open, closing 2026-09-21**, chips expected **2027-06-25**, estimated delivery **2027-08-16**. SKY26c closed September 7; SKY26d is planned for November 2026 without a published exact day. These are operator estimates, not delivery guarantees.

The [official IHP calculator](https://app.tinytapeout.com/calculator?pcbs=1&tiles=1&shuttle=ihp), captured September 13, gives €70 for one tile, €300 Academic/Industry or €100 Individual for one devkit, and €15 worldwide economy shipping: **€385 or €185 total**, respectively. [Captured category-specific results](evidence/quotes.json) and [browser screenshot](evidence/calculator_ihp.png) preserve the evidence. Eligibility and any checkout tax adjustments remain unverified; no account, quotation request or purchase was submitted.

The [GPIO specification](https://tinytapeout.com/specs/gpio/) says, “There are total of 26 I/O pins available for your design”: clock, reset, 8 inputs, 8 outputs and 8 bidirectional pins. SKY's pad limits do not establish IHP limits. The [official local-hardening guide](https://tinytapeout.com/guides/local-hardening/) specifies LibreLane 3.0.3 for the current flow; this candidate uses its IHP templates and bundled precheck. Source pins and reproduction commands are in [REPRODUCE.md](REPRODUCE.md).

1. **Local build gate — PASS with disclosed fanout exception:** required blocks, vectors, one-tile GDS, LVS, PVT STA and official precheck exist. Recommend retaining this candidate for submission review.
2. **Submission gate — user decision pending:** accept the untrained RLT scope and MiniCPM slice scope; select the applicable price category, confirm public author/license metadata, and have the operator accept or resolve the clock-fanout exception. A passing local precheck does not establish shuttle reservation or acceptance.
3. **Silicon acceptance gate — after delivery:** reset and replay the same vectors at 1 MHz, then 10 MHz; require zero accumulator/state mismatches. Measure current and clock margin on hardware before replacing power/throughput estimates with measurements.

A chip output alone is not a BSC settlement proof. This tile can replay the RLT NAND/LATCH transition and perform deterministic MAC slices; authenticated trace commitments and a validated one-step arbiter remain separate work. No chain transactions or burns were used.

Documentation review: the three questions lead; one submission is the primary object; process and block comparisons use tables; evidence links are adjacent to claims; staged actions remain an ordered list. Static-document applicability and remaining rendering checks are recorded in [DOC_REVIEW.md](DOC_REVIEW.md).
