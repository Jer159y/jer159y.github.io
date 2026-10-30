# Digital Twin for Epileptor Seizure Transition Prediction

Code and synthetic results for the AICP 2026 poster **“Digital Twin for Epileptor Seizure Transition Prediction”** by Taehyeong Kim, Homin Son, Seonggyu Jang, and Hyeonmin Hwang (advisor: Pilwon Kim, UNIST).

The experiments ask whether a statistically conditioned digital twin (SCDT), trained on **normal Epileptor dynamics only**, can locate the boundary where normal dynamics is lost. The hidden excitability parameter is never supplied to the reservoir. Instead, statistics measured from each normal record provide a static condition, and the trained reservoir generates autonomous trajectories at new statistical coordinates. A survival curve is the fraction of trajectories that remain in the normal regime at each coordinate.

These are **simulation results**, not a validated clinical seizure predictor. The release contains no patient EEG or ECG recordings.

## Experiments

| Model | Conditioning statistics | Ground-truth 50% boundary | SCDT 50% boundary |
| --- | --- | ---: | ---: |
| Single-node Epileptor | Signal standard deviation (σ), permutation entropy | σ = 0.3792 | σ = 0.3803 |
| Three-node Epileptor network | Node-averaged mean, standard deviation | mean = 0.5906 | mean = 0.5921 |

The difference is approximately 0.3% of the respective GT coordinate. These values summarize a locked reservoir and the specified test protocol; bootstrap intervals account for rollout variability, not reservoir-seed or model uncertainty. The three-node model also has intermittent false departures within the normal training range. After departure, SCDT trajectories often saturate at the output clip bound, so the post-transition waveform should **not** be interpreted as a faithful seizure waveform.

## Repository layout

| Path | Contents |
| --- | --- |
| [`single/CODE/`](single/CODE/) | Single-node Epileptor, SCDT training/BO, survival evaluation and figures |
| [`single/data/`](single/data/) and [`single/results/`](single/results/) | Synthetic records, sweep tables and machine-readable summaries |
| [`single/figure/`](single/figure/) | Final single-node plots |
| [`multi/CODE/`](multi/CODE/) | Three-node network GT, SCDT training/BO, controls and figures |
| [`multi/data/`](multi/data/) and [`multi/results/`](multi/results/) | Synthetic records, sweep tables and machine-readable summaries |
| [`multi/figure/`](multi/figure/) | Final network plots |
| [`AICP_2026_poster.pdf`](AICP_2026_poster.pdf) | Research poster describing the question and headline results |

The detailed experimental protocols and caveats are in [`single/README.md`](single/README.md), [`multi/DESIGN.md`](multi/DESIGN.md), and [`multi/RESULTS.md`](multi/RESULTS.md). References there to local archives concern diagnostic history omitted from this focused release.

## Reproduce

Use Python 3.9 and install the pinned packages:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

The included synthetic data and locked results can regenerate the final figures:

```bash
python single/CODE/build_final_figures.py
python single/CODE/build_scdt_summary.py
python multi/CODE/build_final_figures.py
python multi/CODE/build_scdt_summary.py
```

To rerun training and Bayesian optimization from the Epileptor simulator, run the following from each experiment directory. These runs are computationally expensive and overwrite the corresponding generated data and results.

```bash
cd single
python CODE/strict_single_node_scdt.py --out-dir . --bo-calls 48
cd ../multi
python CODE/strict_multi_node_scdt.py
python CODE/gt_same_grid.py
```

The static conditions are calculated from complete synthetic normal records. The survival boundary is an operational **normal-departure** criterion applied identically to GT and SCDT; it is not a proof of a mathematical bifurcation or a clinical seizure diagnosis. The single-node displayed survival curve additionally uses an exploratory post hoc baseline guard, documented in `single/README.md`.

## Scope

This repository contains the poster's single-node and three-node Epileptor experiments only. Follow-up SWEC iEEG and SDDB ECG experiments, patient recordings, local archives, and large intermediate outputs are excluded.
