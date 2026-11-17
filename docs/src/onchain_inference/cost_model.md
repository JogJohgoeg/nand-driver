# Cost model / 成本模型 — round 1

| Placement / 权重位置 | Once / 一次性 | Per inference / 每次推理 | Guarantee / 保证 |
|---|---|---|---|
| (a) packed input stream / 输入流 | none | evaluator + 4–16 gas per calldata byte + ABI | supplied arithmetic only unless weights and schedule authenticated |
| (b) STOP-prefixed bytecode / 字节码 | approximately 200B + 32,000K, plus initcode/transaction costs | evaluator + wrapper + bank access + copy | fixed weights; full inference additionally requires enforced schedule and activation/state provenance |
| (c) circuit latches / 锁存 | Pb additional LATCH, 4Pb netlist bytes; token burn deliberately not priced | every step scans Pb more latches, passes ceil(Pb/8) state bytes; selection/load logic extra | latch initialization must also be authenticated |
| (d) rv32ima software / RISC-V软件 | 237k base gas per new full1KB model page | observed local18P int8 /28P int4 instructions plus scheduling and dirty-page overhead | executable/model/input binding and continuous VM checkpoints |

Here P = parameter count, b = bits/parameter, B=ceil(Pb/8), K=ceil(B/24575) for conservative EIP-170-sized STOP-prefixed banks. Native BSC limits must be checked before deployment; these are portable bank sizes, not a claim that BSC cannot allow larger banks. No deployment is proposed in this task.

Pinned read-only measurements in chain_costs.json (zero pattern): #280 87 NAND+3 LATCH, 15/4 I/O: 261497 gas; #283 152+10, 16/15 I/O: 433276; #284 295+23, 16/17 I/O: 795098. These are eth_estimateGas results, NOT receipts or exact opcode traces. Published #283 gasUsed=657362 is its historical deployment, not step gas. Original drive logs record transitions, not gas.

Formula: Gtx = 21000 + calldata(4Nzero+16Nnonzero) + H + alpha*NAND + beta*LATCH + I(nIn,packed bytes) + O(nOut,packed bytes) + M(memory) + branch(data). Step takes explicit packed state, not persistent SSTORE. C=(NAND+LATCH)*depth^3 is a structural score and is NOT runtime gas.

Three different shapes cannot identify H, alpha, beta, input/output slopes independently. A three-variable fit absorbs I/O and proxy/storage overhead and is only a local interpolator; do not interpret its coefficients as opcode prices. Budget 2300–3000 gas/NAND and 2500–4500 gas/LATCH, H=20000–50000 execution gas pending controlled local probes. A nonzero pattern increases estimates by 919–1379, so data dependence is real. One surplus input byte within the ABI word adds zero measured gas; 32 extra zero bytes add 143–144, including 128 intrinsic gas: about 15–16 execution gas per extra ABI word in this probe, not per semantic input byte. Output byte cost is unidentifiable from these three shapes.

SSTORE2 read cost is not just 3 gas/word: EXTCODECOPY access=2600 cold or 100 warm + 3ceil(slice/32) + memory expansion. Memory cumulative cost at m words is 3m+floor(m²/512); charge differences. A CPU STATICCALL has another account access and ABI/returndata costs. Batching warms accounts/storage but loop allocations can grow memory. Use bounded chunks and a reused buffer. Wrapper estimate initially 2000–15000 gas/logical step (excluding CPU execution), to be sensitivity-tested. Persistent chunk checkpoints add SSTORE separately. Separate transactions each pay 21000 and cold costs again.

Break-even b vs a over R inferences: R*(Ga-Gb)>200B+32000K+deployment extras, only if Ga>Gb. With streamed one nibble repeatedly per bit-serial step, compare the actual schedule, not just B: a can send a whole packed model once too. With optimal once-per-inference packed calldata, max data saving is only 16B before wrapper costs; 200B/16B=12.5 repeats is a storage-only lower bound, never a universal break-even. If wrapper overhead per MAC exceeds calldata saved per MAC, there is no gas-only break-even; b buys model binding/availability.

Latch lower increment: Gc-Gbase >= T*beta*Pb, before state ABI, mux/load, and netlist read costs already reflected in beta. Versus b, latches cannot win on repeated inference when T*beta*Pb exceeds wrapper+copy and initialization costs are nonnegative. Even 1k 4-bit weights add 4000 state bits evaluated every microstep. With T proportional to P this is quadratic work. LATCH bits themselves are not one SSTORE each: external persistent packed state has separate slot costs.

