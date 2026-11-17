# 故事机

> ESP32-S3 照吟游诗人芯片同一套整数规则写句子。按 GO 键，句子逐词显示在小屏上，同时从 USB 串口输出。

> 芯片还没流片，所以故事机跑的不是芯片本身，是芯片的整数标准实现（INT-C16）。标准实现和芯片的 RTL 回放、浏览器演示都逐位核对过。故事机还没在实物板上跑过。

## 核对到哪了

| 项 | 结果 | 在哪跑的 |
|---|---|---|
| 固件代码对标准结果：C16、C32 × 3 个提示词 × 贪心 / 采样 | 12 组 token 序列 12/12 相同；分词器（SentencePiece unigram）一并核对 | 电脑上编译固件源码跑 `host_test` |
| 固件在 ESP32-S3 模拟器里 | 模型载入正常，剩余 PSRAM 7.4 MB；提示词 `Once upon a time` 生成 69 个 token 后停，正文和标准结果逐字相同 | 乐鑫 esp-emulator 0.49.0（Beta） |
| 实物板 | 没跑：没有板子 | — |

- 模拟器里约 3.0 秒一个 token。模拟器不按周期精确，真板速度要实测。
- 乐鑫的 QEMU 分支只模拟四线 PSRAM，八线配置会初始化失败，所以另设了一个四线配置 `env:qemu`。

## 模型

- `data/model.bin`，283,804 字节，从[浏览器演示页](https://jogjohgoeg.github.io/nand-llama-research/)提取。
- 固件版模型由脚本从整数标准实现生成，只把 972,800 字节的权重数组改成动态分配（放进 PSRAM），算术不变。

## 硬件

| 项 | 内容 |
|---|---|
| 模组 | ESP32-S3-WROOM-1-N16R8（16 MB flash，8 MB 八线 PSRAM） |
| 屏 | 0.96 寸 OLED，4 针插座；GPIO9 = SCL，GPIO8 = SDA |
| 按键 | RST、BOOT、GO |
| 灯 | 电源灯，状态灯接 GPIO2 |
| 供电 | USB-C |
| 板子 | 41 × 51 mm，双层；原理图和 PCB 的 DRC 都是 0；没有实物 |

## 编译和运行

要装 Python 3 和 PlatformIO。下面的命令都在故事机的源码目录里跑。

```sh 取模型，生成固件版模型和分词表
python3 gen_sources.py
```

```sh 编译并烧录（按住 BOOT 插 USB，进下载模式）
pio run -t upload
```

```sh 打开串口
pio device monitor
```

串口命令：`p <英文开头>`、`c16`、`c32`、`greedy`、`sample`。

## 在电脑上核对

```sh 用固件源码在电脑上跑 12 组对照
cc -O2 -std=c99 -o host_test test/host_test.c src/bard_core.c src/bard_model.c && ./host_test data/model.bin
```

## 在模拟器里跑

```sh 编译模拟器版固件（串口走 UART0，其余和真板一样）
pio run -e emu
```

把输出合并成 16 MB 镜像 `flash16.bin` 后：

```sh 用 esp-emulator 跑，开机后发一句提示词
esp-emu --chip esp32s3 --firmware flash16.bin --inject $'p Once upon a time\n' --inject-on 'psram free='
```

esp-emulator 在 [github.com/espressif/esp-emulator](https://github.com/espressif/esp-emulator)。

## 上板以后怎么核

串口会打印 `ids=`。把它和标准结果比；第一次按 GO 用的种子和标准结果相同。

## 下一步

- [吟游诗人芯片](index.md)：芯片本身的签核结果。
- [在浏览器里看它写几句](https://jogjohgoeg.github.io/nand-llama-research/)：同一套整数规则在浏览器里跑。
