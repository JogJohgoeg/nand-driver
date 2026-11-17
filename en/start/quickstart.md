# Quickstart

> Read the fingerprint a file has on the blockchain, then download the file and compute it yourself. If the two match, it has not been changed. Read-only, no wallet.

## What you need

- Foundry's `cast`: a command-line tool for reading the chain.
- `curl` and a sha256 tool: built into macOS and Linux; on Windows use PowerShell.
- An internet connection: the commands talk to a public node and to this site's gateway.

## 1. Install cast

::: tabs
@@ macOS
```sh Install Foundry (cast comes with it); reopen the terminal as prompted, then run foundryup
curl -L https://foundry.paradigm.xyz | bash
```
@@ Linux
```sh Install Foundry (cast comes with it); reopen the terminal as prompted, then run foundryup
curl -L https://foundry.paradigm.xyz | bash
```
@@ Windows
```powershell On Windows, Foundry needs WSL; install WSL, then follow the Linux steps inside it
wsl --install
```
:::

## 2. Read the fingerprint recorded on chain

```sh Ask the website file store on BNB Chain how big home.css of 282.732.tape is and what fingerprint it has
cast call 0xd006ffdd5ae313b17729621a00999cd3c71ce5e6 \
  "fileInfo(address,string)(uint32,string,bytes32,uint40,uint256)" \
  0x39d97ab281f04a5bc3aCc562f8DeA3f0b4266aA3 home.css \
  --rpc-url https://bsc-rpc.publicnode.com
```

You get 5 lines: size, type, sha256, last update time, number of chunks. Note the sha256 on line 3.

## 3. Download the file and compute it yourself

::: tabs
@@ macOS
```sh Download home.css from this site's gateway and compute its sha256
curl -s https://282-732.aihashrate.stream/home.css | shasum -a 256
```
@@ Linux
```sh Download home.css from this site's gateway and compute its sha256
curl -s https://282-732.aihashrate.stream/home.css | sha256sum
```
@@ Windows
```powershell Download home.css from this site's gateway and compute its sha256
Invoke-WebRequest https://282-732.aihashrate.stream/home.css -OutFile home.css; Get-FileHash home.css -Algorithm SHA256
```
:::

If it equals the sha256 from step 2 (drop the leading `0x`), the bytes you got are exactly the ones recorded on chain.

> It doesn't matter who runs the gateway: the fingerprint is on chain and you compute the bytes yourself. Read it again from another node (for example `--rpc-url https://bsc-dataseed.bnbchain.org`) and you should get the same result.

## 4. Try another file

Replace `home.css` with another path, such as `index.html` or `start/quickstart.html`. Every file on this site is recorded in the same container, `0x39d97ab281f04a5bc3aCc562f8DeA3f0b4266aA3`.

## Next

- [Check it yourself](verify.md): more things you can recompute.
- [Contract addresses](../reference/contracts.md): the contracts used above.
- [Model machine](../machine/index.md): run a binary model in your browser.
