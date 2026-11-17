# Mac（Apple Silicon）跑开源后端 EDA 调研 — 2026-10-11

结论先行：
1. **能不能跑**：能。LibreLane 3.0.x 官方 CI 每次都构建并单测 `aarch64-darwin` 与 `aarch64-linux`，并推送二进制缓存；但 **macOS 与 Linux 的综合结果不一致**（Yosys/ABC 跨 OS 非确定，KLayout DRC 在 Mac 上曾误报 1170 条），所以签核/回放要和现有 Linux 结果逐位可比，就应在 Mac 上跑 **aarch64-Linux 虚拟机**，不用原生 macOS。
2. **快不快**：M5 代单线程比 EPYC 4565P / 9950X 快约 20–30%（GB6/GB7 口径）；多线程方面，M5 Ultra 36 核约等于 Threadripper 9970X 一档。
3. **值不值**：内存是瓶颈。128GB 的 M5 Max Studio 约 $5.1k，与 EPYC 4585PX 128GB ECC 方案（$5.2k）同价，单线程快约 25%，但没有 ECC、内存不可扩、跑 Linux 需要虚拟机。256GB 的 M5 Ultra 要 $10.8k。

图例：**[live]** = 本次实际打开或抓取的页面（2026-10-11）；**[snippet]** = 只见到搜索摘要或二手转述；**估算** = 推算值；**未查到** = 没有找到。

---

## 1. 现售 Mac 产品线（2026-10-11）

