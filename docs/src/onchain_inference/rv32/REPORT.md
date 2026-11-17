# RISC-V inference route / RISC-V软件推理路线

**Follow-up addressed to codex H at2026-09-13T06:00:20Z.** This supplements the NAND study and changes the build recommendation for small general models. / 新增软件路线，小型通用模型值得继续验证。

## Read-only chain observations / 链上只读观测

At block121595394, VM0x5Ec71579c67EB01755bE6da9C3a26995f144115A has14490 runtime bytes. Owner matches0x86DDaEF00401E3F10418398D67D7189fc458eA95. cpuWords() returns8 packed uint256 words, NOT an ABI array of48 registers. Per the live page decoder: PC0x800beb3c,43,757,231 cumulative instructions,47,111 ticks,halted=0. readPage(0) and readPage(1) return1024 bytes each. pages(0) gives0xa2f0901b6f8f4304b95ea18ffa0bfe86f629605c; that contract has1025 code bytes (STOP+1024), and mapping slot2 independently yields the same pointer. vm_chain.json records hashes and returned values.

Per nonshared full1KB page, deposit=1025*200=205000 plusCREATE32000 =237000 base gas; initcode,transaction,registry pointer and admin loading work are additional. All-zero/shared pages may be deduplicated; do not multiply16MB by237000 unless each page really gets a new contract. Dirty-page copy-on-write repeats creation/deposit when a new page is emitted. Weight pages are read-only during inference; activations/stack/output pages are dirty.

## Executed software / 实际运行的软件

Clang22.1.8 targeting rv32ima/ilp32, -O2 -ffreestanding, linked using LLD22.1.8. No RISC-V GCC/buildroot toolchain was installed; the available Clang RISC-V backend was used instead. The missing matching linker package was only unpacked into /tmp/tapeout-infer-h on build-host-2; LD_LIBRARY_PATH applied only there. No system packages or hunt loops were changed. ELF binaries were brought back and run locally through pinned mini-rv32ima; instruction/data-load hooks measure unique1024-byte pages and dirty pages.

This is a bare-metal compute benchmark inside the reference ISA emulator, with machine privilege and timer interrupts disabled. It does NOT launch these binaries under the on-chain Linux kernel. Linux loader/startup, scheduling, syscalls, TTY input and checkpoint traffic would add cost. Counts include setup and terminating EBREAK, but exclude boot. The site reports41.8m boot instructions; that is an existing VM cost, not charged again per inference.

| Program / 程序 | Model / 模型 | Instructions / 指令 | Image bytes / 镜像字节 | Touched/dirty pages / 访问/脏页 | Correctness / 验证 |
|---|---|---:|---:|---:|---|
| Loadable MLP,int8 storage | same88-weight16→4→4 |953 |724 |5/3 |4 canonical glyphs match Python logits |
| Loadable MLP,packed int4 | same88-weight16→4→4 |1713 |724 |5/3 |4 canonical glyphs match Python logits |
| Quantized full sort-3 transformer |18528 int8 parameters,Q10 activations |662735–662835 |31324 |34/7 |all512 native-C/rv32 outputs and sorted labels match |

The transformer port retains two encoder layers,d32,4 attention heads,FFN64,pre-layernorm,GELU,residuals,final norm/key projection and learned3 rank queries. It executes projections,attention and activations, not a sorting algorithm or lookup of final answers. Parameters come from the existing sort3/model.pt, quantized to int8 per tensor with integer Q10 scales. GELU andexp use1/32-grid LUTs; linear outputs clamp to signed16,Q10; layernorm uses integer square root. Repeated-token probabilities are summed before argmax, matching the teacher output interface. It is **not floating-point bit-exact with PyTorch**, although all512 final classes/sequences equal the archived perfect sort teacher and sorting specification. Native C additionally passes UBSan over all512 cases. Intermediate numerics are this new documented quantized model; no quality claim on other tasks.

The transformer has18528 parameter bytes (19 weight pages if packed separately). Its actual31,324-byte linked image includes code,tables,metadata and BSS; it spans31 pages, and runtime touches34 including stack/config. Weight data embedded in the image remains normal readable model data; the compiled shape is fixed. The MLP explicitly loads weights from a runtime-selected-format RAM bank without recompilation.

## Scale comparison / 规模对比

| P | Bits / 位数 | Dynamic instructions / 动态指令 | Gas @1400/instruction | Gas @4000/instruction | Weight pages / 权重页 | Page deployment base / 页部署基数 |
|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 8 | 18,020 | 25,228,000 | 72,080,000 | 1 | 237,000 |
| 1,000 | 4 | 28,020 | 39,228,000 | 112,080,000 | 1 | 237,000 |
| 10,000 | 8 | 180,020 | 252,028,000 | 720,080,000 | 10 | 2,370,000 |
| 10,000 | 4 | 280,020 | 392,028,000 | 1,120,080,000 | 5 | 1,185,000 |
| 100,000 | 8 | 1,800,020 | 2,520,028,000 | 7,200,080,000 | 98 | 23,226,000 |
| 100,000 | 4 | 2,800,020 | 3,920,028,000 | 11,200,080,000 | 49 | 11,613,000 |
| 1,000,000 | 8 | 18,000,020 | 25,200,028,000 | 72,000,080,000 | 977 | 231,549,000 |
| 1,000,000 | 4 | 28,000,020 | 39,200,028,000 | 112,000,080,000 | 489 | 115,893,000 |