Sources: [EIP-2929 access costs](https://eips.ethereum.org/EIPS/eip-2929), [EIP-170 portable code limit](https://eips.ethereum.org/EIPS/eip-170), [EIP-3860 initcode](https://eips.ethereum.org/EIPS/eip-3860), [SSTORE2 implementation](https://github.com/0xsequence/sstore2). Values are EVM assumptions; chain estimates above are the direct BSC observations. Agent Reach Jina-reader routing used; optional agent-reach executable unavailable.


## Refined calibration / 校准补充

The saturated fit after subtracting intrinsic gas is H=52,250.58, alpha=1,920.69, beta=6,704.92. Its exact interpolation is algebra, not independent identification: latch count covaries with output count. The round1 planning ranges were priors, not fitted confidence intervals; use the explicit fit only for scenario estimates and a broader sensitivity (H20–60k, NAND1.8–3k, LATCH2.5–7k). For223 NAND+36 LATCH this gives511,400–981,000 execution gas, midpoint scenario721,941. Fitted H includes proxy/metadata/I/O work and is not a pure function-call overhead. In particular, 'per output byte' remains unidentified rather than fabricated.

Attempts at debug_traceCall first required a named tracer; callTracer is unavailable at this NodeReal account tier. trace_costs.json records the errors. No subscription change or transaction was made. Thus opcode traces and a true per-latch causal coefficient are unavailable under present access, and all gas extrapolations retain that limitation.

**Wrapper local EVM measurement:** solc0.8.24 optimized wrapper body, constant test addresses replacing immutables, actual EXTCODECOPY of the45-byte STOP+int4 bank,2392 STATICCALLs to an independent arithmetic reference CPU. Direct PyEVM message execution (no deployment/transaction) on two glyphs matched the integer model. Total17,732,578/17,732,985 gas; child CPU10,940,513/10,940,920; wrapper-exclusive6,792,065, or2,839.49/call. This includes148 nibble reads, packing, copying, dispatch and memory growth. It is NOT a measurement of official NAND evaluation or BSC wrapper execution. The scale tables retain5000/call for uncertainty/chunk bookkeeping; measured tiny wrapper overhead is0.393% of fitted NAND execution for2392 calls.

The bank-copy microstep count is148 reads:68 first-layer weights/biases once,20 second-layer weights/biases ×4 planes. It copies148 bytes to scratch, not2392 bytes. Its EXTCODECOPY opcode budget under cold/warm rules is2603 +147*103 =17,744 gas, before arithmetic/memory already captured in wrapper-exclusive gas. Deploying this bank has data deposit8,800 + STOP200 + CREATE32,000 =41,000 base gas, excluding transaction/initcode/factory costs. Packed off-chain bank supplied once could cost at most704 calldata gas for44 bytes; persistent availability is the reason to choose b.


## Added RISC-V route / 新增RISC-V路线

Read-only VM measurements at block121595394 in vm_chain.json: runtime14,490 bytes; cpuWords returns8 packed256-bit words; decoded PC0x800beb3c,43,757,231 instructions,47,111 ticks,not halted. Owner0x86DDaEF00401E3F10418398D67D7189fc458eA95. readPage(0/1) each1024 bytes. pages(0)=0xa2f0901b6f8f4304b95ea18ffa0bfe86f629605c has1025 runtime bytes, STOP+1024 data; public storage mapping slot2 agrees. These are observations, not a reconstruction of boot verification.

Full1KB page creation/deposit base =200*1025+32000=237000 gas, before metadata/transaction costs; repeated dirty-page writes create new pages. Sharing/zero pages can reduce actual deployment count. Code-bank24KB placement and VM1KB paging are different layouts and should not be conflated.

Local rv32ima dynamic counts: generic dense-layer kernel18P+20 instructions/int8 and28P+20/int4; same88-weight MLP953/int8 or1713/int4; full int8/Q10 port of the trained sort-3 transformer662735–662835 instructions,512/512 output matches. See rv32/results.json and rv32/REPORT.md. At the task-derived1400–4000 gas/instruction scenario, tiny MLP~1.33–6.85m; full transformer~0.928–2.651b. These are ISA counts multiplied by a published planning range, NOT chain gas benchmarks. Linux startup/syscalls/checkpoint writeback can change the totals; no tick/typeInput occurred.

Consequently software is hundreds to over1000× cheaper than the serial NAND core for the studied general-MAC kernels. Frozen172-gate sort remains thousands× cheaper than running full transformer software. General NAND MAC MMIO is a slowdown; a fixed whole-function accelerator may help. Recommendation changes to a local small-software integration pilot, while stopping production serial NAND inference. See the linked architecture addendum.
