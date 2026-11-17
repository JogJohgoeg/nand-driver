# Scale study / 规模研究

| P / 参数 | int4 bytes / 字节 | banks / 银行 | deployment lower gas / 部署下界 | microsteps lower / 步数下界 | inference gas estimate / 推理估计 | warm sensitivity / 热读取假设 | depth1 feedback gas / 深度1反馈 | ideal256 scenario / 理想256 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 500 | 1 | 132,000 | 64,000 | 46,524,608,551 | 39,612,716,551 | 3,222,425,630,090 | 3,831,873,912 |
| 10,000 | 5,000 | 1 | 1,032,000 | 640,000 | 465,246,063,013 | 396,126,171,013 | 32,224,256,278,397 | 38,318,716,619 |
| 100,000 | 50,000 | 3 | 10,096,000 | 6,400,000 | 4,652,460,612,628 | 3,961,260,720,628 | 322,242,562,766,474 | 383,187,148,686 |
| 1,000,000 | 500,000 | 21 | 100,672,000 | 64,000,000 | 46,524,606,103,782 | 39,612,606,211,782 | 3,222,425,627,642,244 | 3,831,871,464,359 |

Core interpolator execution = 721,941 gas/step; wrapper assumption = 5000. Depth1 = 4,572,309/call × 11 calls per dependent transition. Values are scenarios, not measured new-core gas. Deployment column excludes bank STOP deposits, initcode, factory/transaction costs and model metadata. No token pricing or burns. All parameter counts include biases; T=64P excludes per-neuron clear and shift, so it is a lower step count for general uint4 dense layers.

Arithmetic range: signed16 wrapping is the verified core semantics. Exact mathematical integer inference requires each scheduled partial accumulator in [-32768,32767]. A simple sufficient layer bound is 120*fan_in + abs(bias) <=32767; larger fan-in needs wider or multiword accumulation. These tables describe tiled narrow layers with enough wrapper activation memory, NOT a promise that a million-input neuron fits this core. Activations, graph schedule, output storage and checkpoint costs are extra.

Each 16-step add caches one nibble; four bit planes read each weight four times. A literal read-every-microstep wrapper pays 103*T warm EXTCODECOPY gas rather than 103*4P. Both are tiny versus ~0.7m CPU gas per microstep. Bank access is cold once per bank per transaction; separate transactions repeat that cost. 5000 gas/step wrapper assumption dominates copying but is <1% of baseline evaluator. With ideal256 gate batching it rises to roughly8%; if evaluator+dispatch ever falls below5000, wrapper scheduling/ABI dominates. No parameter-count crossover occurs for a streaming O(P) wrapper and O(P) evaluator with fixed width; both slopes stay constant.

At the measured block gas limit70m, even1k parameters requires hundreds of full blocks of equivalent gas; block numbers are capacity lower bounds, not latency forecasts. A one-shot view call may hit RPC gas/time limits and cannot establish cross-transaction state. Production needs bounded chunks and authenticated checkpoints. Warm sensitivity subtracts2000 per assumed packed netlist slot after the first call; storage layout and chunk resetting are unmeasured, so this is not a measured warm benchmark.

Depth1 lowers structural C from344729 to809 (426×) but adds620 internal latches and multiplies dependent calls by11. It helps independent frame throughput only with enough interleaved accumulators and a scheduler; it does not provide one-step recurrent MAC latency. Such interleaving is a different architecture and has not been built.

Bit slicing is NOT automatically256 arbitrary NANDs per EVM word: arbitrary fan-in gathers, lane permutations, dependencies, decode and packing remain. A word naturally evaluates the SAME gate over256 independent inferences. Parallel gates at one level only batch when fan-ins are already aligned. ideal256 column unrealistically divides all element work by256 while retaining fixed dispatch; it is an optimistic scenario, not a claimed implementation speedup. A native EVM int4/int256 arithmetic loop is the necessary economic baseline before spending on a new evaluator.

Latches: extra scan term alone at1k weights is 1,716,458,666,667 gas/inference under the fitted coefficient (large extrapolation). At1M parameters it scales1,000,000×. The asymptotic quadratic conclusion is robust; the extrapolated number is not a benchmark. Model reload/selection gates and packed state traffic worsen it.

## Unified routes (a)/(b)/(c)/(d) / 四路线统一比较

| P | (a) batched packed stream | (b) bytecode-fed NAND | (c) EXTRA latch scan only | (d) rv32 int4 low | (d) rv32 int4 high |
|---:|---:|---:|---:|---:|---:|
| 1,000 | 46,524,202,051 | 46,524,608,551 | 1,716,458,666,667 | 39,228,000 | 112,080,000 |
| 10,000 | 465,242,020,513 | 465,246,063,013 | 171,645,866,666,667 | 392,028,000 | 1,120,080,000 |
| 100,000 | 4,652,420,205,128 | 4,652,460,612,628 | 17,164,586,666,666,666 | 3,920,028,000 | 11,200,080,000 |
| 1,000,000 | 46,524,202,051,282 | 46,524,606,103,782 | 1,716,458,666,666,666,496 | 39,200,028,000 | 112,000,080,000 |

Gas scenarios, not chain benchmarks. (a) assumes a batched wrapper takes the whole packed model as calldata once/inference and derives serial bits, with the same5000/call scheduling assumption as(b); no model-binding proof charged. One transaction per raw step adds repeated intrinsic/cold costs instead. (c) column is an additional lower work term on top of the base core, not a full feasible design. (d) is a dense-layer checksum kernel and excludes full network scheduling/activation writes; the same-model full tiny MLP is measured separately. These boundaries prevent mistaking the tables for equal end-to-end benchmark guarantees.
