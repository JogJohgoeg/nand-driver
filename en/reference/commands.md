# Commands you can check

> For everything on chain and everything we publish: what it checks, against what, which command, and what you see when it passes. All read-only, no wallet.

> The repository of the tapemule command-line tool is not public yet, so the commands below that use it can only be run once it is. You can check a single file without it: see [Quickstart](../start/quickstart.md).
## Set up first

```sh Download tapemule and install its dependencies (needs Node.js 22 or newer)
git clone https://github.com/BruceLanLan/tapemule.git
cd tapemule
npm ci
```

Run all the tapemule commands below inside this directory. Every chain read is pinned to a finalized block, and a result only counts when at least two independent nodes agree.

## Overview

| # | What it checks | Against what | Command | When it passes |
|---|---|---|---|---|
| 1 | The Hub contracts on three chains are the pinned implementation | The code on chain and the implementation address match the ones pinned in tapemule | `npm run tape -- hub bnb` (same for `base`, `xlayer`) | A "check passed" line (the tool's messages are in Chinese for now), exit code 0 |
| 2 | A `.tape` site: container, holder, activation, and the bytes of every file match the fingerprint recorded on chain | The sha256 recorded on chain for each file | `npm run tape -- open <name> --files` | One `verified` line per file, exit code 0; if any file is not, exit 1 |
| 3 | A local file you have is exactly the one recorded for a path of a site | The size and sha256 recorded on chain for that path; it reads only the record, without downloading the content | Not merged into tapemule's main branch yet | `verified`, exit code 0; change one byte and it is `incomplete`, exit 1 |
| 4 | TapeBoot test vectors for canonical form, signing and fetching (C version) | Test vectors, no private keys | Script not public | All pass, 0 failures |
| 5 | The same test vectors (TS reference client) | Same as above | Script not public | All 14 pass |
| 6 | Netlists of 10 circuits on chain: stored on chain = in the burn transaction = kept in our repository | `netlist(id)` and `circuitInfo(id)` on chain; the input and receipt of the burn transaction; the netlist file in the repository. A three-way sha256 comparison | Script not public | One line per circuit: the first 12 characters of the three sha256 values plus "match"; exit 0 if all match, exit 1 on any mismatch or read failure, exit 2 if nothing mismatches but one circuit is missing a source |
| 7 | The model machine's toy model and the text it writes | The file sha256 and the output sha256 | Open the [model machine](../machine/index.md) and tap "Write 200 characters" | Both sha256 values match the ones shown on the page |

## 1. Hub contracts

```sh Check the Hub on all three chains
npm run tape -- hub bnb && npm run tape -- hub base && npm run tape -- hub xlayer
```

- Each chain prints a "check passed" line, exit code 0.
- If it fails, it prints "did not pass" with the reason, exit code 1.
- For the addresses see [Contract addresses](contracts.md).

## 2. Every file of a site

```sh Read every file of 282.732.tape and compare it with the sha256 recorded on chain
npm run tape -- open 282.732.tape --files
```

- First it prints the container, the holder, the date activation runs until, the block the reading is pinned to, which nodes agree, and the number of files.
- Then one line per file: verdict, path, number of bytes.
- Only `verified` counts as passing. The other three: `unverified` (no fingerprint recorded on chain), `incomplete` (length or hash doesn't match), `missing` (no such path on chain).
- Use `1.2.245.tape` instead to check the site that holds the Bard's design files.

```sh The same result as JSON
npm run tape -- open 282.732.tape --files --json
```

## 6. Netlists of circuits on chain

| Circuit | Chain | Processor |
|---|---|---|
| 279.732 to 287.732, 9 in total | BNB Chain | CPU #732 |
| 3.2.245 | X Layer | #245 |

For 282.732 this only checks the circuit netlist; its website files are checked with item 2.

The script is not public yet. You can still check it yourself without it:

1. Call `netlist(id)` on the processor contract with `eth_call` and compute its sha256.
2. Find the burn transaction of this circuit, decode the netlist bytes according to `tapeout(bytes,uint32,uint32)`, and compute their sha256. The receipt must have status = 1, be sent to this processor, and contain a `TapedOut(id)` event.
3. If the two sha256 values are the same, what is stored on chain is the same as what was burned in.

For how the netlist bytes are laid out, see [Netlist format](netlist.md).

## Other read-only commands

```sh List the sites on one chain and check activation (BNB takes a few minutes)
npm run tape -- sites bnb
```

```sh Search the site data by keyword (doesn't read the chain)
npm run tape -- search <keyword>
```

Add `--json` to any command for JSON output.
