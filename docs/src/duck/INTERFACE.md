# Microduck / TapeOut interface audit

Source: local clean LFS clone of https://huggingface.co/spaces/pollen-robotics/microduck-simulator,
commit `e81974b932c7ca1819843b7bb3dcd42e2993e98e` (2026-09-04).
Paths below are relative to `microduck-simulator/`; references describe this commit.

## Feasibility

The walking policy **does accept velocity commands**. A gate controller can set
yaw rate while holding forward speed constant. It does not replace the learned
balance controller. There is a ToF mounting site, **no implemented 8×8 depth sensor**.
A synthetic depth sensor must be added and clearly identified as such.

## Policy and stepping

- `app/src/game/game.js:646`: `buildObs()` constructs float32 tensor `obs`, shape
  `[1,61]`. Offsets: 0–2 gyro (`imu_ang_vel`); 3–5 projected world gravity
  rotated into trunk coordinates; 6–19 joint position minus DEFAULT_POSE;
  20–33 joint velocity; 34–47 previous raw policy action; 48–60 commands.
- Command indices 0–2 (observation 48–50) are `[vx,vy,wz]`, in m/s, m/s,
  rad/s. Commands 3–6 are four head offsets; 7–12 are body slots, left zero
  by the normal browser controls. Walking reads `effectiveCmd()`;
  other behaviors repurpose the first command slots (`game.js:661–690`).
- `app/src/game/constants.js:29–48`: 14 joints, ordered left hip yaw/roll/pitch,
  knee, ankle; neck pitch; head pitch/yaw/roll; right hip yaw/roll/pitch,
  knee, ankle. `DEFAULT_POSE` provides their offsets.
- `game.js:862–877`: ONNX input `obs`, output `actions` with 14 values;
  `ctrl[j] = DEFAULT_POSE[j] + actions[j] * ACTION_SCALE`, scale 1.0.
  Previous action stores raw network output. Four `mj_step` calls follow.
- `constants.js:45–48`: 0.005 s physics timestep, decimation 4, 0.02 s control
  interval = 200 Hz physics / 50 Hz policy. `game.js:1050–1067` serializes async
  inference and paces by wall time; slow runs do not skip simulation substeps.
- `constants.js:52–58`: leg keyboard limits +0.25/-0.2 m/s and ±1 rad/s;
  roller limits +0.6/-0.5 m/s and ±0.3 rad/s. Lateral UI command is zero.
- `app/src/game/controls/gamepad.js:38–39,120–145`: left-stick deadzone .15,
  EMA alpha .12, forward from negative vertical axis, yaw from negative
  horizontal axis. Input arbitration is in `controls/controller.js:54–65`.

## Physics and sensor access

- `game.js:171–267` loads robot_allcollisions.xml, removes visual-only geoms
  and unneeded meshes, appends floor/walls/prop colliders/ball/terrain/STAND
  keyframe. `game.js:280–301` fills MuJoCo VFS from local GLB-derived STL or
  remaining local meshes; `game.js:358` compiles model and data.
- `app/public/robot/mjlab/robot_allcollisions.xml:60–67` lists orientation,
  two gyros, velocity, acceleration and angular momentum sensors. No depth,
  rangefinder array or ToF sensor is declared. The `tof` site at line 259
  is a head-mounted coordinate frame only; it produces no depth data.
- The installed `@mujoco/mujoco/mujoco.d.ts:3674` exposes `mj_ray`; line 1316
  exposes `data.contact`. Upstream game comments claiming no contact array
  are stale for this installed API. Actual usage still requires runtime tests.

## Determinism

Fixed physics dt alone does not make the interactive app a reproducible trial.
`resetSim()` (`game.js:559–588`) resets keyframe, previous actions and head state,
but interactive commands, ceremonies and some fall handling depend on wall time.
Ball spawning (`game.js:624–625`) and audio use unseeded `Math.random()`.
The MJCF declares noise on two sensors, but the policy selects the separate
`imu_ang_vel` gyro without a noise attribute. Noise behavior is not established
by static inspection. ONNX uses single-thread WASM (`game.js:159`).

The closest controlled walking experiment is a separate page reusing the robot,
policy, render rig and observation construction, with static course geometry,
complete resets, no user command polling, no multiplayer, no automatic recovery,
and sequential inference followed by exactly four physics steps. Compare repeated
full trajectories in the same browser/runtime before claiming determinism;
cross-browser or cross-machine bitwise determinism is not assumed.

## Tooling status

`git lfs version`: 3.8.0. The destination already contained a clean clone and
materialized LFS assets; the requested clone command refused to overwrite it.
Local npm tooling, app/node_modules and app/dist were also already present.
Their existence is not evidence that this agent built or ran the app.
Node requested by user: `~/.local/share/cursor-agent/versions/2026.09.02-c22c1a3/node`.
Both upstream and prototype production builds now pass. The default build is
`node node_modules/vite/bin/vite.js build`; the prototype adds
`--config vite.brain.config.js`. Production preview on port 5188 boots and runs
the robot with public HTTPS/WSS resources blocked. Run/Pause, Reset, both camera
modes and a 390px layout pass; zero JavaScript exceptions. See `ui_results.json`.

## Implemented experiment

The separate entry is `app/brain.html`, loading `app/src/brain-demo.js`.
`app/src/brain-core.js:2` specifies the course and starts; its `expert`,
`encodeDepth`, `decodeNetlist` and `evalOfficial` define the bit-only interface.
The latter two are reused from the TapeOut showcase. The runner compiles a new
static MJCF, removes sensor noise declarations, resets every trial and directly
executes the original walking ONNX policy. No multiplayer or interactive upstream
control loop is imported. The generated scene is retained in `duck/course.xml`.

The ToF substitute is ideal and yaw-stabilized, not attached to the head site:
64 physics rays, 60° × 12°, origin 0.06 m forward of the trunk at world z=0.16 m.
Robot groups are excluded; floor and obstacles remain ray-visible. Two 4-row
bands × column groups [0,3), [3,5), [5,8) produce six minimum depths, with near/far
bits at strict <0.3/<0.7 m. Goal direction comes from exact simulated pose.
There are 14 inputs, 2 outputs, no additional state bits.

Navigation uses constant vx=.25, vy=0, wz∈{−.8,0,+.8}. A short zero-command
settling phase precedes navigation. The initial .18 m/s command failed to initiate
walking on most starts; .25 worked (see `speed_probe.json`). Contact handles must
be explicitly deleted in these WASM bindings; the initial experiment leaked
them, and the final runner fixes that. Eight-start results: expert and NAND both
7 goals, 6 collision-free goals. A full repeated 2014-step trajectory has identical
qpos/qvel at every step in the tested runtime. Details and limitations: `duck/README.md`.
