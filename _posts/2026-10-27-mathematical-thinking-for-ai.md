---
published: false # draft; review before publishing
layout: post
title: "AI를 위한 수학적 사고: 한 학기 강의를 설계하며"
date: 2026-10-27
description: 교과목 개발 조교로 참여한 「AI를 위한 수학적 사고」의 16주 구성과 설계 의도.
tags: [teaching]
---

2026년에 교과목 개발 조교로 「AI를 위한 수학적 사고 (Mathematical Thinking for AI)」의 주차별 강의 계획을 설계했습니다. 출발점은 한 문장이었습니다.

> AI는 데이터를 설명하는 함수를 찾는 문제이다.

이 문장을 이해하는 데 필요한 수학을 한 학기에 걸쳐 차례로 쌓아 가는 것이 목표였습니다.

## 전반부: 데이터, 벡터, 행렬, 회귀

| 주차 | 주제 | AI와의 연결 |
| --- | --- | --- |
| 1 | AI 문제의 구조: 데이터, 모델, 학습 | 지도학습을 함수 근사로 보기, 이미지 분류 예시 |
| 2 | 데이터의 수학적 표현: 벡터 | feature vector, 내적과 norm, cosine similarity |
| 3 | 선형변환과 행렬 | 신경망 층의 계산 $Wx + b$, batch 처리 |
| 4 | 선형회귀 | 최소제곱 손실, train/validation/test 분할, overfitting |
| 5 | 분류 | decision boundary, one-hot encoding, softmax와 cross-entropy 직관 |
| 6 | 미적분과 최적화 | 편미분과 다변수 함수 |
| 7 | 경사하강법 | gradient의 기하적 의미, L2 regularization, mini-batch |

선형회귀를 "은닉층 없는 1-layer 신경망"으로 해석하는 4주차가 전반부의 연결고리입니다. 학생들이 이미 아는 도구가 신경망의 가장 단순한 형태라는 것을 보여 주고 싶었습니다.

## 후반부: 신경망과 학습

| 주차 | 주제 | 핵심 |
| --- | --- | --- |
| 9 | 신경망의 구조 | $a = \sigma(Wx + b)$, 활성화 함수, 단층 신경망의 한계 |
| 10 | 합성함수로서의 신경망 | hidden layer와 표현 공간 변환 |
| 11–12 | 연쇄법칙과 역전파 | forward/backward pass, gradient vanishing |
| 13 | 분류의 확률적 해석 | 조건부확률, softmax가 확률을 만드는 이유 |
| 14–15 | Cross-entropy | softmax + cross-entropy, 최대우도추정과의 연결 |

5주차에서 직관만 짚고 넘어간 softmax와 cross-entropy를 13–15주차에서 확률과 최대우도추정으로 다시 정당화하는 구조입니다. 처음에는 "MSE와 다르다" 정도만 알고 써 보고, 나중에 왜 그래야 하는지를 수학적으로 확인하게 했습니다.

## 설계하며 신경 쓴 점

- 모든 개념을 AI에서 실제로 쓰이는 계산과 바로 연결했습니다.
- 같은 개념을 직관과 정당화의 두 번에 걸쳐 다루어, 처음부터 모든 것을 증명하려다 지치지 않게 했습니다.
- 행렬 곱에서 역전파까지 하나의 계산 흐름으로 이어지도록 순서를 정했습니다.
