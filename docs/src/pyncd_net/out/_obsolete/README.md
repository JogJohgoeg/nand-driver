# out/_obsolete —— 已废弃的构建产物（不进 verify_all 回归）

verify_all.py 只用 out/*.json（非递归），所以这一子目录里的东西不会被形式等价回归发现。

## transformer_l2.{json,v,log} / transformer_l2_v2.log

09-17 的 transformer_l2 展开版（Level-2）产物：482 门、自身比特级验证 verify.ok=false（exhaustive
2^12，106 位不一致），且该图已被后来的 LATCH l2 步进体（out/transformer_l2_stepper*，见 README 的顺序/
LATCH 步进体表）取代。保留在这里只为留痕，不要拿它当有效网表；回归清单里已去掉（它过去总在表里报红）。
