# Fly teacher calibration review / 果蝇教师校准审查

Window D support for window E; original fly artifacts remain owned by E. The user requires calibration before further GF or visual→DN distillation. The historical findings below motivated the calibration; the follow-up audit records the corrected teachers and their separately verified circuits.

## Initial findings (historical)

At review time, GF has1/64 positive labels under an assumed0.2 threshold; its peak is0.233676 and it never crosses the default0.5 criterion. Visual→DN has28/64 and12/64 positives under an assumed0.05 threshold. The latter output is18.75% positive. These do not satisfy the requested calibration and balance requirements.

The current `unit_models.teacher` always drives LC4 linearly and LPLC2 quadratically upward. Its six bits specify two amplitudes and a duration, with no stimulus class. Zero amplitude is an inactivity control; it cannot by itself establish selectivity against receding motion, translation or darkening.

Published constraints:

- Ache et al. model GF looming responses using an LC4 angular-velocity contribution and an LPLC2 angular-size contribution. Arbitrary linear/quadratic time ramps are not that fitted visual encoding. [Original paper abstract](https://pubmed.ncbi.nlm.nih.gov/30827912/).
- Klapoetke et al. find LPLC2 responds selectively to coherent outward motion and rejects receding and luminance-matched darkening stimuli. This supports explicit visual negative controls and a direction-selective feature stage. It does not establish that every possible non-looming stimulus leaves GF silent. [Original paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC7457385/).

Concrete calibration requirements: freeze named looming and non-looming cases and their desired responses before choosing parameters; fit a global gain or per-type gains/thresholds to those constraints; publish all fitted values, old/new rates, classification margins and unsatisfied cases. Include an independent parameter/stimulus sweep to reveal overfitting. Keep stimulus encoding distinct from target labels: a handcrafted looming bit that directly determines the label is an external detector, not a learned connectome result.

Only generate new distillation labels after calibration passes. Require at least30% positive cases for each output, retain substantial negatives, and report sensitivity/specificity and constant baselines. For exhaustive small domains, clearly disclose use of all rows for fitting versus independent behavioral validation. If balance is achieved by sampling, report the original domain distribution and sample construction too.

Step4 needs its own published target-neuron response constraints: GF evidence alone does not validate DNp02/DNp11 behavior. If those constraints cannot be established, retain a connectivity-based exploratory label rather than report behavioral calibration as passed. Do not proceed to whole-brain behavioral fidelity claims from numerical boundedness or circuit equivalence.

中文：旧GF与下行电路只对未经行为校准的有限教师严格等价。现有刺激全为上升斜坡，零输入不是充分的非逼近对照。需先固定文献支持的正负行为约束，再拟合增益/阈值并公布前后响应、余量和失败项，之后才生成不少于30%正例的平衡蒸馏集。方向选择前端若手工实现，须计为外置假设，不得把答案直接作为特征伪装成连接组学到的行为。第4步须有自身目标细胞的文献约束，不能直接继承GF证据。

## Follow-up audit

Fly calibration re-audit: GF gain3.6, threshold0.5 gives102/256 positives (39.84%); looming calibration minimum0.505339, non-looming maximum0.436885. Step4 gains3.9/5.85 give84/256 and85/256 positives (32.81%/33.20%), no tested negative-control fires. All256 rows per circuit independently match: GF39 NAND/depth10, DN24/depth7. Soft-DLGN failed, so these are exact finite-table syntheses. Numerical calibration passes; sensory profiles remain assumptions and independent step4 biological validation remains unestablished.
中文：GF及第4步正例均超过30%，测试负对照均静默。软蒸馏失败后采用真值表精确综合，数值校准不等于生理行为验证。
