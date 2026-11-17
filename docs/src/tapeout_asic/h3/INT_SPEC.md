# INT-C16 integer contract v1.1 / 整数模型契约

SPDX-License-Identifier: CC0-1.0

This specification and the new integer implementation are dedicated to CC0.
The original tiny-tiny-stories weights/tokenizer remain MIT; their notices travel
with the demo. This is an inference conversion, not additional training.

## Representation and exact arithmetic

The architecture is L=5, D=128, F=336, H=4, head dimension=32, V=192,
tied E8 embedding/head. Context C is 16 or 32 **tokens**, not bytes.
Internal weights are the original 972,800 ternary codes. Qf means the signed
integer represents its value divided by 2^f. A field's signed width includes
the sign bit. All sums accumulate in increasing input-index order.

`R(n,d)` for positive integer d is signed round-to-nearest, ties-to-even:
divide |n| into quotient q and remainder r; increment q iff 2r>d or
(2r=d and q odd), then restore n's sign. No arithmetic relies on a signed
right shift, signed overflow, host floating point, or implementation-defined
negative division. `S(n)` clamps to [-524288,524287], signed 20 bits.
Transient multiply/accumulate values use signed 64 bits; persistent activation
vectors use signed 20-bit Q12. Host storage may use int32 without changing
the logical bit width. Constants are exported once from the pinned checkpoint;
the normal inference harness accepts only the hashed exported artifact. The
C `int_init` parser checks format and field limits; artifact SHA-256 is checked
by its caller (`int_run.py`, browser startup and the Actions harness). Deliberate
mutated-blob tests bypass that caller check and are not production artifacts.

| Operator | Exact integer rule |
|---|---|
| Embedding | E8 row code e in [-127,127], unsigned Q24 row scale g (18 bits); X=S(R(e*g,4096)). |
| A8 | m=max(1,max abs(X)); q=R(127*X,m), signed 8 bits [-127,127]. Retain m as unsigned 20 bits. |
| BitLinear | signed int32 dot a=sum(q[i]*ternary[i]); output S(R(a*m*alpha,127*262144)); alpha is unsigned Q18, 18 bits. |
| RMSNorm | u=2*sum(X[i]^2)+4295 (unsigned 47 bits); r=floor(sqrt(u)), computed by the restoring binary integer square-root algorithm (24 fixed iterations). Learned norm w is signed Q14, 16 bits; output S(R(4*X[i]*w[i],max(1,r))). 4295 is the fixed epsilon term in this integer contract. No reciprocal-square-root LUT or Newton step is used. |
| RoPE | Fixed signed Q15 cos/sin, 17 bits, positions 0..31, 16 split-half pairs per head. (a,b) becomes (S(R(a*c-b*s,32768)),S(R(b*c+a*s,32768))). |
| KV8 | Per head and position, use the A8 rule on K **after** RoPE and on V. Retain two arrays of signed8 codes plus unsigned20 maxima. Dequantize each value as S(R(q*m,127)) when read. |
| Attention score | t=sum(Q[i]*Kdequant[i]) in signed64; score=R(R(t,4096)*46341,262144), signed32 Q12. 46341 is the fixed Q18 inverse-root-32 constant. Only positions <= query position participate. |
| Exponential | Subtract the maximum score. For nonnegative delta, j=R(delta,64). If j>1024 return 0; else use the immutable 1025-entry unsigned17 table EXP[j]. Its offline definition is RNE(65536*exp(-j/64)). There is no runtime exp. |
| Attention reduction | b=sum(EXP[j]); a=sum(EXP[j]*Vdequant[i]); output S(R(a,b)). b>=65536. Division normalizes the weighted sum directly, avoiding an extra probability-rounding stage. |
| SiLU | j=min(1024,R(abs(gate),64)); s=SIGMOID[j] for gate>=0, else 65536-SIGMOID[j]. Table entry is offline RNE(65536/(1+exp(-j/64))), unsigned17. silu=S(R(gate*s,65536)); ff=S(R(silu*up,4096)). |
| Residual | S(old+branch), immediately after attention projection and after FFN down projection. |
| Tied head | RMSNorm then A8. Signed32 dot a=sum(q[i]*E8[row,i]); b=R(a*m,127); logit=R(b*g[row],16777216), signed32 Q12. No activation saturation on the final logit. |

Inference additions/products use exact signed64 intermediates. With the
specified field limits, their used values remain below 2^53 in magnitude;
the RMS sum uses unsigned arithmetic with the same bound. Sampling's external
unsigned32 random input times its unsigned22 total is a separate unsigned64
product below 2^54: JavaScript computes it with two 16-bit limbs, not a single
binary64 product. The browser also corrects quotient and remainder before
applying RNE, so its integer containers introduce no inference rounding.
No transcendental function is called by any inference engine.

