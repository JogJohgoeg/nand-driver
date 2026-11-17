# Web2TapeOpener（开户合约）

没有 TapeOut 空间的人一笔交易开好一个：铸 1 个 NAND → 烧录 1 门电路（付烧录费）→ 开通容器 → 名字付 1 个月 → 电路转到调用者名下 → 余款转给 web2tape 页面的临时上传钥匙。
合约不持有任何东西、没有管理员、不能升级。上传授权（setOperator）仍由用户自己签；支持 EIP-5792 的钱包里，web2tape 把开户和授权合成一次确认。

- X Layer 价格（2026-10-01 分叉链实测）：0.10806 OKB = NAND 0.00076 + 烧录 0.0013 + 开通 0.08 + 名字 0.026/月
- 测试（远程 build-host，X Layer 分叉）：`anvil --fork-url https://rpc.xlayer.tech --port 8623`，然后 `forge test --fork-url http://127.0.0.1:8623 -vv`（3 项全过）
- 构造参数（X Layer）：factory 0x1f09DAeFA827f02CBb40967cc91b259763760761、opener 0x536adD8F30f03b69f6fbF29d425A816A0dC50106、
  binding 0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9、chainTag 2
- 部署用 ../deploy_opener.html（本机 server.py 提供，持有人钱包签名）；字节码取 forge 产物 build/Web2TapeOpener.forge.bin，页面显示的 SHA-256 是十六进制文本的 6bcdecc3…663f。
- **X Layer 已部署：0xF1a62B003bee4AFe15E2A6300eBf86ad9301fF33**（2026-10-01，用户签名）。核对：链上代码与本地字节码+构造参数模拟部署的结果逐字节相同；factory/opener/binding/chainTag 正确；price(245,1)=0.10806 OKB。
- 页面端到端（分叉链上）：新地址 → 预览 → 「连接钱包，存上链」→ 普通钱包确认 2 次 / 支持批量的钱包 1 次 → 文件上链、核对一致、余额退回