The scale C kernel is a dense-layer arithmetic microbenchmark with32 inputs/row and checksum output; it does not materialize every neuron activation or run a multilayer network. Remainder rows are included. Input values and loadable weights are data, not folded constants. It measures18P+20 instructions for int8 and28P+20 for nibble-packed int4 with per-weight decoding. Optimized word decoding/unrolling can reduce that overhead. Model scheduling, output tensor writes and nonlinearities are additional. For this prototype, int8 trades about2× weight storage for~36% fewer instructions; packing is not automatically a runtime saving.

The1400–4000 gas/instruction multiplier is the task/page-derived planning range, NOT a measured gas rate for these programs. Actual rate depends on opcode mix, page locality and dirty writeback. Do not add a second blanket page cost on top of a rate already containing page churn; measure actual Ticked/receipt deltas for the intended workload if execution is later authorized. No tick() or typeInput() was called.

At1k parameters packed int4 software is39.23–112.08m gas versus46.5b NAND serial, roughly415–1186× lower. At1M,39.2–112b versus46.5t, similar ratio. Software wins decisively over this general serial gate core at all four studied scales, while still too expensive for routine large-model inference. Small fixed policies can win: the172-gate sort circuit is~0.4–0.5m gas versus~0.928–2.651b for executing the full transformer. For the88-weight MLP, int8 software is1.334–3.812m, packed int4 is2.398–6.852m versus~8.86m for the one-shot frozen4574-gate classifier and~1.73b for the serial core. These comparisons depend on the scenario rate and exclude Linux integration costs; a smaller frozen implementation can change the crossover.

## Hybrid accelerators / 混合加速器

A generic serial MAC peripheral is a regression:64 circuit steps per4-bit MAC ×~727k gas ≈46.5m versus28 RISC-V instructions ×1400–4000 ≈39.2–112k, about415–1186× slower before MMIO dispatch. Even an unrealistically unchanged-cost one-step MAC costs~727k, about6.5–18.5× slower. A useful generic accelerator must do a whole tile per call with native packed EVM arithmetic or a substantially different evaluator; circuit publication alone does not confer acceleration.

A frozen whole-function accelerator is different. Replacing~663k transformer instructions with one~0.4–0.5m sort circuit could offer~1850–6600× compute-gas speedup, before marshaling and verification. This accelerator fixes the model/function; it is not a general transformer MAC. Replacing the already tiny MLP software with the4574-gate frozen classifier would be slower under the current estimates. An MMIO/custom instruction requires explicit interpreter/VM support, immutable core/function binding, deterministic gas/return semantics and state continuity; neither the present C programs nor this study modifies the deployed VM.

## Revised recommendation / 修订建议

**Build a small software integration prototype locally; stop production general NAND inference.** The VM already supplies a reusable instruction engine and paged model memory, so a tiny loadable MLP looks worth a bounded, separately authorized integration experiment. Do not reimplement its software functions as serial NAND accelerators. Retain frozen whole-function accelerators where measured end-to-end savings are clear, and prefer off-chain inference+proof verification for large models. The Linux VM changes the architecture recommendation, not the conclusion that serial NAND evaluation is uneconomic. No on-chain installation, input injection or tick is authorized by this research task.

Reproduce: python3 rv32/export.py; compile the three C programs with start.S and link.ld using the flags in results.json; clang -O2 rv32/runner.c -o rv32/runner; clang -O2 -DHOST rv32/transformer.c -o rv32/transformer_host; run host to transformer_predictions.txt; python3 rv32/measure.py; python3 rv32/report.py. See results.json,transformer_traces.json,quantization.json and pinned mini-rv32ima.h. ELF artifacts make local replay independent of the remote compiler.

Sources: [TapeOut live Linux description and ABI](https://tapeout.net/linux.html), [mini-rv32ima reference](https://github.com/cnlohr/mini-rv32ima), locally pinned VM observations in ../vm_chain.json, and ../../dlgn_llm/sort3 model/protocol. The Linux checkpoint claim is reported by TapeOut; this study did not independently replay41.8m boot instructions.

### Concrete VM architecture / VM具体架构

Keep immutable code/model pages separate from mutable activations/stack/output pages. Pin the C binary hash, parameter-bank hashes, quantization manifest and entry point. A software program loads layer descriptors and bank offsets, performs native rv32ima MAC loops, and writes result plus request/model identity into a bounded output buffer. Reuse the VM's paged memory/copy-on-write and authenticated owner interface; do not let an inference caller overwrite PC/registers or arbitrary RAM. For a shared service, define who may load models, which executable is allowed, how requests are isolated, and what result checkpoint a consumer accepts. A Linux user-process integration would use its normal loader/memory API and incurs extra instructions; the fixed addresses in these bare-metal benchmarks are **not** safe drop-in addresses for the already running Linux system. Do not inject them into the live VM.

First local integration milestone: load the88-weight MLP in a cloned/reference VM state, validate bounded input/output buffers and compare complete logits/checkpoints, then measure page churn and total gas in read-only EVM simulation of a clone. This study does not perform the later state installation or production checkpoint protocol. Use `build.sh` with explicit `RV_CLANG`/`RV_LD` paths for local reconstruction; downloaded compiler packages are not required to replay the supplied ELF files. Measured page counts include the benchmark harness's stack and terminal store and are not optimized minimum footprints.
