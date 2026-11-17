# Machine reverse engineering / 机器逆向 — round 1

| Finding / 发现 | Evidence / 证据 |
|---|---|
| VM runtime / 机器字节码 |14,490 bytes, pinned in machine.bin/machine_reads.json |
| Page contract / 页合约 |STOP+1024 bytes=1025 code bytes; page0.bin |
| Source status / 源码状态 |Explorer reports unverified; no verified Solidity/Yul source recovered |
| Gas data / Gas数据 |80 public Ticked events plus receipts, chronological20-row holdout |
| Fit / 拟合 |G≈578245+11671F+962.12I+5470.59L+239714.66D |
| Validation / 验证 |R²0.999913; RMSE9702 gas; held-out RMSE11700,max42551 |
| Fixed workspace / 固定工作区 |Local replay memory489696 bytes, memory expansion503295 gas |

Machine0x5Ec71579c67EB01755bE6da9C3a26995f144115A, BSC chain56. Read-only snapshot block121599619. Current gas-price RPC returned50,000,000 wei=0.05gwei, so1m gas=0.00005BNB. This is a pinned quote, not a guaranteed future fee. No USD estimate.

## ABI and events / 接口与事件

selectors.json contains26 dispatcher candidates with confidence annotations. Hash-matched signatures include:

| Selector | Signature | Status / 状态 |
|---|---|---|
|0x8da5cb5b |owner() |read and storage confirmed |
|0x570ca735 |operator() |static getter of slot1 low160 bits |
|0x94ce5934 |cpuWords() |read8×uint256, slots3..10 |
|0x5c3e9cc2 |pages(uint256) |read mapping root2 |
|0xf2da9211 |readPage(uint256) |read1024-byte payload |
|0xe661437f |consoleSeq() |read getter, event sequence |
|0xfc7b6aee |tick(uint256) |historical public calldata; NOT called on chain |
|0xd07df946 |typeInput(bytes) |frontend ABI; NOT invoked |
|0x2f54bf6e |isOwner(address) |hash/static ownership path |
|0x13af4035 |setOwner(address) |hash match only; not invoked |
|0xb3ab15fb |setOperator(address) |hash match only; not invoked |
|0xf2e16cc8 |loadCpu(uint256[8]) |hash/static decoding; not invoked |
|0x28e30b31 |setPages(uint256[],address[]) |hash/static mapping writes; not invoked |
|0xf3fef3a3 |withdraw(address,uint256) |hash match only; not invoked |

Remaining selectors are retained as unknown; a signature registry lookup failed, and names were not fabricated. Selector collisions are possible; a hash guess is not proof of a complete ABI. Main dispatch covers the first~500 bytes, unlike124 total PUSH4s that also include opcode masks/constants.

Ticked(uint256 flips,uint256 instructions,uint256 loadedPages,uint256 dirtyPages,uint256 gasUsed,bool halted,uint256 cutFlips) has one topic and224 data bytes in observed receipts; topic0xf2e3a4f590164145e03233d90f536aa6162f9aba4b0fc275b37235614be9f77e. LOG cost alone=375+375+8*224=2542 gas, excluding memory/ABI work. Console(uint256 indexed seq,bytes data) is the frontend's serial-output ABI; dynamic data length and ABI padding determine its log cost. Eighty sampled tick events have event gasUsed exactly976 above receipt gasUsed, so regression uses receipts. That offset is observed, not assumed to be pure emission overhead.

## Storage and admin / 存储与管理

- Slot0: owner address0x86DDaEF00401E3F10418398D67D7189fc458eA95, confirmed by owner().
- Slot1 low160: operator0x631fea91458a8495f9a289a9b7059d9be475e570, an EOA at the sampled block. It is **not** another interpreter contract. Packed bytes at bits160 and168 are Boolean getters; remaining upper bits include0x05f5e100. Their public names remain unknown; do not label these as fees/gas limits without evidence.
- Slot2: mapping(uint256=>address) pages. Entryi is keccak256(abi.encode(i,2)); readPage/pages/static getter and historical COW replay agree.
- Slots3..8:48 packed32-bit machine words, low32 first within each storage word:32 integer registers +16 PC/CSR/state fields. Slots9..10 carry extra counters/status and accumulated flips. Exact mapping in snapshots. cpuWords returns all8 slots, not a Solidity array of48 elements.
- Slots11..13 hold additional zero/zero/100 values in this snapshot; serial buffers/config roles are not fully recovered. Unknown is explicit.

