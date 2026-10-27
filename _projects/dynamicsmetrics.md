---
layout: page
title: DynamicsMetrics.jl
description: An early-stage Julia toolkit for evaluating predictions of dynamical systems.
importance: 1
category: Research software
github: https://github.com/Jer159y/DynamicsMetrics.jl
---

Predictions of chaotic and nonlinear systems are hard to judge with a single pointwise error. A forecast can drift away from the true trajectory quickly and still reproduce the right statistics, or stay close for a while and then collapse to a fixed point. DynamicsMetrics.jl collects the measurements I kept rewriting for each experiment into one package, so that short-term error, forecast horizon, temporal structure, distributions, and ensemble uncertainty can be reported together and reproduced later.

## What it covers

- **Pointwise error:** RMSE, MAE, NRMSE, and relative L2, with global, per-state, per-time, or no reduction.
- **Forecast horizon:** valid prediction time and forecast horizon from threshold crossings, with `dt` conversion and linear interpolation of the crossing.
- **Temporal, statistical, and dynamical structure:** autocorrelation, power spectral density, spectral entropy, covariance, Wasserstein and Jensen–Shannon divergence, permutation irreversibility, and recurrence-based measures.
- **Ensembles:** ensemble mean and spread, memberwise error, and prediction-interval coverage.
- **Reports:** `MetricResult`, `MetricSeries`, `MetricReport`, and `MetricSuite` types, human-readable tables, and TOML save and restore with metadata.

## Design choices

Trajectories are `state × time` arrays and ensembles are `state × time × ensemble`. The package validates shapes, finite values, `dt`, and transient handling instead of silently correcting them, so a mismatched input fails loudly rather than producing a plausible-looking number.

A small example shows why memberwise metrics matter: three ensemble members biased by −1, 0, and +1 have an ensemble mean with zero RMSE, while memberwise error and spread reveal that two of the three members are wrong.

## Status

This is an early implementation with deterministic examples and unit tests for input validation, result types, suites, reports, and TOML round trips. The examples illustrate API behaviour; they are not benchmark results. The next step is to apply the toolkit to real dynamical-system benchmarks and compare which metrics actually change modelling decisions.

Source code: [github.com/Jer159y/DynamicsMetrics.jl](https://github.com/Jer159y/DynamicsMetrics.jl)