Logical accumulator widths may be narrower than C's storage types without
changing any values: BitLinear dot s17 (|a|≤336*127=42672), tied-head dot s22
(|a|≤128*127²=2064512), attention score accumulator s45 (|t|≤2^43), attention
weighted numerator s42, normalization denominator u22 (b≤32*65536), and
sampling total u22 (≤40*65536). The stated 20-bit activation and int32-logit
interfaces remain unchanged. The numerator/denominator bounds require the
specified causal context and 17-bit EXP range, not arbitrary standalone inputs.
For RMSNorm, u≥4295 gives r≥65, so max(1,r) is redundant. Since r≥abs(X[i]),
abs(R(4*X[i]*w[i],r))≤131072 (zero for X[i]=0), so its S() cannot clamp.
An implementation may remove these proven inactive branches while retaining
the contract's explicit definitions.

## Artifact and block layout / 制作网表所需的完整结构

The approved blob is 283,804 bytes, SHA-256
`5a8415731e525ced7873198369c9138407631f4d0485b5e4d0314c55850478a1`.
Bytes 0..7 are ASCII `TC16I001`. All multi-byte fields are little endian;
arrays use row-major order. Fields appear without padding:

| Offset | Bytes | Field / physical storage |
|---:|---:|---|
| 8 | 243200 | 972800 ternary codes, four per byte, lowest two bits first; 0→0, 1→+1, 2→−1, 3 invalid |
| 243208 | 140 | alpha[5][7], uint32 containing unsigned18 Q18 |
| 243348 | 24576 | embedding[192][128], signed int8 |
| 267924 | 768 | embedding_scale[192], uint32 containing unsigned18 Q24 |
| 268692 | 2816 | norm[11][128], signed int16 Q14 |
| 271508 | 2048 | cos[32][16], signed int32 containing signed17 Q15 |
| 273556 | 2048 | sin[32][16], same representation |
| 275604 | 4100 | EXP[1025], uint32 containing unsigned17 |
| 279704 | 4100 | SIGMOID[1025], same representation |

Each layer has 194560 trits, in matrix order **q,k,v,o,gate,up,down**.
Each matrix is `[out][in]`, with shapes respectively 128×128 (four),
336×128 (two), and 128×336. Starting trit offsets within a layer are
0,16384,32768,49152,65536,108544,151552. alpha[l][m] scales that matrix.
Layer l's pre-attention norm is norm[2*l], its pre-FFN norm is norm[2*l+1];
the final output norm is norm[10]. Head h occupies dimensions h*32..h*32+31.
RoPE pair i is (i,i+16) within that head, using cos[position][i]/sin[position][i].

The block is pre-norm. Apply n1 to the old X row; Q/K/V consume A8 of that
same n1 vector (recomputation or sharing is numerically identical). RoPE
transforms Q and K. Q remains Q12; K after RoPE and V are quantized per head
for storage. Concatenate the four attention heads into one D-vector, apply
A8 over all D dimensions, then matrix o, then residual. Apply n2 to the
updated X, A8 over D, paired gate/up, SiLU and elementwise product. Apply A8
over the entire F-vector before down; then the second residual. After five
blocks, apply norm[10] and the tied head rule. No biases are present.

## State schedule / 逐层前缀重算

For every invocation, embed the last C input tokens with local positions
0..T-1, T<=C. For each layer, construct that layer's **entire old-prefix K/V**
first. Then process each query in increasing position, recomputing its n1,
performing attention, residual, n2, paired gate/up, down and residual, and
overwriting only its own X row. A single K/V layer and one X prefix survive.
Gate/up rows can be paired to keep one F-vector. Cache states are discarded
between invocations; this matches the sliding-window evaluation convention.
Return logits for all rows for scoring; a generator only needs the last row.
There are no cross-layer KV caches or hidden host-side FP states.
For generation the invocation is exactly ids[-C:]; BOS may slide out. For
scoring, let end=0 and N=len(ids)-1. Set new_end=min(N,end+(C if end=0 else
C/2)), start=max(0,new_end-C), input=ids[start:new_end],
targets=ids[start+1:new_end+1]. Score only output rows end-start onward,
then end=new_end and repeat until end=N. Thus every target is scored once.
The C implementation reuses two D-vectors: n1 writes H, Q writes A,
attention writes H, and O writes A. Q is dead before O overwrites A.
FFN gate/up are evaluated as paired scalar rows into one F-vector.

## Selection / 输出选择

Greedy argmax breaks ties toward the lowest token ID. Sampled generation has
fixed temperature 4/5, exact top-40 selection (logit descending, ID ascending),
and exponential weights obtained by delta=`R(5*(max-logit),4)`, then
j=`R(delta,64)`; weight is zero for j>1024, otherwise EXP[j].
Randomness is an **external unsigned32 input**. Select cumulative weight
containing `floor(random*total/2^32)`: choose the first sorted token whose
cumulative sum is **strictly greater** than this target. This product uses two 16-bit
limbs in JavaScript and uint64 in C. The reproducibility harness supplies
xorshift32, with shifts 13,17,5 (mask to unsigned32), seed 260500+prompt_id.
Update the state before supplying that token's random value. It is not an on-chip RNG
claim. EOS=2 stops generation; PAD=0/BOS=1/UNK=3 retain the original model's
meaning. Prompt tokenization is a front-end operation, outside inference.

