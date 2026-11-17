# Fruit fly connectome

> Behavior pathways picked from the connectome of a fruit fly's whole central nervous system, distilled into a few dozen NAND gates. Not yet checked by independent experiments, and not on chain.

> Status: two pathways are built as gate circuits, each bit for bit identical to its model. **None of them has passed an independent biological experiment yet.** Nothing is written on chain.

## Data

We use the public connectome of the whole central nervous system of a male fruit fly (MaleCNS). All of it is downloaded:

| Item | Count |
|---|---|
| Neurons | 176,422 |
| Cell type groups | 11,752 |
| Connections between types | 3,853,300 |
| Synapses | 125,024,863 |

## How it works

1. Pick a behavior pathway with experimental support, such as "take off and escape when something looms".
2. Use the connectome weights to build a simple firing-rate model as the teacher. The model's dynamics and signs are assumptions, not measured biological parameters.
3. Calibrate the gains with looming stimuli and control stimuli: the target neuron must fire for looming and stay quiet for controls.
4. Distill it into NAND gates on a finite table of 256 inputs, then prove the netlist matches the teacher bit for bit.

## The two pathways built so far

| Pathway | NAND gates | Depth | Latches | Against the teacher | Calibration result |
|---|---|---|---|---|---|
| Giant fiber escape (GF) | 36 | 10 | 0 | 256 / 256 bits match | 102 positives; all 128 controls quiet |
| Visual descending (DN) | 16 | 6 | 0 | 512 / 512 bits match | 84 and 85 positives for the two outputs; all 128 controls quiet |

Joined into one three-part graph (plus a 6-gate collector), they come to 58 NAND gates and 406 bytes, with 768 / 768 bits matching. This is only a plan. It is not written on chain.

## Not done yet

- **Independent experimental checks: 0.** So far there is only qualitative calibration and a logic equivalence check. The responses have not been reproduced on held-out biological experiment data.
- The input stimulus curves are assumed. They are not measured neural activity, and not rendered images.
- The encoder from raw senses to these inputs is not built yet.
- Pathways for courtship, odor approach and avoidance, navigation turning, and walking rhythm are still being modeled or are candidates.
- The logic equivalence proves "netlist = model", not "model = fruit fly".
