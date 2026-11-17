# Interpreter optimization measurements — PARTIAL, parked for ASIC mission

2026-09-13. User redirected window H to ASIC design and required parking this work unless all remaining levers were within ~30 minutes of completion. They were not. No transactions, no burns. These partial measurements feed the ASIC chain-interface budget.

Measured using exact deployed runtime with local guest pages in PyEVM. MLP guest runs 2×1024 instructions; EBREAK at PC0x80000010 is replaced by a self-loop to provide a fixed-length comparison. This includes terminal padding and is not a full-model performance claim. Input63903; output[17,-8,-8,-7]. CPU words match after each tick; all5 touched/initial page payloads match after the run. Two guest checkpoints also match pinned mini-rv32ima with the correct elapsed-time convention (`check_guest_mini.py`).

| Variant | Tick1 gas | Tick2 gas | Total gas | Speedup | Max memory bytes |
|---|---:|---:|---:|---:|---:|
| Baseline deployed bytecode |1915194|2242304|4157498|1.000|489696|
| Lazy page buffers and CREATE scratch |1440949|1770019|3210968|1.295|100384|
| Computed opcode jump table |1907168|2210188|4117356|1.010|489696|
| Both |1432923|1737903|3170826|1.311|100384|

Evidence: `optimization_partial_results.json`; reproduce `park_optimizations.py` using existing arena venv. `bytecode_variants.py` preserves the original instruction handlers and uses explicit bytecode patches. Lazy allocation moves the free pointer from0x77800 to the end of actually loaded pages and uses that pointer for CREATE scratch instead of0x77000. The direct page-index table and ledger still consume fixed memory; this is not zero-overhead demand allocation. Computed decode replaces the opcode comparison chain with a bounded128-entry destination table. No instruction bounds checks are removed.

**Not finished:** sort-3 measurements; word-level SSTORE differences; multi-tick comparison; pre-masking/fused pairs; separate warm-cache optimization; 8192 cap correctness/timer normalization; AOT/SWAR MAC; all-lever combined benchmark; stateless arbiter experiment1. Existing deployed code already caches pages within a transaction; future cache comparison must distinguish that baseline from additional locality optimization. `Patch.cap()` is an untested prototype and not a measured optimization. No measured250–400gas/instruction claim is supported. The bytecode variants are not release-ready: all-opcode/trap/MMIO tests and historical Linux replay are still needed.

Local direct execution gas is measured, but differs from transaction gas accounting on BSC. Public-model entries should mark only these narrow MLP measurements as measured and retain untested lever groups as estimates. No public repository was edited.
