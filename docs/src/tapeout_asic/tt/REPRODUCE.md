# Reproduce the one-tile candidate

**Primary information:** the candidate's RTL, vectors, GDS, PDK/tool pins and passing logs are retained locally; no remote submission is needed to repeat the checks.

**Required context:** use the IHP PDK and current Tiny Tapeout templates together. Functional gate simulation needs the documented zero-delay adapter; physical tools must use the original PDK.

**Next action:** verify the file manifest, run RTL and routed-netlist vectors, then rerun hardening/precheck if the RTL, PDK, constraints or physical artifacts change.

Expression: a sequential reproduction procedure with explicit inputs and evidence locations.

## Inputs and versions

The project top is `tt_um_tapeout_models`; its complete source list is in [info.yaml](info.yaml). The recorded GDS corresponds to [src](src/), not to the earlier NEE prototype in the parent directory.

- Tiny Tapeout support tools: `01d5d2814fa9dd61e9d211e0b235a4a592a9316a`.
- IHP flow: LibreLane `3.0.3`; PDK revision `c4b8b4e5e7a05f375cca3815d51b3a37721fbf5c`, library `sg13g2_stdcell`.
- SKY comparison: OpenLane `2.3.10`; PDK revision `0fe599b2afb6708d281543108caf8310912f54af`, library `sky130_fd_sc_hd`.
- IHP flow tools: Yosys `0.62`, OpenROAD build `2026-02-17`, Verilator `5.044`. The flow's pinned Nix environment supplies Magic, KLayout, OpenSTA and Netgen.
- Model checkpoint: OpenBMB MiniCPM5-2B `12a3808a956f869c767195e9266b59c4d21d92e2`. Vectors use one BF16-derived Q row and a deterministic synthetic activation vector. See [layer reference](../minicpm/layer_reference.py) and [row twin result](../minicpm/exact_twin_row.json).

Run `shasum -a 256 -c MANIFEST.sha256` in this directory to check the frozen inputs/artifacts. Documentation is excluded from the hardware manifest so editorial changes do not imply a new physical run.

## Functional simulation

From this directory, with Verilator and a C++17 compiler installed:

```sh
verilator --cc --exe --build -j 4 -Wno-fatal --top-module tt_um_tapeout_models src/*.v test/test_models.cpp
./obj_dir/Vtt_um_tapeout_models
```

Expected: PASS with 476,379 clocks. The vectors and expected values are consumed from `test/`; run from the project root.

For routed IHP simulation, set `PDK_ROOT` to an installation containing `ihp-sg13g2` and prepare the simulation-only adapter:

```sh
python3 test/ihp_zero_delay.py "$PDK_ROOT/ihp-sg13g2/libs.ref/sg13g2_stdcell/verilog/sg13g2_stdcell.v" test/ihp_zero_delay.v
verilator --cc --exe --build -j 4 --Mdir obj_gate_ihp --no-timing -Wno-fatal --top-module tt_um_tapeout_models physical/ihp1/tt_um_tapeout_models.v test/ihp_zero_delay.v test/test_models.cpp
./obj_gate_ihp/Vtt_um_tapeout_models
```

This checks the original gate functions/UDP behavior with zero-delay inputs; it does not replace STA or simulate SDF. The unadapted model's delayed inputs are undriven because the simulator ignores their `specify` tasks. No modifications are made to the installed PDK.

The actual build-host-2 scripts additionally select `g++`, C++17 and the pinned Nix compiler flags. They are retained as [RTL test](../remote/tt_test.sh), [IHP gate test](../remote/tt_gate_ihp.sh), [standalone block mappings](../remote/tt_block_areas.sh) and [explicit register-to-register STA](../remote/tt_r2r.sh). These scripts are environment-specific records, not portable installers.

## Hardening and precheck

Use the [official local-hardening procedure](https://tinytapeout.com/guides/local-hardening/) with the pinned support tools. At project root, put those tools in `tt/` and run:

```sh
python3 tt/tt_tool.py --ihp --create-user-config
python3 -m librelane --pdk ihp-sg13g2 --run-tag ihp_reproduce src/config_merged.json
```

The source `config.json` is the official IHP template with its supported clock-period setting changed to 100 ns. Density remains 60%. It intentionally disables flow KLayout DRC; bundled precheck subsequently runs the IHP rules. Compare final GDS/LEF/netlist, metrics and precheck output, allowing tool nondeterminism only when equivalence and physical checks establish validity.

Put final GDS, LEF and the unpowered netlist together under a `precheck_input/` directory with matching basename `tt_um_tapeout_models`; retain the project `info.yaml` in its parent. In the support tools' `precheck/` directory, set `PDK_ROOT` and `PDK=ihp-sg13g2`, then run:

```sh
python3 precheck.py --tech ihp-sg13g2 --gds /absolute/project/precheck_input/tt_um_tapeout_models.gds
```

Local execution used the original official precheck rules. Its `yowasp-yosys` command was supplied by a task-local symlink to native Yosys 0.62 for port extraction and netlist parsing. This substitution is recorded; the shuttle's own CI remains an independent acceptance gate. [Precheck log](physical/ihp1/precheck.log), [JUnit output](physical/ihp1/precheck.xml).

build-host-2 uses a rootless `nix-portable`/proot environment because Docker access is unavailable. The task's dependency-only Nix shell avoids unused plugin builds; no proprietary EDA tool or PDK alteration is used. [Recorded IHP invocation](../remote/tt_ihp_run.sh), [recorded precheck invocation](../remote/tt_ihp_precheck.sh). Preserved [merged configuration](physical/ihp1/config_merged.json) contains build-host-2 absolute paths; regenerate it rather than copying those paths to another machine.

## Artifact and release boundary

The [report](REPORT.md) is the authoritative interpretation of results, prices, shuttle dates and remaining warning. Physical outputs and vectors are ready for review. No dedicated public submission repository, author approval, licensing declaration, reservation or purchase has been created. Releasing the design and paying for a shuttle remain the user's decision.
