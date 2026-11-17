# First-chip submission checklist / 首片提交前清单

2026-10-05. **技术验证通过；付费提交待用户决定。** This is a reviewed submission specification, not a receipt for an order. The accepted evidence commit is **`b49b49e4f0abd0521220d4f39227774d748c9d79`**.

## Exact configuration / 提交参数

| Item | Reviewed value |
|---|---|
| Repository | [JogJohgoeg/tt-nand-hardwired](https://github.com/JogJohgoeg/tt-nand-hardwired) |
| Shuttle / PDK | **TTSKY26d / sky130A** |
| [info.yaml](../tt-nand-hardwired/info.yaml) schema | `yaml_version: 6` |
| Project title | Auditable NAND hard logic and ternary dot product |
| Author | JogJohgoeg / TapeOut contributors |
| Top module | `tt_um_jogjohgoeg_hardwired` |
| Language / sources | Verilog; `src/project.v`, `src/cell_279.v`, `src/dot32_t.v` |
| Tiles | **2x2 = 4 tiles**, die 334.88 × 225.76 µm |
| Clock | `clock_hz: 10000000`; `src/config.json CLOCK_PERIOD: 100` ns, `CLOCK_PORT: clk` |
| Layout density | `PL_TARGET_DENSITY_PCT: 60`; measured standard-cell utilization 54.8262% |
| Inputs | ui0 DIN, ui1 CS_n, ui2 SHIFT, ui3 CORE, ui4 RUN; ui7:5 ignored |
| Outputs | uo0 DOUT, uo1 RESPONSE, uo2 live CORE echo; uo7:3 zero |
| Bidirectional pins | All uio inputs; output enable zero |
| Reset / framing | Active-low synchronous reset; MSB-first 15/320 input bits, RUN edge, 2/32 output bits |
| Docs / licensing | [Datasheet](../tt-nand-hardwired/docs/info.md); new code MIT, protocol CC0-1.0, inherited template Apache-2.0 |
| Author contact | Discord field is blank and accepted by CI; user may keep it blank or supply an identifier |

The configuration and RTL above match the downloaded b49b49e submission exactly. An optional contact/title change is a new metadata revision, not evidence that a different checkout was already tested.

## Evidence accepted / 已核验清单

| Gate | Evidence |
|---|---|
| Functional and docs | [test 37359423132](https://github.com/JogJohgoeg/tt-nand-hardwired/actions/runs/37359423132), [docs 37359423101](https://github.com/JogJohgoeg/tt-nand-hardwired/actions/runs/37359423101): success |
| Formal | [37359551360](https://github.com/JogJohgoeg/tt-nand-hardwired/actions/runs/37359551360): all three jobs pass, including wrapper reset/definedness/transition and actual-output negative controls |
| Physical | [37359561071](https://github.com/JogJohgoeg/tt-nand-hardwired/actions/runs/37359561071): GDS, 15 prechecks, 128 gate transactions and viewer pass |
| GDS identity | SHA-256 `2a3dd3d5d08d914815cfe7541c256b74315c2f4e143c93d63ec99b104e634aff` |
| Artifact identity | [Machine receipt](evidence/ci_b49b49e.json), [proof manifest](evidence/formal_b49b49e/manifest.json), [physical manifest](evidence/physical_b49b49e/manifest.json) |
| Chain identity | #279 BSC CPU732: 49 eval/step vectors; DOT X Layer #3@2.245: 86 eval/step vectors and identical raw NAND bytes |
| Remaining measurement boundary | Generic synthesis formal proof + routed finite simulation; no returned-silicon measurements. Max-slew metric **226** is retained alongside passing setup/hold and prechecks |

Physical standard cells: 39,784.4 µm²; worst setup/hold +58.283776/+0.107796 ns; route/Magic DRC/LVS 0. The complete submission and GDS logs are saved locally under the parent workspace's ignored `h2/build/physical_b49b49e/`. GitHub artifacts can expire; keep this saved copy with the eventual order record.

## Cost and schedule / 费用与班次

The public pricing module was re-read on 2026-10-05: €70/tile, €300 standard kit or €100 limited subsidized kit, €15 shipping per kit. [Calculator](https://app.tinytapeout.com/calculator?shuttle=chipfoundry&tiles=4&pcbs=1), [pricing source](https://app.tinytapeout.com/_build/assets/invoice-WoZjomWD.js), [dated snapshot](evidence/pricing_b49b49e.json).

| User choice | Four tiles | Kit | Listed shipping | Budget total |
|---|---:|---:|---:|---:|
| Tiles only | €280 | — | — | **€280** |
| Tiles + one standard kit | €280 | €300 | €15 | **€595** |
| Tiles + one subsidized individual kit, if eligible/in stock | €280 | €100 | €15 | **€395** |

All three choices are **€140 above the original two-tile budget**. A tile-only purchase does not include a physical kit/chip to test. Discount availability and eligibility, taxes, applicable shipping and final checkout total must be checked in the user's order; no order or price reservation has been created. The [official FAQ](https://tinytapeout.com/faq/#what-is-a-devkit) explains kit contents.

The [official shuttle list](https://tinytapeout.com/chips/) lists **2026-11-30 closing** and **2027-06-09 estimated shipping** for TTSKY26d, with launch shown as TBD. Check that this shuttle actually accepts the project when opening the portal; no slot has been reserved.

## Procedure after the user's decision / 用户决定后的提交步骤

1. User chooses four tiles and the kit option, and approves the actual checkout total. Current authorization ends before purchase/submission.
2. Open [Create project](https://app.tinytapeout.com/projects/create), sign in with the user's GitHub account and enter `https://github.com/JogJohgoeg/tt-nand-hardwired`. Select **TTSKY26d / SKY130**, confirm four tiles and the kit choice. These account/order actions have not been performed here.
3. Review the imported project fields against the configuration table and the selected build's full commit/run. Complete payment only with the user's approval.
4. Use **Submit a new revision** to attach the verified GDS build. The audited candidate is b49b49e / GDS run 37359561071. Creating or paying for the project alone does not submit the design revision. If the portal selects a newer build after this documentation commit, first confirm that build's four workflows, source hashes and GDS hash; record its own run numbers.
5. Save the project URL/ID, revision commit, GDS workflow/artifact/hash, selected shuttle and tile count, order receipt and final amount. Confirm the portal lists the revision as submitted/accepted. Update the Beads submission task with those facts.
6. Any later design revision needs fresh GDS/tests/formal and an explicit portal revision before the deadline; a GitHub push by itself does not update the tapeout submission.

Procedure follows the [official submission guide](https://tinytapeout.com/guides/advanced-workshop/submit-your-design/) and [build-selection FAQ](https://tinytapeout.com/faq/#which-of-my-builds-will-be-submitted-for-fabrication). No payment, project creation or tapeout revision was submitted during this preparation.
