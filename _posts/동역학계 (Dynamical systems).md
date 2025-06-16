---
layout: post
title: 
date: 
description: 
tags: 
category: 
disqus_comments: 
related_posts:
---


동역학계^[Dynamical system]는 우리가 흔히 파라미터라고 부르는 매개변수에 따라 변화하는 과정을 아울러 말합니다. 이렇게 설명하면 너무 추상적이기 때문에, 예시를 가져와 보겠습니다.


예시 소개 1 : SIR 모델 (수리모델링에 사용, 카오스 이론 - 초기 조건 및 다양한 변수에 의해 예상치 못한 방향으로 진행되고, 정확하게 예측하기 어려움)
감염병을 
$$\begin{align}
\frac{dS}{dt} &= - \frac{\beta}{N} SI \\
\frac{dI}{dt} &= \frac{\beta}{N} SI - \gamma I \\
\frac{dR}{dt} &= \gamma I
\end{align}$$

