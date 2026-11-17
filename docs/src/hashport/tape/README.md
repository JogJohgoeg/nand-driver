# tape · TapeOut 上的 Vercel

用户 2026-09-30：「直接在 tapeout 上做」Vercel。TapeOut 容器就是边缘网络：文件在每个全节点上都有一份、按内容寻址不可变、没有源站，网关在浏览器里读链并核对哈希。
tape 只做 Vercel 在 CDN 之上的那部分。分期：① 部署核心（本期） ② 构建（框架识别、相对路径） ③ 控制台网页 ④ GitHub 自动部署 ⑤ 函数（TapeAPI）。

## 部署核心

```
node tape/tape.mjs auth <名字>                       # 持有人授权上传钥匙（同 flip）
node tape/tape.mjs deploy <目录> <名字> [--prod]      # 部署；--prod 同时提升为生产；--dry 只看计划
node tape/tape.mjs ls <名字>                          # 所有部署，★ = 生产
node tape/tape.mjs promote <名字> <部署号>             # 提升
node tape/tape.mjs rollback <名字> [部署号]            # 回滚到上一次生产（或指定部署）
node tape/tape.mjs inspect <名字> <部署号>             # 文件与哈希
node tape/tape.mjs done <名字>                        # 退款并撤销
```

链上布局（`tape.js` 文件头有细节）：
- `_d/<n>/…`：第 n 次部署的完整副本，永不改写 → 专属预览网址 `https://<网关>/_d/<n>/`。
- `.tape/d/<n>.json` 部署记录（文件哈希、上传交易、分支 / 提交 / 说明），用 prev 哈希串成链；`.tape/head.json` 指最新。
- 根目录 = 生产；`.tape/p/<m>.json` 每次提升一条（哪次部署、哪些文件），也串成链；`.tape/prod.json` 指当前生产。
- 提升只写有变化的文件、删掉上一版生产有而这一版没有的文件；**不属于生产的根目录文件一律不动**，要盖掉必须 `--force`。
- 读到的最新记录可能来自没跟上的节点：要写的记录已存在就停；写完等每个节点都看到新 head。

代价：每次部署是一份完整副本（SiteRegistry 不能两个路径共用内容），按全站大小付 gas；预览在子路径下，站点要用相对路径（第 ② 期构建时自动处理已知框架）。

有写入权限的人换掉一条旧部署记录：`ls` 列到那里为止并标出来，更新的部署照样能提升，坏记录之前的部署翻不过去、不能提升（不会因为一条旧记录就什么都用不了）。

## 构建（第 ② 期）

`tape deploy <项目目录> <名字>`：目录里有 `package.json` 就先构建（`--no-build` 跳过），`tape build <目录>` 只构建。
- Vite：`vite build --base=./`（自动相对路径）；Create React App：`PUBLIC_URL=.`；Next.js：静态导出 `out/`（要 `output: "export"`、`assetPrefix: "./"`）；Astro：能构建，但默认绝对路径；其它有 `build` 脚本的：`npm run build`，从 dist / build / out / public 里找。
- 没装依赖就 `npm ci`（有 lock 文件）或 `npm install`。
- 构建完扫 HTML 里 `/` 开头的绝对路径并提醒：预览网址 `/_d/<n>/` 下会失效，生产根目录正常。
- 部署记录里多记一项 framework。

测试（分叉链）：
- `node tape/test/fork_tape.mjs` 12 项：预览、--prod、改动与删除、回滚（删掉的回来）、提升指定部署、★、旧预览不变、拒绝盖书外文件、部署记录被换（列到那里、更新的仍可提升、更早的不能）、写回后恢复。
- `node tape/test/fork_build.mjs` 5 项：Vite 项目自动构建 → 部署并提升 → 本机小网关（直接读分叉链容器）里，预览网址和生产在浏览器里都跑起来。

## 控制台（第 ③ 期）

`node tape/tape.mjs ui <名字>` 把控制台装进容器的 `_tape/`（只重传有变化的文件；它不属于任何部署，提升 / 回滚不会动它），打开 `https://<网关>/_tape/`。
- 名字从网关主机名推出（`1-2-245.aihashrate.stream` → `1.2.245`），也可以 `?name=`。
- 生产卡片（网址、第几次部署、说明、何时提升）；部署列表（#号、说明、生产 / 预览、★ 当前、分支@提交、文件数、大小、多久前、框架），点开看文件和哈希；「打开预览」→ `/_d/<n>/`。
- 只读：提升 / 回滚要上传钥匙签名，按钮复制现成命令（网页里不放钥匙）。有记录被换过就显示警告、那条及更早的不列。
- 深色 / 浅色跟随系统，手机上单列。
- 测试 `node tape/test/fork_ui.mjs`（分叉链 + 本机小网关 + 浏览器）8 项。

## GitHub 自动部署（第 ④ 期）

`node tape/tape.mjs init <名字> [仓库目录] [--dir <要部署的子目录>]`：
- 写 `.github/workflows/tape.yml`：推 main → 生产，其它分支 → 预览；`concurrency` 保证同一时间只跑一个部署（链上记录要一条接一条）；网址写进运行摘要。
- 把单文件版 tape（`build_bundle.sh` 用 esbuild 打包，约 175 KB，只要 Node）放进仓库的 `.tape/tape.mjs`（点开头的目录不会被部署）。
- 生成 CI 专用上传钥匙 `~/.tape_ci_<名字>.json`，印出三步：授权它（持有人签名）、`gh secret set TAPE_KEY < 钥匙文件`、提交推送。
- 合约同一时间只认一把上传钥匙：CI 钥匙授权后就是这个容器的钥匙，本机部署用 `FLIP_KEY=~/.tape_ci_<名字>.json`；授权最多 30 天，到期时工作流失败并给出重新授权的命令。
  授权页 `flipbook/auth.html` 发现别的钥匙还占着时，会列出来并给「先撤销它」。
- 提交说明等经环境变量传进脚本，不拼进命令行（带引号和 `$( )` 的说明原样记下）；GitHub 用 `bash -eo pipefail` 跑，失败时也先写完摘要和提示。
- 测试 `node tape/test/fork_ci.mjs`（分叉链；按 GitHub 的 shell 和环境变量跑生成的工作流步骤，用的是打包版）6 项：init、推 main → 生产、提交信息原样、推分支 → 只预览、没密钥、钥匙失效。
  没在真的 GitHub 上跑过：我们仓库没有远端。
