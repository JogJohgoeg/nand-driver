# 从链上取回设计图

> 吟游诗人的完整签核版图存在 X Layer 上。取回两段，拼回原文件，核对 sha256。

## 存在哪

| 项 | 值 |
|---|---|
| 链 | X Layer |
| 站点 | 1.2.245.tape，路径 `bard/v8g/` |
| 容器 | `0x75c6E2D063963561c08c838476111adda7a1a6CD` |
| 文件 | `int_c16_machine.oas`（签核版完整版图，OASIS 格式） |
| 大小 | 11,155,630 字节 |
| sha256 | `3a03c0091f475c540fc6dcb022924ebfb03da13a10a62096d0c63cc4e404de0d` |
| 上链日期 | 2026-10-12 |

链上单个文件有大小上限，所以拆成了两段：

| 段 | 大小 | sha256 |
|---|---|---|
| `int_c16_machine.oas.part1` | 5,577,816 字节 | `714c384d9d39e4639dd4ed53c2f744db2b3c4754614ec64a826a484c0b87c9fa` |
| `int_c16_machine.oas.part2` | 5,577,814 字节 | `f2bc44baa5cb101a12985ee1f196f3e4077d9d29e2f1b38ccc74504d9584b7b7` |

## 方法一：在浏览器里取回

1. 打开 [取回页](https://1-2-245.aihashrate.stream/bard/v8g/)。
2. 点「取回并核对」。页面从链上取回两段，拼回原文件，核对 sha256，再保存到你的电脑。

## 方法二：用命令行下载并核对

::: tabs
@@ macOS
```sh 下载两段
curl -O https://1-2-245.aihashrate.stream/bard/v8g/int_c16_machine.oas.part1
curl -O https://1-2-245.aihashrate.stream/bard/v8g/int_c16_machine.oas.part2
```
```sh 拼回原文件，算 sha256
cat int_c16_machine.oas.part1 int_c16_machine.oas.part2 > int_c16_machine.oas && shasum -a 256 int_c16_machine.oas
```
@@ Linux
```sh 下载两段
curl -O https://1-2-245.aihashrate.stream/bard/v8g/int_c16_machine.oas.part1
curl -O https://1-2-245.aihashrate.stream/bard/v8g/int_c16_machine.oas.part2
```
```sh 拼回原文件，算 sha256
cat int_c16_machine.oas.part1 int_c16_machine.oas.part2 > int_c16_machine.oas && sha256sum int_c16_machine.oas
```
@@ Windows
```powershell 下载两段（PowerShell）
curl.exe -O https://1-2-245.aihashrate.stream/bard/v8g/int_c16_machine.oas.part1
curl.exe -O https://1-2-245.aihashrate.stream/bard/v8g/int_c16_machine.oas.part2
```
```powershell 拼回原文件，算 sha256（在 cmd 里拼，避免 PowerShell 改字节）
cmd /c copy /b int_c16_machine.oas.part1 + int_c16_machine.oas.part2 int_c16_machine.oas
Get-FileHash -Algorithm SHA256 int_c16_machine.oas
```
:::

结果应该是 `3a03c0091f475c540fc6dcb022924ebfb03da13a10a62096d0c63cc4e404de0d`，文件 11,155,630 字节。

> 也可以在浏览器里用 TapeOut 官方网关打开 [1-2-245.tapekit.org/bard/v8g/](https://1-2-245.tapekit.org/bard/v8g/)。它在浏览器里直接从链上读文件，所以要用浏览器开，不能用 curl 下载。

## 方法三：不经网关，直接读链核对

```sh 读 X Layer 上登记的第一段：大小、类型、sha256（要装 Foundry 的 cast）
cast call 0xd6efb7adcc9c83dc4924ad56f6a8e4e969b9adb6 \
  "fileInfo(address,string)(uint32,string,bytes32,uint40,uint256)" \
  0x75c6E2D063963561c08c838476111adda7a1a6CD bard/v8g/int_c16_machine.oas.part1 \
  --rpc-url https://rpc.xlayer.tech
```

- 第 3 行的 sha256 和上面表里 part1 的一样，就说明链上登记的就是这份。把 `part1` 换成 `part2` 再核第二段。
- 这条命令只读登记，不下载文件。要拿到文件，用方法一或方法二。

> tapemule 命令行的 `npm run tape -- open 1.2.245.tape --files` 能一次核完所有文件，但它的仓库现在还没公开，公开后才能用。

## 同目录还有什么

| 文件 | 内容 |
|---|---|
| `manifest.json` | 签核结果、网表指纹、GDS 指纹、两段的大小和 sha256 |
| `SHA256SUMS.txt` | 发布时全部文件的校验和 |
| `index.html`、`get.js` | 取回页本身 |

- [manifest.json](https://1-2-245.aihashrate.stream/bard/v8g/manifest.json)
- [SHA256SUMS.txt](https://1-2-245.aihashrate.stream/bard/v8g/SHA256SUMS.txt)

> GDS 文件（964,493,412 字节）不在链上。从这份 OASIS 重新导出的 GDS 不一定逐字节相同；以链上的 OASIS 为准。

## 下一步

- [合约地址](../reference/contracts.md)：容器和站点合约。
- [吟游诗人芯片](index.md)：签核结果和进度。