The hardware top-40 list streams output logits into 40 entries of signed32
score plus unsigned8 ID (1,600 bits), within the 2,048-bit misc allowance.
The reported one-pass weight-evaluation schedule caches its 40 unsigned17
weights (680 bits) in the dead KV bank during the output-head phase. It then
scans this cache for cumulative choice. An alternative without that cache
recomputes EXP weights in a second pass and must charge the extra cycles.
The C pure-function `int_pick` receives all 192 logits for testing; that host
API does not require a 192-logit on-chip array.

## Reproducibility and scope / 验证边界

Python integer, C99 integer, and browser engines must produce identical signed
Q12 logits, not merely matching argmax. Tests include real prefixes, random
tokens, operator bounds, actual table-entry mutation and altered tie handling.
PPL/BPB scoring converts output integers to real logits **after inference**;
log/exp in the statistical scorer are not model operators. Offline extraction
and generation of immutable integer constants may read FP32 weights and use
high-precision transcendental functions. That conversion is not performed on
the chip or in the browser model. Evidence records exporter and blob hashes.

This contract is a new deterministic approximation of A2's FP32-dequantized
`a8_e8_kv8`; equivalence to the latter is not asserted. C16/C32 quality must be
measured on all the same 512 stories. A source gate estimate is not a placed,
routed, timed or formally verified whole-chip implementation.

## References reviewed / 用户补充参考的采用边界

Reviewed after the first v1 implementation, without fetching code or weights:
[I-LLM, arXiv:2405.17849v1, §§3.3–3.4](https://arxiv.org/html/2405.17849v1)
informs the per-token dynamic integer scaling, max-subtracted/clipped softmax,
bitwise integer norm, and SiLU-as-sigmoid-times-input choices. Our fixed LUTs
are **not DI-Exp's shift/interpolation algorithm**; our restoring square root
is not a reproduction of DI-Norm. We retain the tested v1 rules. No FSBR
reconstruction, learned smoothing, or new training is performed.

[nmicic's int-llm article](https://huggingface.co/blog/nmicic/int-llm)
informs the explicit integer-core / offline-conversion boundary and raw-integer
golden hashes. We do not adopt its Q16.48 storage or 128-bit intermediates.
Its reported token agreement does not replace our own tests.

以上参考用于复核动态逐 token 缩放、整数非线性和确定性验证的设计；没有下载其代码或权重。
本版用窄状态、固定表和逐位开方，数值规则与初版质量回执不变。论文中的训练式重构未采用。

Revision 1.1 (2026-10-06) makes the packing, block order, sampling, hash-check
boundary, and windows explicit after independent review. It retains v1's
numeric rules and blob. The C implementation now applies the specified S()
at both K and V dequantization reads; v1 C omitted that clamp, an edge-case
implementation error. Dedicated boundary and mutation tests cover the fix;
quality is rescored for both contexts before the report is sealed.

## Source NAND cost of the approximations / 近似算子的门数口径

These are source-construction counts, not Yosys-mapped area. Values are shared
across all layers; do not add the shared scalar core again for every operator.

| Function | NAND budget / evidence |
|---|---|
| Shared integer arithmetic | Actual optimized units: RNE DIV64=2,569 NAND/115 LATCH, MUL64=1,722/192, root48=827/98; add64=706 NAND, A8 abs/max=399, signed32 argmax/score-max=393, residual=265. Sum 6,881 NAND. Source primitives are verified; operand routing and full microcode remain in the 50,000 control/address reserve. |
| Arithmetic state | Keep 1,024 bits: 405 in serial units, 20 for A8 max, 40 for reused argmax/score-max, 64 for accumulation; 495 for operands, counters and staging. This is a state allocation, not a completed 1,024-bit datapath netlist. |
| BitLinear | Existing 3,829-NAND DOT32_T; partial-sum and scale steps reuse the scalar core. |
| Softmax + sigmoid/SiLU tables | Joint immutable table: 3,339 NAND, 4,096 addresses decoded and simulated with an actual-output mutation check. Multiply/normalize reuse the scalar core. |
| Norm/alpha/E8 scale constants | Joint 18-bit table: 6,102 NAND; construction only. |
| C32 RoPE constants (also used by C16) | 4,617 NAND; construction only. |
| Saturating 20-bit residual add | 265 NAND; boundary/random vectors and actual-output mutation pass. |
| Signed RNE divide-by-4096 primitive | A separately verified 181-NAND option; not instantiated in the current total, which reuses the generic divider. |
| E8 head | Reuse the scalar integer core; the existing 3,071-NAND column selector and 48,702-NAND E8 constant selector are charged separately. |

The verified standalone units take 65 clocks for multiply, 65 for RNE divide,
and 25 for integer root, **including load**. The revised schedule estimate
adds four access/store clocks to each: 69/69/29. DOT32_T keeps eight scheduled
clocks. K/V reuse their identical n1 A8 codes, so the layer has four D-vector
A8 passes (KV n1, query n1, attention output, n2) plus one F-vector pass.
Constant shifts still use general division. The earlier 128/136/96 profile
is retained in evidence as a conservative baseline. Access padding is an
estimate; full-controller cycle accuracy and clock frequency await physical
implementation. No output changes accompany these accounting corrections.
