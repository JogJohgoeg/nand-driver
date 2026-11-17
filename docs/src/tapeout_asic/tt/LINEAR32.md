# Actual prompt projection with linear group scales

**Primary information:** the existing one-tile design computes a real MiniCPM5-2B “Hello” Q-projection row exactly with the improved integer format: **2,048 MACs, 64 groups, final Q12 value −1,258**. RTL and the routed IHP netlist both pass the additional pin-level replay.

**Required context:** each group uses signed int8 activations and signed int4 weights. The host supplies positive Q24 weight scales and integer activation steps, combines the tile's signed group sums in int64, and rounds once. The RTL, GDS, pin map and physical signoff artifacts are unchanged.

**Next action:** use this vector for an actual-prompt arithmetic demonstration; use [REPORT.md](REPORT.md) for the submission decision. The chip still performs streamed matrix arithmetic with host scaling and scheduling.

Expression: one validation result followed by its replay procedure and evidence. Updated 2026-09-13.

The source is layer 0, Q projection, row 0, input token 36,417 (“Hello”), with 2,048 normalized activation values. The [vector metadata](test/minicpm_linear32_slice.json) binds provenance and quantization; the [exporter](test/export_linear32_vector.py) derives it from the pinned official BF16 checkpoint and the integer reference.

For each of 64 groups:

1. Send `0x2020` to start a 32-term row.
2. Send 32 signed activation/weight pairs using the existing MAC command.
3. Read the signed 32-bit sum. The host accumulates `group_sum × weight_scale_Q24 × activation_step` in int64.

Finally round the host total divided by `2^24`, nearest with ties away from zero. The result must equal **−1,258 Q12**, approximately −0.30713. Every group sum is checked independently before the combined result.

The [C++ test](test/test_linear32.cpp) drives the actual top-level pins and consumes [the text vector](test/minicpm_linear32_slice.txt). Both [RTL simulation](test/linear32_rtl.log) and [routed IHP simulation](test/linear32_ihp.log) report **PASS, 36,866 clocks including reset**. The routed test uses the same documented zero-delay cell-model adapter as the original test.

Transport requires 36,864 clocks per complete row excluding reset: **3.6864 ms at the 10 MHz timing target**. Group reads add 12.3% to the original single-sum row's 32,832 clocks. The effective rate is about 555,556 MAC/s including this row protocol. These are cycle-derived rates, not silicon measurements.

The linear-scale full-model pilot matches the GGUF next-token argmax on the three raw one-token prefixes “Hello”, “Paris” and “2”; the result is deliberately a narrow fidelity check. Multi-token evaluation is recorded separately under `../minicpm/`. The TT demonstration itself establishes the projection arithmetic, not complete on-tile language inference.

The original 35-file [hardware manifest](MANIFEST.sha256) still verifies. The additional [linear-scale test manifest](MANIFEST_LINEAR32.sha256) binds the new test evidence to the same GDS/netlist. Documentation review: three questions first, one result as the primary object, sequential replay steps, adjacent evidence, explicit units and scope; interactive controls are not applicable.