Mac Pro 已于 2026-03-26 停产，没有后继机型 [snippet: https://macrumors.com/2026/03/26/apple-discontinues-mac-pro/ ]。抓取 apple.com/shop/buy-mac/mac-pro 只拿到 Mac 首页内容 [live]。

| 机型 | 芯片 | CPU（super / performance） | 最大统一内存 | US 起价（live） | CN 起价（live） |
|---|---|---|---|---|---|
| Mac mini | M6 12C/12G | 12 核 | 32GB | $899 | ¥6,999 |
| Mac mini | M5 Pro 15C/16G | 15 核 | 64GB | $1,699 | ¥12,999 |
| Mac mini | M5 Pro 18C/20G | 18 核（6S+12P） | 64GB | $1,899 | ¥14,499 |
| Mac Studio | M5 Max 18C/32G（36GB） | 18 核（6S+12P） | 36GB（此档不可加） | $2,499 | ¥19,999 |
| Mac Studio | M5 Max 18C/40G（48GB/512GB） | 18 核（6S+12P） | 128GB | $3,099 | ¥24,499 |
| Mac Studio | M5 Ultra 30C/64G（96GB/1TB） | 30 核（10S+20P） | 96GB（256GB 是否可选：未确认） | $5,499 | ¥46,999 |
| Mac Studio | M5 Ultra 36C/80G（96GB/1TB） | 36 核（12S+24P） | 256GB；512GB 于 10 月下旬上市 | $6,799 | ¥56,749 |
| MacBook Pro 14/16 | M5 Max 18C/32G、18C/40G | 18 核（6S+12P） | 128GB | 14″ $4,099 / $4,699；16″ $4,399 / $4,999 | 14″ ¥33,999 / ¥38,499；16″ ¥35,999 / ¥40,999 |
| MacBook Pro 14/16 | M5 Pro | 15 或 18 核 | 64GB | 14″ $2,499 起 | ¥19,999 起 |

来源：
- 价格：从 https://www.apple.com/shop/buy-mac/{mac-studio,mac-mini,macbook-pro} 和 https://www.apple.com.cn/shop/buy-mac/{同上} 页面内嵌的 `prices` / `seoPrice` JSON 抓取 [live, 2026-10-11]。
- 核心构成与最大内存：https://www.apple.com/mac/compare/ [live]，以及 Apple 新闻稿 https://www.apple.com/newsroom/2026/08/apple-introduces-new-mac-studio-with-m5-max-and-m5-ultra/ [live, 2026-08-25]。Apple 的新叫法是 6 个 "super" 核加 12 个 "performance" 核，后者实际是中档核。
- Studio 购买页脚注原文："512GB memory option for M5 Ultra coming late October" [live]。

### 内存加价与目标配置价格

apple.com 购买页只显示整机起价，内存加价由交互配置器动态加载，本次未能实抓（未查到 live 数值）。下面的加价取自 Daring Fireball 2026-08-25 文章：https://daringfireball.net/2026/08/configurations_and_pricing_for_new_mac_minis_and_mac_studios [二手转述，文章本身已打开]。

- Studio M5 Max 18C/40G：48GB 不加价，64GB +$400，**128GB +$2,000**。
- Studio M5 Ultra：96GB 不加价，**256GB +$4,000**，96GB 与 256GB 之间没有中间档。
- Mac mini M5 Pro：48GB +$600，64GB +$1,000。

| 目标配置 | US | CN | 说明 |
|---|---|---|---|
| Mac mini M5 Pro 18C，64GB/512GB | $2,899 | ≈¥22,000 估算 | 64GB 只够 2 个 30GB 作业 |
| **Studio M5 Max 40G，128GB/512GB** | **$5,099** | **≈¥39,500 估算** | CN 价按 Apple 惯例 $1 加价 ≈ ¥7.5 推算 |
| Studio M5 Ultra 36C，256GB/1TB | $10,799 | ≈¥86,750 估算 | 与 aicybr 摘要 "≈$10,79x" 相符 [snippet]；4TB 版 $12,299 与 guru3d 一致 [snippet]；16TB 顶配 $18,299 见 Macworld 2026-08-25 [live] |
| Studio M5 Ultra 512GB | 未查到 | 未查到 | 10 月下旬上市，价格未公布 |
| MBP M5 Max 128GB | 未查到 live | 未查到 | AppleInsider 摘要称 14″ 128GB/2TB 为 $5,099 [snippet]，但与现行 live 起价 $4,699（48GB）对不上，可能已涨价，不采用 |

国行内存加价：未查到官方数，以上全部是估算。

---

## 2. 基准成绩

### Geekbench
注意版本：Geekbench 官方 Mac 榜 https://browser.geekbench.com/mac-benchmarks 现在是 **Geekbench 7** 口径 [live]（页面写明 "calculated from Geekbench 7 results"，基准 2,500 分 = Ryzen 7 7700）。下表 GB6 一列取自 `browser.geekbench.com/search?k=v6_cpu&q=…` 前两页结果的中位数 [live, 2026-10-11, 用户上传，有噪声]。

| 芯片 | GB6 ST（中位） | GB6 MT（中位） | GB7 ST | GB7 MT | 样本说明 |
|---|---|---|---|---|---|
| M5 Ultra 36C | 4,323 | 38,384 | 3,753 | 52,125 | GB6 n=32；GB7 n=20（search）；Mac 榜尚未收录 |
| M5 Ultra 30C | 4,266 | 35,285 | 3,733 | 46,962 | GB6 n=11 |
| M5 Max 18C | 4,265 | 29,401 | 3,727（榜，16″） | 35,064（榜，16″） | 榜单 live |
| M5 Pro 18C | 4,150 | 27,902 | 3,693（榜） | 33,597（榜） | |
| M6 12C（Mac mini） | 4,627 | 21,049 | ≈4,045 | ≈22,283 | 最高 32GB，不适合本任务 |
| M4 Max 16C | 3,981 | 26,614 | 3,496（Studio 榜） | 29,089 | |
| M3 Ultra 32C | 3,243 | 29,640 | 2,919（榜） | 39,196（榜） | |
| Ryzen 9 9950X | 2,852* | 8,305* | 3,061（处理器榜） | 26,060（处理器榜） | *GB6 搜索混入大量 VM 结果，作废 |
| EPYC 4565P | 3,444（仅取 MT>15k 的 14 条） | 16,041 | 3,162（n=3） | 24,940 | 样本少 |
| Ryzen 9 9955HX | 3,245 | 18,732 | 2,812 | 21,098 | 已有基线为 GB6 ST 3,080 |
| Threadripper 9970X | 3,127 | 26,456 | 2,762（n=15） | 30,830 | |

GB7 的 x86 数据取自 https://browser.geekbench.com/processor-benchmarks [live]（9950X：3,061 / 26,060）。
**粗略结论**：同为 GB7 时，M5 Max/Ultra 单线程约为 9950X 的 1.22 倍，约为 EPYC 4565P 的 1.18 倍。GB6 多线程因扩展性差会压低高核数机器，所以多线程以 GB7 为准：M5 Ultra 36C 约为 9950X 的 2.0 倍，约为 TR 9970X 的 1.7 倍。

### PassMark
数据来自 https://www.cpubenchmark.net/singleThread.html 、high_end_cpus.html 、mid_range_cpus.html，于 2026-10-11 07:49 抓取 [live]。M5 Ultra 36C 单页另见 https://www.cpubenchmark.net/cpu.php?id=7508 [live]，页面标注 1 个样本，"Margin for error: High"。

| CPU | PassMark ST | PassMark MT |
|---|---|---|
| M5 Ultra 36C | 6,341（1 样本） | 87,327 |
| M5 Ultra 30C | 6,292 | 74,908 |
| M6 12C | 6,412 | 35,825 |
| M5 Max 18C | 5,965 | 57,804 |
| M5 Pro 18C | 5,933 | 57,203 |
| M4 Max 16C | 4,587 | 43,862 |
| M3 Ultra 32C | 5,064 | 72,850 |
| Ryzen 9 9950X | 4,728 | 65,707 |
| EPYC 4565P | 4,712 | 63,511 |
| EPYC 4585PX | 4,538 | 68,908 |
| TR 9970X / 9980X | 4,546 / 4,541 | 107,794 / 143,198 |

注意：PassMark 的 Apple 单线程分数系统性偏高（例如 M3 Ultra 5,064 高于 M4 Max 4,587，与 GB 排序相反），跨平台对比**不可信**，建议以 Geekbench 为准。这一判断属于估算。

### 编译 / EDA 类实测
- M5 Max/Ultra 对 9950X 或 Threadripper 的 LLVM、内核编译时间：**未查到**。Phoronix 只在 Linux 上测试，没有测 macOS 上的 M5。
- 评测中只有 HandBrake 转码一项（M5 Ultra 64 s，Threadripper 9980X 72 s）[snippet: Tom's Guide https://www.tomsguide.com/computing/apple-desktops/apple-mac-studio-m5-ultra-review]。另有 Apple 官方说法："M5 Ultra up to 1.3x multithreaded vs M3 Ultra" [live 新闻稿]。
- OpenROAD/OpenLane 在 M 系列 Mac 上与 x86 的运行时间对比：**未查到**任何公开数据。

---

## 3. 兼容性（最重要）

### LibreLane 3.0.x + Nix，原生 macOS（aarch64-darwin）
- 官方文档提供独立的 "macOS 15+" 安装页，推荐 "Apple M1 or later"，并说明 "The first version of LibreLane in 2027 will drop support for Intel-based Macs"。二进制缓存是 `nix-cache.fossi-foundation.org`。来源：https://librelane.readthedocs.io/en/latest/installation/nix_installation/installation_macos.html [live]。
- CI（`.github/workflows/ci.yml`，librelane/librelane main 分支）有 `build-darwin` 矩阵，其中包含 `aarch64-darwin`（macos-15 runner），做 Nix 构建并跑 step 单测，然后推送到 S3 缓存。另有 `build-linux-aarch64`（ubuntu-24.04-arm）。2026-10-08 的成功运行（run 37749124131）中 `Build (Nix/aarch64-darwin)` 和 `Build (Nix/aarch64-linux)` 都是 success [live, gh api]。**不过整套设计回归（spm、caravel_upw、aes 等）只在 x86_64-linux 上跑**，darwin 只做构建和单测。最新版本为 3.0.16（2026-10-06）。
- nix-eda 6.11.0 的 `forAllSystems` 包含 x86_64-linux、aarch64-linux、x86_64-darwin、aarch64-darwin。openroad.nix 写明 `platforms = linux ++ darwin`；magic 用 `tk-x11` + X11（批处理不需要 XQuartz，GUI 需要）；netgen 为 `platforms.unix`；klayout 有 darwin 分支 [live, gh api]。
- **已知问题**：
  - **Yosys 跨 OS 非确定**：https://github.com/YosysHQ/yosys/issues/5205 （OPEN）指出，同一 OS 内（含 Linux x86-64 与 aarch64）结果确定，但 macOS 与 Linux 之间 RTLIL 不同。疑似来源是 ABC。另见 librelane#522（OPEN）。
  - librelane#825（2025-11）：同一设计在 Mac 上报 KLayout DRC 1170 条、在 Linux 上干净；把 Mac 生成的 GDS 拿到 Linux 上检查也干净。对应的 KLayout#2231 已于 2025-12-01 关闭，原因是 LibreLane 2.4.2 自带的 KLayout 0.29.4 版本较旧。
  - librelane#818：magic 打开的文件描述符过多，在 macOS 和 Ubuntu 上都出现过，解决办法是 `locking disable`。
  - librelane#674：GHDL 在 aarch64 上不可用（与我们无关）。
- **OpenROAD 官方**：docs/index.md 的支持表中，macOS 为 "Local Installation: Y / Prebuilt Binaries: - / Docker: Y"；`etc/DependencyInstaller.sh` 有 darwin + Homebrew + arm64 分支 [live, gh api]。Homebrew 官方 formula：未查到。
- Verilator、Yosys、KLayout 在 macOS arm64 上均为 nixpkgs 或 Homebrew 常规包，这里按常识判断，未逐一核实。

### aarch64-Linux 虚拟机（UTM / OrbStack / Lima，均基于 Virtualization.framework 或 HVF）
- LibreLane 官方产出 aarch64-linux 的 Nix 缓存、AppImage 和 Docker 镜像，CI 的 `Smoke Test on aarch64-linux` 为 success [live]。
- 由于 Yosys 在 Linux x86-64 与 aarch64 之间结果一致（yosys#5205 原文），**Linux 虚拟机能保持与现有 x86 Linux 远端结果可比**。这是推荐路线。
- 开销：M1 Max 上 GB6 实测，原生 2437 / 12803，UTM Fedora 2324 / 11829，Parallels 2333 / 12020，约为原生的 95%（单线程）和 92–94%（多线程）。来源：https://lemmy.linuxuserspace.show/post/29541 [snippet，约两年前，单次运行]。M5 上的数据未查到。估算开销 5–8%。
- 虚拟机内存需静态分配，macOS 宿主要预留约 8–16GB（估算）。128GB 机器上虚拟机实际可用约 110GB，按每作业 30GB 只够 3 个并行。

### Asahi Linux（裸机 Linux）
- M3/M3 Pro/M3 Max 于 2026-09 进入官方安装通道（暂无 GPU 驱动，M3 Ultra 不在内）；M4/M5 只到存储可用的早期阶段，**不能用安装器安装**。来源：Phoronix / linuxiac / pcgameshardware 等 [snippet]。文档总览页 https://asahilinux.org/docs/platform/feature-support/overview/ [live] 只列出各代页面，没有给状态。**结论：M5 机型不能裸机跑 Linux。**

---

## 4. 公开的 M 系列 Mac 跑 OpenROAD/OpenLane 经验
- 有人在 Mac 上正式跑 LibreLane 流片，例如 librelane#825 中的 caravel_leros_2025（DTU 课程），以及 #818 中 wafer.space 首批用户（含 macOS 用户）。用户普遍是能跑，但会遇到跨 OS 差异。
- 运行时间对比：**未查到**。

---

## 5. 与 EPYC 4565P / 4585PX 方案对比与建议

| | EPYC 4585PX，128GB ECC（已调研 ≈$5.2k） | Mac Studio M5 Max，128GB（$5,099） | Mac Studio M5 Ultra 36C，256GB（$10,799） |
|---|---|---|---|
| 单线程 | 基线（GB7 约 3.1k；PassMark 4,538–4,712） | 约 1.2 倍（GB7 3,727） | 约 1.2 倍（GB7 3,753） |
| 多线程 | 16C/32T（GB7 约 25k） | 18 核（GB7 约 35k） | 36 核（GB7 约 52k） |
| 30GB 作业并行数 | 约 4（可扩到 192GB+） | 约 3（Linux 虚拟机内；不可扩） | 约 7 |
| ECC | 有 | 无（官方未说明） | 无 |
| 与远端 Linux 结果可比 | 原生 | 需 aarch64-Linux 虚拟机（约 5–8% 开销，估算） | 同左 |
| 运维 | 普通 Linux 服务器 | macOS 宿主加虚拟机，没有 IPMI | 同左 |

**建议**：
- 如果主要看单线程墙钟时间，且同时只跑 3 个以内作业：M5 Max 128GB Studio 与 EPYC 同价，单线程快约 20%（扣除虚拟机开销后约 12–15%，估算），功耗和噪声也更好。但内存封顶 128GB，没有 ECC，签核要放在 Linux 虚拟机里。
- 如果要 4 个以上 30GB 作业并行，或者希望后续扩内存、要 ECC 或 7×24 稳定运行，选 **EPYC 方案**更稳。256GB 的 M5 Ultra 价格约为 EPYC 的 2 倍，按每 GB 计贵很多，只有在同时需要大量并行和最快单线程时才值得。
- 无论选哪个，**不要用原生 macOS 跑签核**（Yosys/ABC 跨 OS 不一致，KLayout 有旧版 DRC 问题）。原生 macOS 只适合快速迭代和看图。
- 待验证：买机前先在现有 Mac 上用 OrbStack 起 aarch64 Linux，跑一遍我们的回放，确认结果与 x86 Linux 远端逐位一致（需要一台 ≥32GB 的 Mac；本机为 MacBook Neo A18 Pro 8GB，不够）。
