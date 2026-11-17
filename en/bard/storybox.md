# Story box

> An ESP32-S3 writes sentences with the same integer rules as the Bard chip. Press the GO button and the text appears word by word on a small screen, and also comes out of the USB serial port.

> The chip has not been taped out, so the story box does not run the chip itself. It runs the chip's standard integer implementation (INT-C16). The standard implementation has been checked bit for bit against the chip's RTL replay and the browser demo. The story box has not run on a real board yet.

## What has been checked

| Item | Result | Where it ran |
|---|---|---|
| Firmware code against the standard results: C16, C32 × 3 prompts × greedy / sampling | 12 token sequences, 12/12 the same; the tokenizer (SentencePiece unigram) is checked along with them | Firmware source compiled on a computer, running `host_test` |
| Firmware in an ESP32-S3 emulator | The model loads normally with 7.4 MB of PSRAM left; the prompt `Once upon a time` generates 69 tokens and stops, and the text is identical to the standard result, character for character | Espressif esp-emulator 0.49.0 (Beta) |
| Real board | Not run: there is no board | — |

- In the emulator it takes about 3.0 seconds per token. The emulator is not cycle-accurate, so real-board speed has to be measured.
- Espressif's QEMU fork only emulates quad PSRAM, and the octal configuration fails to initialize. So there is a separate quad configuration, `env:qemu`.

## Model

- `data/model.bin`, 283,804 bytes, extracted from the [browser demo page](https://jogjohgoeg.github.io/nand-llama-research/).
- A script generates the firmware's model from the standard integer implementation. The only change is that the 972,800-byte weight array is allocated dynamically (placed in PSRAM). The arithmetic is unchanged.

## Hardware

| Item | Details |
|---|---|
| Module | ESP32-S3-WROOM-1-N16R8 (16 MB flash, 8 MB octal PSRAM) |
| Screen | 0.96-inch OLED, 4-pin header; GPIO9 = SCL, GPIO8 = SDA |
| Buttons | RST, BOOT, GO |
| LEDs | Power LED, status LED on GPIO2 |
| Power | USB-C |
| Board | 41 × 51 mm, two layers; schematic and PCB DRC are both 0; not made yet |

## Build and run

You need Python 3 and PlatformIO. Run all the commands below in the story box source directory.

```sh Get the model, then generate the firmware's model and the tokenizer table
python3 gen_sources.py
```

```sh Compile and flash (hold BOOT while plugging in USB to enter download mode)
pio run -t upload
```

```sh Open the serial port
pio device monitor
```

Serial commands: `p <English opening>`, `c16`, `c32`, `greedy`, `sample`.

## Check on a computer

```sh Run the 12 comparisons on a computer with the firmware source
cc -O2 -std=c99 -o host_test test/host_test.c src/bard_core.c src/bard_model.c && ./host_test data/model.bin
```

## Run in the emulator

```sh Compile the emulator firmware (serial goes over UART0, everything else is the same as the real board)
pio run -e emu
```

After merging the output into a 16 MB image `flash16.bin`:

```sh Run it with esp-emulator and send a prompt after boot
esp-emu --chip esp32s3 --firmware flash16.bin --inject $'p Once upon a time\n' --inject-on 'psram free='
```

esp-emulator is at [github.com/espressif/esp-emulator](https://github.com/espressif/esp-emulator).

## How to check once it is on a board

The serial port prints `ids=`. Compare it with the standard result. The first press of GO uses the same seed as the standard result.

## Next

- [The Bard chip](index.md): sign-off results for the chip itself.
- [Watch it write in your browser](https://jogjohgoeg.github.io/nand-llama-research/): the same integer rules running in the browser.
