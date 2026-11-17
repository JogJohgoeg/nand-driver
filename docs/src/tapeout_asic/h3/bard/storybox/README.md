# 吟游诗人故事机（Bard story box）

ESP32-S3 按吟游诗人芯片同一套整数规则（INT-C16，`h3/int_model.c`）讲故事：按 GO 键，故事逐词显示在 0.96 寸 OLED 上，同时从 USB 串口输出。2026-10-19，Claude。

**为什么不是芯片本身：** 吟游诗人芯片没有流片。板上跑的是芯片的整数标准实现，输出和芯片应当逐位一致：标准实现与芯片的 RTL 回放、浏览器演示都做过逐位核对。

## 已验证

- `data/model.bin`（283,804 字节）由 `gen_sources.py` 从演示页 <https://jogjohgoeg.github.io/nand-llama-research/> 提取，SHA-256 = `5a8415…78a1`，与 `int_run.py` 中写死的值一致。
- 固件版模型 `src/bard_model.c` 由脚本从 `int_model.c` 生成，只把 972,800 字节的权重数组改为动态分配（ESP32 上放 PSRAM），算术不变。
- 本机用固件源码（`bard_core.c` 加 `bard_model.c`）跑 `test/host_test.c`：C16、C32 × 3 个提示词 × 贪心 / 采样，共 12 组，token 序列与 `evidence/integer/c{16,32}_prompt*_*.json` **12/12 全同**。分词器（SentencePiece unigram）也一并验证。
- **模拟器上跑通（2026-10-19，build-host）：** 用乐鑫 [esp-emulator](https://github.com/espressif/esp-emulator) 0.49.0（Beta，能模拟 ESP32-S3 八线 PSRAM）跑 `env:emu`，它和真板的 `env:storybox` 只差串口：走 UART0，因为模拟器的输入输出只接 UART0。
  - 模型载入正常，`int_init=0`，剩余 PSRAM 7.4 MB。
  - 用 `--inject` 从串口发 `p Once upon a time`：提示词分词为 `1,102,110,23,88`；生成 69 个 token 后遇 EOS 停止，故事正文与 `c16_prompt0_1.json` 解码结果逐字相同。
  - 模拟器里约 3.0 s/token。模拟器不按周期精确，真板速度要实测。
  - 另试了乐鑫 QEMU 分支（esp-develop-9.2.2-20260417）：它只模拟四线 PSRAM，八线配置会 PSRAM 初始化失败（`int_init=-9`），所以另设了 `env:qemu`（四线 PSRAM，开机自动讲一段）。
- 还没在实物上跑：没有板子。上板后用串口打印的 `ids=` 和上述 JSON 对比，第一轮按 GO 用的就是和标准结果相同的种子。

## 硬件（EasyEDA 云端工程 BardStoryBox）

ESP32-S3-WROOM-1-N16R8（C2913202）；USB-C（C165948）+ 两个 5.1 kΩ CC 下拉 + USBLC6-2SC6 静电保护；AMS1117-3.3；RST / BOOT / GO 三个按键（TS-1187A，A-B、C-D 两组内部相连，已对照数据手册）；OLED 4 针插座（GND VCC SCL SDA，GPIO9 = SCL，GPIO8 = SDA，各加 10 kΩ 上拉）；电源灯、状态灯（GPIO2）。板子 41 × 51 mm，双层，模组天线伸出板外；原理图和 PCB 的 DRC 都是 0。

## 用法

```
python3 gen_sources.py          # 取模型、生成 src/bard_model.c 和 src/bard_tokenizer.h
pio run -t upload               # 按住 BOOT 插 USB 进下载模式
pio device monitor              # 串口命令：p <英文开头> / c16 / c32 / greedy / sample
# 模拟器：pio run -e emu，合并成 16 MB 镜像后
# esp-emu --chip esp32s3 --firmware flash16.bin --inject $'p Once upon a time\n' --inject-on 'psram free='
cc -O2 -std=c99 -o host_test test/host_test.c src/bard_core.c src/bard_model.c && ./host_test data/model.bin
```
