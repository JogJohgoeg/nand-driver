# Check it yourself

> You don't have to trust us: recompute the website files, circuits and models on chain with your own commands. The first four you can do right now.

## What you need

- Foundry's `cast` (see [Quickstart](quickstart.md) to install it), `curl`, and a sha256 tool
- Everything here is read-only; no wallet needed

## 1. A file matches the fingerprint recorded on chain

What it checks: any file on this site. Against what: the sha256 recorded on chain for each file.

```sh Read the size and sha256 recorded on chain
cast call 0xd006ffdd5ae313b17729621a00999cd3c71ce5e6 \
  "fileInfo(address,string)(uint32,string,bytes32,uint40,uint256)" \
  0x39d97ab281f04a5bc3aCc562f8DeA3f0b4266aA3 home.css \
  --rpc-url https://bsc-rpc.publicnode.com
```

```sh Download the same file and compute it yourself (on macOS use shasum -a 256)
curl -s https://282-732.aihashrate.stream/home.css | sha256sum
```

- When it passes: the two sha256 values are the same (drop the leading `0x` from the on-chain one).
- Replace `home.css` with another path; it works the same for every file.

## 2. Run a circuit on chain

What it checks: the result circuit #279, "21 gates that drive", gives on chain. Needs Foundry's `cast`.

```sh Call circuit #279 on the TapeOut CPU
cast call 0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38 \
  "eval(uint256,bytes)(bytes)" 279 0xff7f \
  --rpc-url https://bsc-rpc.publicnode.com
```

A read-only call, free of charge. For contract addresses see [Contract addresses](../reference/contracts.md).

## 3. Check in your browser

- [Model machine](../machine/index.md): the page computes the sha256 of the model file and of its output on the spot, and compares them with the values shown on the page.
- [The Bard's design files](https://1-2-245.aihashrate.stream/bard/v8g/): fetch the full design files from X Layer and check them byte for byte.

## 4. Check the Bard's design files without a gateway

See "Method three" in [Fetch the design files from the chain](../bard/fetch.md): use `cast` to read, straight from X Layer, the sha256 recorded for the two file parts.

## 5. Check everything at once with tapemule (once the repository is public)

> The repository of the tapemule command-line tool is not public yet, so these two checks can only be run once it is. Its advantage is that it checks everything in one go: readings are pinned to a finalized block, and a result only counts when at least 2 independent nodes agree.

```sh Get the command-line tool (once the repository is public)
git clone https://github.com/BruceLanLan/tapemule.git
cd tapemule
npm ci
```

### The Hub contracts are the pinned implementation

What it checks: the Hub contracts on three chains. Against what: the code on chain and the implementation address match the ones pinned in tapemule.

```sh Check the Hub on BNB Chain
npm run tape -- hub bnb
```

```sh Check the other two chains
npm run tape -- hub base && npm run tape -- hub xlayer
```

- When it passes: it prints a "check passed" line for the chain (the tool's messages are in Chinese for now), exit code 0.
- Readings are pinned to a finalized block, and a result only counts when at least 2 independent nodes agree.

### Every file of a site

What it checks: the container, holder and activation status of a `.tape` site, and the bytes of every file. Against what: the sha256 recorded on chain for each file.

```sh Check every file of 282.732.tape
npm run tape -- open 282.732.tape --files
```

- When it passes: one `verified` line per file, exit code 0.
- If any file is not `verified` or can't be read, exit code 1.
- It works the same for other site names, for example `1.2.245.tape` or `288.732.tape`.

## Where you have to trust someone else

Check 1 compares the file you downloaded with the sha256 recorded on chain. The record itself depends on a contract, so here is who controls it.

- This site's file list is recorded in the protocol's site registry contract, `0xd006ffdd5ae313b17729621a00999cd3c71ce5e6`. We did not write this contract.
- Its admin address is `0xe4fc10592fa8ad7c408b81e99cfc54ef4b14283d`. It is an ordinary single-key wallet, not a wallet shared by several keys. Read-only check on 2026-11-14 (block 133519690, three public nodes gave the same result): the address has no contract code and has sent 13 transactions.
- What this means: the contract can be upgraded, and only the admin address can upgrade it. The code is frozen only after the admin gives up control, which has not happened (according to the source verified on the block explorer and the same read-only check). After an upgrade, what is recorded could in principle be changed, and we could not stop it.
- How you can protect yourself: the sha256 you read in check 1 was read at a particular block. Read it with a block number, read it again from another node at the same block number, accept it only if the two agree, then keep the block number and the sha256 together. We do not currently publish a second copy of the file list anywhere else to compare against: the file list on the site-list page is stored in this same registry contract, so it does not count as a second place.

```sh Read at a block number (get the latest block first, use the same one on both nodes)
B=$(cast block-number --rpc-url https://bsc-rpc.publicnode.com)
cast call 0xd006ffdd5ae313b17729621a00999cd3c71ce5e6 \
  "fileInfo(address,string)(uint32,string,bytes32,uint40,uint256)" \
  0x39d97ab281f04a5bc3aCc562f8DeA3f0b4266aA3 home.css \
  --block $B --rpc-url https://bsc-dataseed.bnbchain.org
```

- Public nodes keep state only for a short run of recent blocks, so you cannot re-read at an old block number later. We tried three nodes on 2026-11-14: all answered for 10 blocks back, only one answered for 1000 blocks back, and none answered for 20000 blocks back.
- Not checked: whose key this is; what its 13 past transactions did.

The market contract used for buying and selling circuits is a different contract. It can also be upgraded; the right to upgrade sits with a wallet shared by several keys, where 3 of 5 keys must sign (read-only check, 2026-11-12).



## Checks whose scripts are not public yet

> The scripts for these checks are not public yet. Below we only say what each checks, against what, and what you see when it passes.

| What it checks | Against what | When it passes |
|---|---|---|
| TapeBoot test vectors for canonical form, signing and fetching (C version) | A fixed set of test vectors, no private keys | All pass, 0 failures |
| The same vectors (TS reference client) | Same as above | 14 pass |
| Netlists of 11 circuits on chain | A three-way sha256 comparison: the one stored on chain, the one in the burn transaction, and the copy we keep | One "match" line per circuit, exit code 0 |

The third check covers these circuits: 279.732 to 287.732 and 290.732 on BNB Chain, and 3.2.245 on X Layer. Changing a single byte makes it report a mismatch, exit code 1.
