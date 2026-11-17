# FPGA 移植

> 吟游诗人整机 v8g 用开源工具链在 XC7A100T 上布线通过，时序 21.19 MHz。还没上实物板。

## 结果

| 器件 | 综合 | 布局布线 | 时序 |
|---|---|---|---|
| XC7A100T-1FTG256C | LUT 约 45.0k / 63.4k，FF 21.4k（17%），RAMB18 107 个 + RAMB36 10 个 | 布通，约 12 分钟，内存不到 1 GB | 21.19 MHz，要求大于 16.7 MHz，通过 |
| LFE5U-85F（ECP5） | LUT4 69.4k / 83.6k（83%） | 布线不收敛，10-30 停掉 | — |
| XC7A75T | 按 100T 的结果推算 LUT 约 96% | 没试 | — |

- 输入是整机 v8g 的 FPGA 版 RTL（Tang Mega 138K 版），只换目标器件。
- 时序要求：50 MHz 主钟、SLOW=3；单周期要高于 16.7 MHz，三拍路径要短于 60 ns。
- XC7A100T 一路生成了位流（3,825,899 字节）。

## 工具链

全是开源工具：

- Yosys 0.69（oss-cad-suite），`synth_xilinx`。
- openXC7：Apio 1.6.0 的 openxc7 包，里面有 nextpnr-xilinx；XC7A100T-FTG256 的 chipdb 另外下载，核对过 SHA-256。
- fasm2frames、xc7frames2bit：把布线结果转成位流。

## 构建

```sh 综合成 Xilinx 7 系列网表
yosys -p "read_verilog top_tang138k_ce.v uart_shell_ce.v machine_ce.v body_ram2_ce.v; synth_xilinx -family xc7 -top top -json syn_xc7.json; stat"
```

```sh 在 XC7A100T-FTG256 上布局布线，单周期目标 17 MHz
nextpnr-xilinx --chipdb xc7a100tftg256.bin --xdc xc7a100t.xdc --json syn_xc7.json --fasm pnr_xc7.fasm --freq 17 --timing-allow-fail --report pnr_xc7_report.json
```

然后用 fasm2frames、xc7frames2bit 把 `pnr_xc7.fasm` 转成位流。

管脚约束 `xc7a100t.xdc`（只是验证用）：

```text
set_property PACKAGE_PIN D13 [get_ports clk]
set_property IOSTANDARD LVCMOS33 [get_ports clk]
set_property PACKAGE_PIN A3 [get_ports rx]
set_property IOSTANDARD LVCMOS33 [get_ports rx]
set_property PACKAGE_PIN A2 [get_ports tx]
set_property IOSTANDARD LVCMOS33 [get_ports tx]
```

## 时序复核

在布线后的 SDF 上自己走一遍路径，终点包括 CE、SR 脚（nextpnr 自带报告不查这些）。

| 检查 | 最长（SDF 原值） | 最长（加 Artix-7 单元延时） | 要求 | 结果 |
|---|---|---|---|---|
| 单周期：每拍翻转的 5 个触发器 → 21,988 个终点 | 9.489 ns | 9.701 ns | < 20 ns | 通过 |
| 三拍：全部时序单元 | 47.187 ns | 47.390 ns | < 60 ns | 通过 |

- 三拍最长 47.187 ns 正好是 1 / 21.19 MHz，和 nextpnr 的报告一致。
- 「加单元延时」一列用的是 prjxray-db 的 Artix-7 数据：nextpnr-xilinx 的 SDF 里块 RAM、LUT-RAM、SRL 没有时钟到输出和建立时间。时钟偏斜没算。
- 这不是签核。签核要用 Vivado。

## 门级对拍

用 Verilator 跑整板网表，经串口喂 L1、L2、L3 三个用例。

| 网表 | L1（要 32） | L2（要 5） | L3（要 128） |
|---|---|---|---|
| 综合后 | 通过 | 通过 | 没出结果 |
| 布线后 | 通过 | 通过 | 没出结果 |
| 负控一：一块 RAM 的读地址接 0 | 失败 | 失败 | 停掉 |
| 负控二：35 个移位寄存器地址改回综合时的值 | 失败 | 失败 | 停掉 |

- 两份真网表 L1、L2 的输出逐个相同，时钟数和参考回放一致：L1 2,499,420 拍，L2 5,612,207 拍。
- 两份负控都判失败，说明这套对拍能查出 RAM 地址错一位和移位寄存器长度错。

## 还没验证的

1. 门级对拍 L3。
2. 位流本身：对拍查的是布线后网表，不是从位流反解的网表。
3. ECP5：布线不收敛，没做对拍和时序复核。
4. 实物：没有板子。配套的 XC7A100T 小板画完了原理图和 PCB，没打板。

## 下一步

- [工艺阶梯](nodes.md)：同一份网表在七个芯片工艺上的结果。
- [故事机](storybox.md)：在 ESP32-S3 上跑同一套整数规则。
