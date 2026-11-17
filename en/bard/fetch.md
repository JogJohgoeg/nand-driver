# Fetch the design files from the chain

> The Bard's full sign-off layout is stored on X Layer. Fetch the two parts, join them back into the original file, and check the sha256.

## Where it is stored

| Item | Value |
|---|---|
| Chain | X Layer |
| Site | 1.2.245.tape, path `bard/v8g/` |
| Container | `0x75c6E2D063963561c08c838476111adda7a1a6CD` |
| File | `int_c16_machine.oas` (full sign-off layout, OASIS format) |
| Size | 11,155,630 bytes |
| sha256 | `3a03c0091f475c540fc6dcb022924ebfb03da13a10a62096d0c63cc4e404de0d` |
| Date put on chain | 2026-10-12 |

A single file on chain has a size limit, so it is split into two parts:

| Part | Size | sha256 |
|---|---|---|
| `int_c16_machine.oas.part1` | 5,577,816 bytes | `714c384d9d39e4639dd4ed53c2f744db2b3c4754614ec64a826a484c0b87c9fa` |
| `int_c16_machine.oas.part2` | 5,577,814 bytes | `f2bc44baa5cb101a12985ee1f196f3e4077d9d29e2f1b38ccc74504d9584b7b7` |

## Method one: fetch in your browser

1. Open the [fetch page](https://1-2-245.aihashrate.stream/bard/v8g/).
2. Click "Fetch and check". The page fetches the two parts from the chain, joins them back into the original file, checks the sha256, and saves the file to your computer.

## Method two: download and check on the command line

::: tabs
@@ macOS
```sh Download the two parts
curl -O https://1-2-245.aihashrate.stream/bard/v8g/int_c16_machine.oas.part1
curl -O https://1-2-245.aihashrate.stream/bard/v8g/int_c16_machine.oas.part2
```
```sh Join them back into the original file and compute the sha256
cat int_c16_machine.oas.part1 int_c16_machine.oas.part2 > int_c16_machine.oas && shasum -a 256 int_c16_machine.oas
```
@@ Linux
```sh Download the two parts
curl -O https://1-2-245.aihashrate.stream/bard/v8g/int_c16_machine.oas.part1
curl -O https://1-2-245.aihashrate.stream/bard/v8g/int_c16_machine.oas.part2
```
```sh Join them back into the original file and compute the sha256
cat int_c16_machine.oas.part1 int_c16_machine.oas.part2 > int_c16_machine.oas && sha256sum int_c16_machine.oas
```
@@ Windows
```powershell Download the two parts (PowerShell)
curl.exe -O https://1-2-245.aihashrate.stream/bard/v8g/int_c16_machine.oas.part1
curl.exe -O https://1-2-245.aihashrate.stream/bard/v8g/int_c16_machine.oas.part2
```
```powershell Join them back into the original file and compute the sha256 (join them in cmd, so PowerShell can't change the bytes)
cmd /c copy /b int_c16_machine.oas.part1 + int_c16_machine.oas.part2 int_c16_machine.oas
Get-FileHash -Algorithm SHA256 int_c16_machine.oas
```
:::

The result should be `3a03c0091f475c540fc6dcb022924ebfb03da13a10a62096d0c63cc4e404de0d`, and the file should be 11,155,630 bytes.

> You can also open [1-2-245.tapekit.org/bard/v8g/](https://1-2-245.tapekit.org/bard/v8g/) in your browser, through the official TapeOut gateway. It reads the files straight from the chain inside the browser, so you must open it in a browser. You can't download from it with curl.

## Method three: skip the gateway and check by reading the chain

```sh Read what X Layer records for the first part: size, type, sha256 (needs Foundry's cast)
cast call 0xd6efb7adcc9c83dc4924ad56f6a8e4e969b9adb6 \
  "fileInfo(address,string)(uint32,string,bytes32,uint40,uint256)" \
  0x75c6E2D063963561c08c838476111adda7a1a6CD bard/v8g/int_c16_machine.oas.part1 \
  --rpc-url https://rpc.xlayer.tech
```

- If the sha256 on line 3 is the same as the one for part1 in the table above, the chain records this exact file. Replace `part1` with `part2` to check the second part.
- This command only reads the record. It does not download the file. To get the file, use method one or method two.

> `npm run tape -- open 1.2.245.tape --files` from the tapemule command-line tool checks every file in one go, but its repository is not public yet. You can use it once the repository is public.

## What else is in the same directory

| File | Contents |
|---|---|
| `manifest.json` | Sign-off results, netlist fingerprint, GDS fingerprint, and the size and sha256 of the two parts |
| `SHA256SUMS.txt` | Checksums of all files at release |
| `index.html`, `get.js` | The fetch page itself |

- [manifest.json](https://1-2-245.aihashrate.stream/bard/v8g/manifest.json)
- [SHA256SUMS.txt](https://1-2-245.aihashrate.stream/bard/v8g/SHA256SUMS.txt)

> The GDS file (964,493,412 bytes) is not on chain. A GDS exported again from this OASIS file may not be byte for byte identical. The OASIS file on chain is the one that counts.

## Next

- [Contract addresses](../reference/contracts.md): the container and site contracts.
- [The Bard chip](index.md): sign-off results and progress.