The owner is an ERC-6551 container. Its owner() resolves to0x571d447f4f24688ec35ccf07f1d6993655f6af15. token() binds chain56, token contract0x50A994E71615474b55559fF4F500928fbc339DD9, tokenId4246. The ownership helper at EVM offset0x0b5d accepts the stored owner directly; when that owner has code, it STATICCALLs owner() with a50,000 gas allowance and compares the returned address. This makes the NFT/container owner's authority relevant, but does not prove the machine is immutable or permissionless. Operator permission is separate. Historical tick senders can differ from the operator; the public tick path is not equivalent to privileged state/model installation.

## Tick and page flow / Tick与分页

Static disassembly plus exact local historical replay supports this control flow:

1. Entry validates configuration/status and allocates a large fixed working address range (free-memory pointer0x77800 at offset0x16b6). Unpacks registers/CSR words into memory.
2. Runs bounded interpreter flips, at most1024 instructions per flip with earlier exits. `tick(maxFlips)` is a transaction call; one call can execute multiple flips. These two meanings of “tick” must not be mixed.
3. Fetches needed1KB pages via mapping and EXTCODECOPY; keeps a working page cache inside the call. Event L counts actual page loads; it is not automatically the sum of unique pages across unrelated calls.
4. Writes dirty pages as new STOP-prefixed code contracts using CREATE and updates mapping entries. The old code remains available. No in-place mutation of code. Historical replay reproduces new addresses and data exactly when the original VM nonce is loaded.
5. Re-packs CPU state/counters into slots, emits Console when appropriate and one Ticked record, with additional call/payment paths visible in disassembly. Their exact economic configuration is not inferred from names alone.

Instruction bytes/page-word ordering must be handled carefully: readPage payload is not directly a conventional little-endian ELF RAM image. The independent mini-rv32ima adapter remains under validation; exact bytecode replay already establishes the deployed machine's behavior without guessing this encoding.

## Fitted gas model and limitations / Gas拟合与边界

For a transaction containingF flips,I instructions,L page loads,D dirty pages:

`Greceipt = 578245 + 11671F + 962.12I + 5470.59L + 239714.66D + residual`.

Sample support: F3–5,I1620–4447,L62–132,D7–20; gas4.354–9.870m. Rank5, condition number26510 in unscaled units. Fitted coefficients are correlated descriptive costs for this workload, not isolated opcode prices. Small hot-page programs lie outside the sampled locality range; estimates need uncertainty and local twin checks. Twenty chronological holdout rows were not used in the initial60-row fit, then all80 were used for final coefficients. Full gas_fit.json/tick_receipts.json retained. debug_traceTransaction is denied by the provider subscription; public_trace.json records that limitation.

Local exact-bytecode replay independently exposes memory489696 bytes and expansion cost503295. That is~87% of the fitted fixed term, but should not be subtracted twice: the regression fixed term already includes it. Sixteen CREATE children consume3,283,584 gas (~205224 each), plus parent CREATE costs32k each and mapping/account work; this supports the~239715/D coefficient. A full1KB page's code-deposit+CREATE base is200*1025+32000=237000.

BatchingB requests in one call can amortize the~578k fixed term and preserve working-page reuse. It cannot abolish instruction execution, flip overhead or all page writes. Keeping state in registers/scratch memory during a batch and committing one output page at the end can avoid repeated~240k writes. Across transactions EVM memory/warmth is reset; scheduling same-model jobs improves locality and avoids swapping many banks, but does not make a page free to load forever. A proposed persistent hot-page mechanism has its own storage/account costs and requires measurement.

The user-supplied FP4 lesson is incorporated: compact storage does not dictate arithmetic representation. RV32M already offers multiply; LUT costs must include decoding,indexing and memory/page traffic. Signed FP4 E2M1 operands scaled×2 fit int8, but products up to±144 need int16. Exact product tables do not remove block scales, accumulation or quantization rules. No “hardware limit” is claimed from the serial core's first implementation.

Sources: pinned chain bytes/events/receipts, [TapeOut live page and ABI](https://tapeout.net/linux.html), [EIP-2929](https://eips.ethereum.org/EIPS/eip-2929). Source is unverified; static interpretation and regression uncertainty remain explicit.
