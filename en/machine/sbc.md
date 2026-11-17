# A large model on a small computer

> No FPGA: run binary and ternary models with 1.7 billion parameters on the CPU of a small ARM computer. This page has the measured speeds and how we scale them to a board.

## Summary

- **Model**: Ternary-Bonsai-1.7B (ternary, PQ2_0, 436 MiB). Its quality is close to binary 4B, its size and speed are close to binary 1.7B, and it answers questions in Chinese clearly better.
- **Board**: a quad-core Cortex-A55 (with NEON) comes first, JH7110 second.
- **Speed**: the quad-core A55 scales to about 8–8.5 tok/s (our own ternary kernel), against about 4.9 tok/s for the original implementation. The memory bandwidth ceiling is about 11–13 tok/s.
- All board figures are scaled estimates. Nothing has run on real hardware yet.

The models come from Prism ML's Bonsai series (Apache-2.0).

## Our own runtime, s6rt

| Item | Result |
|---|---|
| Machine | x86 desktop, AVX2, 4 threads |
| Speed | 33–34 tokens per second (7.5 with the generic C version, no SIMD) |
| Does it match? | Logits over 24 steps on the same prompt are byte for byte identical to the generic C version, the aarch64 NEON version and the 10-24 golden reference |
| Date | 2026-10-30 |

## Measured on x86 (llama.cpp)

llama.cpp, CPU only, generating 64 tokens. One x86 desktop (Ryzen AI Max+ 395). Unit: tok/s.

| Model | File | 1 thread | 2 threads | 4 threads | Peak memory |
|---|---|---|---|---|---|
| Bonsai-1.7B Q1_0 | 231 MiB | 17.4 | 31.2 | 59.9 | 408 MB |
| Same, no SIMD (generic scalar path) | 231 MiB | 1.49 | 2.96 | 5.88 | — |
| Bonsai-4B Q1_0 | 540 MiB | 7.36 | — | 25.8 | 731 MB |
| Bonsai-8B Q1_0 | 1.07 GiB | 3.97 | — | 14.6 | 1,295 MB |
| Ternary-Bonsai-1.7B PQ2_0 (PrismML branch) | 436 MiB | 16.95 | 34.0 | 61.0 | 930 MB |

- Without SIMD it is about 11 times slower. So stock llama.cpp can't be used as is on the JH7110, which has no vector extension.
- Ternary PQ2_0 files can only be read by PrismML's llama.cpp branch.

## How we scale to a board

For each case, compute two ceilings and take the smaller one.

**Bandwidth ceiling** = effective memory bandwidth ÷ bytes read per token. Each generated token reads all the weights once, so the bytes read are about the file size.

| Board | Theoretical bandwidth | Effective, as assumed |
|---|---|---|
| A55 board (LPDDR4) | 8–10 GB/s | 60%, so 5–6 GB/s |
| JH7110 | About 11 GB/s | 2–4 GB/s (weak memory access, to be checked on real hardware) |

**Compute ceiling**:

1. Use llvm-mca (`-mcpu=cortex-a55`) to count how many cycles the compute loop takes per weight.
2. Cycles per token = number of weights × cycles per weight, plus 8% (attention, normalization, activation quantization).
3. A quad-core A55 at 1.8 GHz with 0.85 parallel efficiency gives about 6.1 billion cycles per second.
4. tok/s = cycles per second ÷ cycles per token. At a 2.0 GHz clock, multiply by 1.1.

Example, ternary 1.7B:

| Compute kernel | Cycles per weight | Cycles per token | tok/s |
|---|---|---|---|
| PrismML original implementation | 0.67 | About 1.25 billion | 4.9 |
| Our slice kernel, one row, 4 groups | 0.41 | About 760 million | 8.0 |
| Our slice kernel, 4 rows at once | 0.385 | About 720 million | 8.5 |

There are 1.72 billion weights. Each token reads 0.46 GB, so at 5–6 GB/s the bandwidth ceiling is 11–13 tok/s. Further optimization would be limited by memory, not by compute.

## Quad-core A55 estimate

1.8–2.0 GHz, NEON, LPDDR4. Unit: tok/s.

| Model | Stock llama.cpp | Bandwidth ceiling | Our kernel (first version / fully scheduled) | Memory |
|---|---|---|---|---|
| Bonsai-1.7B Q1_0 | 4–6 | 21–25 | 6–7 / about 12 | 0.4 GB, fine on a 1 GB board |
| Bonsai-4B Q1_0 | 1.7–2.6 | 9–11 | 2.6–3 / about 5 | 0.73 GB, safe on a 2 GB board |
| Bonsai-8B Q1_0 | 0.8–1.3 | 4.7–5.6 | 1.3–1.5 / about 2.5 | 1.3 GB, does not fit on a 1 GB board |
| Ternary-Bonsai-1.7B PQ2_0 | 4.9 | 11–13 | 8–8.5 | About 0.6 GB (0.93 GB measured on the branch) |

On the A55, our binary kernel is only about 1.2 times as fast: the A55 can issue only one 128-bit NEON instruction per cycle, and the llama.cpp path is already close to that floor. The ternary slice kernel needs only one AND plus 1/16 of an SDOT per weight, so it is about 1.7 times as fast.

## JH7110 estimate

4 × U74 1.5 GHz, RV64GC + Zba/Zbb, no vector extension. Unit: tok/s.

| Model | Stock llama.cpp (generic scalar) | Bandwidth ceiling | Our Zbb `cpop` kernel (estimate) |
|---|---|---|---|
| Bonsai-1.7B Q1_0 | 0.3–0.4 | 8–16 | 4–6 |
| Bonsai-4B Q1_0 | 0.13–0.17 | 3.5–7 | 1.7–2.6 |
| Bonsai-8B Q1_0 | 0.07–0.1 | 1.7–3.5 | 0.8–1.3 |

## The s6rt runtime we wrote

- It reads GGUF directly, or a [TBW1](../reference/tbw1.md) file already in the right layout, and computes the Qwen3 forward pass itself.
- Logits on x86 and aarch64 (NEON) are bit for bit identical. `-ffp-contract=off` is used throughout.
- Its own BPE tokenizer matches llama.cpp's token for token. You can type a question in the terminal (one question and answer tested on x86, byte for byte the same as a direct run; not yet run on a board).
- It sends a heartbeat and can start through TapeBoot. See [Fetch firmware from the chain](tapeboot.md).
- On x86 with 4 threads it does about 33 tok/s (AVX2). This only shows that it runs. It says nothing about speed on a board.

How much reading TBW1 saves over converting GGUF on the fly (measured on x86, estimated for the A55):

| Item | GGUF, converted on the fly | TBW1, read directly |
|---|---|---|
| Load (layout conversion) | 1.06–1.35 s | 0.000 s |
| Time to first heartbeat | 1.22–1.31 s | 0.09–0.17 s |
| Peak memory | 948 MB | 507 MB |
| Conversion saved on the A55 | — | About 2–3 s |

A cold start reads about 460 MB from storage on both paths. At 40–90 MB/s, a microSD card takes 5–12 s, and that is the largest part.

## Not done yet

- Running on real hardware, and measuring the real bandwidth and speed of the A55 and JH7110.
