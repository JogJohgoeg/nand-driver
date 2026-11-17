# APEX audio reference and synthesis revision

Inspected on 2026-09-08: [game page](https://apex-coast-run.mindblown.ai/?mb=game), which loads [index-CCt82HH8.js](https://apex-coast-run.mindblown.ai/assets/index-CCt82HH8.js). Bundle SHA256: `9664bb825f50b6624ce502cafbdc75d15d4363c819f4b52e85f06bd5469013d3`. The downloaded bundle remains in `/tmp`; no APEX code or recordings are embedded in our page.

## What the bundle actually does

APEX is **sample-based**, not an oscillator engine. There is one AudioContext initialization, three decodeAudioData sites, no createOscillator call, and no music/sequencer/BPM reference in the fetched game bundle. Its audio class loads five engine loops with reference RPMs1000/2000/3500/5500/8000, plus a5500-RPM coast loop. Adjacent engine loops crossfade with sine/cosine equal-power weights on a logarithmic RPM axis. Playback rate is live RPM/reference RPM, clamped. This is the source of its changing timbre, not merely a single pitched waveform.

| Layer / control | APEX implementation |
| --- | --- |
| Exhaust | Loop mix gain1.3; lowshelf150Hz,+2.5dB; presence peak1800Hz,Q.65,+1.5dB; throttle/camera low-pass2800–9900Hz. |
| Intake | Reuses exhaust recordings through band-pass650+RPM×.55Hz,Q.65; throttle/RPM gain, stronger for camera index1. |
| Stereo | Exhaust pan−.06 normally,−.38 for camera index2;23ms reflection tap at gain.075, pan−.6. |
| Road / tyre | Recorded road and skid loops; road gain follows speed^1.3 and is capped.38; road LP2600/6500Hz by camera; skid follows slip^1.5, capped.22. No separate synthesized wind oscillator/noise source was found. |
| Shifts | Upshift gain approaches.28 with8ms time constant, holds115ms, recovers with35ms time constant. Downshift uses.78 and55ms. Pitch tracks with55ms smoothing; loop gain40ms. |
| Overrun | Coast loop grows on lift above1900RPM; overrun state arms above65% throttle and triggers below10%, above4200RPM, with.7s cooldown. The shown trigger increments diagnostics; it does not play a separate backfire buffer. |
| Mechanics | No separate synthesized whine/ticks: mechanical detail is in the recordings. Impact and scrape use separate collision recordings with gain/pitch/filter variation. |
| Master | HP28Hz; compressor threshold−9dB,knee6,ratio12,attack3ms,release160ms; enabled master gain.72. |
| Transmission | Audio consumes physics RPM/gear. Reference physics uses ratios3.08/2.19/1.63/1.29/1.03/.84/.69, idle1000, ceiling9000, upshift8400/downshift3200; switch120ms, clutch release100ms, latency180ms. Our physics is unchanged. |

Three short excerpts, for reference only:

```js
$f(u/n,.35,2.1)
this.shiftUntil=s+(e?.115:.055)
650+u*.55
```

## Recordings measured without copying them

`analyze_apex_audio.cjs` fetches and decodes the reference URLs **only in a headless browser's memory**. It exports numerical spectra,100ms RMS envelopes, and approximate RPM traces in `apex_audio_measurements.json`; no reference WAV/MP3/OGG is written into the repository or reused by our synth. RPM estimates choose a nearby full- or half-firing harmonic using the asset's nominal RPM as a prior, so they are approximate, not independent tachometer measurements.

| Reference loop | Duration | Notable FFT peaks (Hz) | Character inferred from measurements |
| --- | ---: | --- | --- |
| idle | 3.700s | 70,141,211 | Uneven low pulse with stronger upper firing harmonics. |
|2000 | .825s |66,133,198 | Full/half-firing blend and subdued high end. |
|3500 | .420s |113,179,234 | Broader changing midrange; short loop limits pitch precision. |
|5500 |1.511s |183,368,551 | Strong half-firing weight beneath the nominal367Hz firing rate. |
|8000 |1.050s |267,533,800 | Brighter harmonic stack, still substantial low-end. |
|coast |1.336s |183,366 | Heavy lower harmonics on lift. |
|road |11.550s |114,130,177 | Low, broad rolling rumble. |
|skid |.470s |974–1042 | Concentrated approximately1kHz squeal. |

The engine recordings all measure about−15.92dBFS RMS before the game mix. Their800–4000Hz energy relative to100–800Hz ranges from−23.2dB at2000RPM to−5.8dB at8000RPM. Above8kHz is41–64dB below that low band. These measurements support a weighty engine that opens up with load, rather than constant bright buzz. This is spectral analysis, not a claim of an exact perceptual/sample match.

## What changed in our sample-free version

Compared with the previous version, we added a synthesized half-firing triangle component weighted around5500RPM and on coast, a150Hz/+2.5dB shelf,1800Hz/+1.5dB presence, broader load-dependent exhaust filtering, RPM-following intake, and the23ms quiet left reflection. Audible idle falls from1800 to1000RPM; the requested8200-RPM driving ceiling remains. Audio-only ratios now match APEX; up/down envelopes change from a uniform120ms deep cut to115ms/.28 and55ms/.78. Road rumble moves from460 to130Hz and squeal from1450 to1000Hz. Wind/road now bypass exhaust shift cuts. Engine gain was recalibrated after adding the low-frequency weight. Original procedural pulses, noise, quiet traffic voices, ignition, safety filtering and master limiting remain; no sample was reused.

**Music limitation:** there is no music track or synthesized score in the inspected APEX bundle, hence no APEX tempo/key or mix balance to reproduce. We retained our original124BPM/A-minor/16-bar composition. The revision is an artistic accompaniment to the measured engine: saw filter cutoffs ×.82, detuning ×.65 and lead amplitude ×.8 make it less fizzy and crowded. Its tempo, harmony, hook and sidechain remain original; these choices are not attributed to APEX.

## New listening demos / checks

[Engine demo](sound_demo.wav):6s idle→cruise→shift→turn, approximate−19.37LUFS, peak.224, crest9.07dB; above8kHz is82.56dB below100–800Hz. [Music demo](music_demo.wav):8bars/15.484s, approximate−23.05LUFS, peak.359, crest17.16dB. These replace the previous demos. The prior engine was−18.59LUFS, peak.349, crest12.14dB: the new engine has denser low-end with less transient peak, at a slightly quieter overall level. LUFS remains an ungated K-weighted approximation.

`audio_check.cjs` uses our exact live graph offline, tests peak/crest/spectrum/loudness, seven traffic voices, shift ratio, ignition, separate toggles, Chinese labels and2D suspension. Its full16-bar mixed wrap check also passes. Audio-on chase with8cars and procedural backdrop: median16.7ms,p9516.8ms,49visible calls. The separate new-Marble chase benchmark remains p9533.3ms; the audio benchmark does not erase that limitation. Both inline scripts pass node --check; page changes remain additive inside the3D IIFE.
