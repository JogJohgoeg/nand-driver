# Credits and licenses

This static demo uses Pollen Robotics' Microduck robot, walking policy, model,
meshes and browser rendering code, distributed through the Hugging Face Space
[pollen-robotics/microduck-simulator](https://huggingface.co/spaces/pollen-robotics/microduck-simulator).
Snapshot commit: **e81974b932c7ca1819843b7bb3dcd42e2993e98e**.

## Microduck / Pollen Robotics

**License found at this snapshot: not declared.** The repository has no LICENSE
file and its README metadata has no `license` field. The public
[Space API metadata](https://huggingface.co/api/spaces/pollen-robotics/microduck-simulator),
checked on 2026-09-09, reports the same commit and also contains no license field.
The original task described it as Apache-2.0, but that designation was not
confirmed in the retrieved Space. No blanket Apache-2.0 claim is made for these
robot assets or the Space's code. Credit is not a substitute for a license grant.
The metadata record is retained in [licenses/space_metadata.json](./licenses/space_metadata.json).

The Space attributes its model and policies to
[pollen-robotics/microduck](https://github.com/pollen-robotics/microduck) and
[pollen-robotics/microduck_rl](https://github.com/pollen-robotics/microduck_rl).
This build preserves the Space's walking ONNX and robot binaries. It adapts the
observation/stepping loop, reuses its render rig/material code, and adds the static
course, ideal virtual ToF, bit expert, NAND steering and bilingual interface.
The shipped kinematics JSON's mesh directory was changed from an absolute path
to `./robot/mjlab/meshes`; robot geometry and policy weights were not changed.

## MuJoCo

`@mujoco/mujoco` **3.11.0**, Google DeepMind / MuJoCo contributors.
Its installed package metadata declares **Apache-2.0**, consistent with the
[upstream LICENSE](https://github.com/google-deepmind/mujoco/blob/main/LICENSE).
License text: [MuJoCo-APACHE-2.0.txt](./licenses/MuJoCo-APACHE-2.0.txt).
The JavaScript bindings and single-thread MuJoCo WASM binary are bundled locally.

## ONNX Runtime

`onnxruntime-web` and `onnxruntime-common` **1.27.0**, Microsoft Corporation.
**MIT**, as declared by the installed packages and
[upstream LICENSE](https://github.com/microsoft/onnxruntime/blob/main/LICENSE).
License: [ONNXRuntime-MIT.txt](./licenses/ONNXRuntime-MIT.txt).
Upstream notices: [ONNXRuntime-ThirdPartyNotices.txt](./licenses/ONNXRuntime-ThirdPartyNotices.txt).
The WASM-only JavaScript runtime is bundled into the page's JS; its
`ort-wasm-simd-threaded.wasm` sidecar is local and runs with `numThreads=1`.
It does not require a CDN, a worker sidecar, COOP/COEP headers, or a dev server.
The license/notices texts were retrieved from upstream on 2026-09-09; package
versions are recorded independently rather than implying those documents pin a tag.

## Rendering and JavaScript dependencies

Three.js **0.164.1**, three.js authors, **MIT**. Full license is included in
[THREE-LICENSE.txt](./licenses/THREE-LICENSE.txt). Bundled Three.js addons include
OrbitControls, GLTFLoader, STLLoader and BufferGeometryUtils.
License files for ONNX Runtime's installed JavaScript dependencies are retained
under `licenses/` where present in their npm packages, alongside the upstream
ONNX Runtime third-party notices. Vite is build tooling, not a server dependency.

## TapeOut steering prototype

The 39-NAND steering netlist is circuit #281 on CPU 0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38 using the same official
byte encoding as TapeOut circuits #279/#280, not those circuits' netlists.
The optional RPC path only issues `eth_call`; it sends no transaction. Low-level
gait inference remains the upstream ONNX policy off-chain. The new steering
controller and integration do not change the licensing of third-party components.
