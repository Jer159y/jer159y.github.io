---
published: false # unpublished research; set true after adviser approval
layout: page
title: Keeping reservoir ensembles healthy
description: Blind resynchronisation of reservoir computing ensembles for long-horizon autonomous prediction.
importance: 2
category: Research
---

An ensemble of reservoir computers can contain excellent short-range predictors that still lose dynamically plausible members during long autonomous rollouts. Members blow up, settle onto fixed points, lock into periodic regimes, or drift away from the right distribution. Averaging the ensemble can hide this member-level collapse, and discarding every failed reservoir throws away ensemble capacity.

The question behind this project is whether a healthy and distinct set of autonomous dynamical samples can be maintained **without new observations after initialisation and without retraining reservoir parameters**.

## Approach

The ensemble runs in segments:

1. **Roll out.** Each member autonomously proposes the next segment.
2. **Screen.** Candidates are scored with features derived from training data and from the other members' output, and the most anomalous members are flagged.
3. **Resynchronise.** Each flagged member is assigned a healthy donor and is driven through that donor's internally generated history, so its hidden state is rebuilt while its weights stay unchanged.
4. **Continue.** Every member then generates the next segment on its own.

The default selection step does not use test-time truth; ground truth is used only for evaluation.

## Evaluation

Rather than only tracking forecast error, the project measures how much of the ensemble stays healthy over time and how many effectively distinct healthy trajectories remain, alongside distributional and probabilistic scores. Test systems include the forced Duffing oscillator, the Kuramoto–Sivashinsky equation, and Lorenz-96.

## Status

Pilot runs are single runs per configuration. Repeated runs with independent seeds, ablations, comparisons against stronger baselines, and cost measurements are the next steps. Applications to limited-observation ocean and robotic settings are future research questions, not demonstrated results.
