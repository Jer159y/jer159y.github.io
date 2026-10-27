---
layout: page
title: Ensemble reservoir computing for spatiotemporal chaos
description: Two ensemble strategies for long-term prediction of the Kuramoto–Sivashinsky equation. Poster, KSIAM Annual Meeting 2026.05.
img: assets/img/ksiam2026-ensemble-rc-poster.jpg
importance: 2
category: Research
---

Poster presented at the KSIAM Annual Meeting in May 2026, with Pilwon Kim.

[Download the poster (PDF)]({{ '/assets/pdf/ksiam2026-ensemble-rc-poster.pdf' | relative_url }})

## Motivation

Spatiotemporal chaotic systems governed by nonlinear PDEs show exponential divergence of nearby trajectories, which puts a hard limit on deterministic predictability. Long-term prediction has to run in a closed-loop, autonomous regime, so errors accumulate and most machine learning models collapse quickly.

Reservoir computing (RC) is a structured alternative. Only the linear readout of an echo state network is trained, by ridge regression, while the fixed random reservoir provides the echo state property and robustness to noise. RC-based long-term prediction of high-dimensional spatiotemporal chaos, however, is still not well studied.

## Two failure modes

Scaling RC to high dimensions and long horizons on the Kuramoto–Sivashinsky (KS) equation with 128 spatial points exposed two problems:

1. **Noise-driven collapse.** Under strong observation noise, single-reservoir predictions quickly degenerate into incoherent states.
2. **Autonomous prediction instability.** Over long horizons, single reservoirs flip, damp out, decohere, or lock into periodic orbits.

## Methods

- **Step-by-step mean ensemble (SME).** Several reservoirs predict in parallel, and each one is fed back a blend of its own prediction and the ensemble mean. Partial feedback suppresses noise-driven collapse while keeping the members diverse.
- **Iterative rollout ensemble (IRE).** Reservoirs roll out segments independently, a small training-free compression reservoir turns each candidate trajectory into a feature vector, and the trajectory closest to the training-data cluster is selected and used to re-warm all members before the next segment.

## Findings

In the high-noise regime, SME produced the trajectories most visually consistent with the ground truth. A naive ensemble reached lower MSE, but only by averaging toward a mean state and suppressing the dynamics; valid prediction time showed that it failed to reproduce the underlying behaviour.

In the low-noise regime, both SME and IRE stayed coherent for much longer than a single reservoir. Sliding-window statistics (mean, standard deviation, covariance, and power spectrum) showed that IRE stayed closest to the statistics of the true trajectory throughout the prediction horizon.

## Next steps

An adaptive blending parameter, learned trajectory selection, and extension to other chaotic PDEs such as 2D Navier–Stokes.
