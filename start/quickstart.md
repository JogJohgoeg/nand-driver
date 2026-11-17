# 快速上手

> 从区块链读出一个文件登记的指纹，再下载这个文件自己算一遍，两边一样就说明没被改过。只读，不用钱包。

## 你需要

- Foundry 的 `cast`：读链用的命令行工具。
- `curl` 和算 sha256 的工具：macOS、Linux 自带，Windows 用 PowerShell。
- 能上网：命令会连一家公共节点和本站的网关。

## 1. 装 cast

::: tabs
@@ macOS
```sh 装 Foundry（cast 在里面），按提示重开终端后再跑 foundryup
curl -L https://foundry.paradigm.xyz | bash
```
@@ Linux
```sh 装 Foundry（cast 在里面），按提示重开终端后再跑 foundryup
curl -L https://foundry.paradigm.xyz | bash
```
@@ Windows
```powershell Foundry 在 Windows 上要用 WSL；装好 WSL 后在里面照 Linux 的做
wsl --install
```
:::

## 2. 读链上登记的指纹

```sh 问 BNB Chain 上的网站文件仓库：282.732.tape 的 home.css 登记了多大、什么指纹
cast call 0xd006ffdd5ae313b17729621a00999cd3c71ce5e6 \
  "fileInfo(address,string)(uint32,string,bytes32,uint40,uint256)" \
  0x39d97ab281f04a5bc3aCc562f8DeA3f0b4266aA3 home.css \
  --rpc-url https://bsc-rpc.publicnode.com
```

输出 5 行：大小、类型、sha256、更新时间、分了几块。记下第 3 行的 sha256。

## 3. 下载这个文件自己算

::: tabs
@@ macOS
```sh 从本站网关下载 home.css，算 sha256
curl -s https://282-732.aihashrate.stream/home.css | shasum -a 256
```
@@ Linux
```sh 从本站网关下载 home.css，算 sha256
curl -s https://282-732.aihashrate.stream/home.css | sha256sum
```
@@ Windows
```powershell 从本站网关下载 home.css，算 sha256
Invoke-WebRequest https://282-732.aihashrate.stream/home.css -OutFile home.css; Get-FileHash home.css -Algorithm SHA256
```
:::

和第 2 步的 sha256 一样（去掉开头的 `0x`），就说明你拿到的字节就是链上登记的那份。

> 网关是谁开的都没关系：指纹在链上，字节你自己算。换一家节点再读一次（比如 `--rpc-url https://bsc-dataseed.bnbchain.org`），结果应该相同。

## 4. 换一个文件

把 `home.css` 换成别的路径，比如 `index.html`、`start/quickstart.html`。本站所有文件都登记在同一个容器 `0x39d97ab281f04a5bc3aCc562f8DeA3f0b4266aA3` 里。

## 下一步

- [自己核对](verify.md)：更多能复算的东西。
- [合约地址](../reference/contracts.md)：上面用到的合约。
- [模型机](../machine/index.md)：在浏览器里跑一个二值模型。
