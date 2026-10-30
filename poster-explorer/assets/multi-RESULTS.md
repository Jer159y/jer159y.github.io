# 엄밀한 3노드 SCDT — 최종 결과 (2026-09-29)

프로토콜: `DESIGN.md`(원 사전 등록) + `DESIGN_ADDENDUM_dense_training.md`(학습 조건 13개로 확대).
코드: `CODE/strict_multi_node_scdt.py`, `CODE/network_gt.py`, `CODE/gt_same_grid.py`, `CODE/build_final_figures.py`.
수치: `results/summary.json`, `results/protocol.json`, `results/gt_same_grid.json`, `data/*.csv`. 실행 로그: `results/run.log`.

이전 최종본(학습 λ 5개 × 4 = 20개 기록, q05 + |corr| 조건)은 `archive/q05_20records_2026-09-24/`에 그대로 보존했다.
교체 경위와 비교 실험은 `../../MultiNode_Epileptor/experiments/multi_dense_train/RESULTS.md`에 있다.

## 무엇이 바뀌었나

- **학습 조건:** 같은 범위(λ −2.130 … −2.070)를 0.015 간격 5개에서 0.005 간격 13개로 촘촘하게 했다(각 4개 × 160 s, 52개 기록 모두 이탈 없음).
- **나머지 절차:** 원 프로토콜과 같다.
  - 검증·보정 기록과 GT 경계
  - 통계 선택 규칙
  - 정상 전용 BO 40회
  - 저수지 seed 733900
  - 이탈 판정 규칙
  - 36점 × 30개 × 200 s sweep
- **저수지 개수:** 사용자 결정에 따라 저수지 1개만 평가한다(seed 강건성은 요구하지 않음).
- **조건 통계:** 사전 규칙(λ 미사용 F 비율)을 13개 regime에 적용하자 선행 통계로 **mean**이 선택됐다(F 12.2, q05는 10.0). 두 번째 통계는 **σ**다(F 0.59).
- **GT 비교 격자:** GT를 SCDT sweep과 **같은 36개 지점**에서 계산했다(`gt_same_grid.py`).
  - 각 지점의 mean 값을 정상 보정식으로 λ에 사상하고, GT 경계와 같은 방식(λ −2.07에서 600 s 준비 → 전환 → 200 s, 30개)으로 시뮬레이션했다.

## 요약

| 항목 | 값 |
|---|---|
| 선택 통계 | 선행 mean (F = 12.2), 두 번째 σ (F = 0.59) |
| 보정 R² (λ에 대한 선형 관계) | mean 0.966, σ 0.373 |
| 조건 경로 R² | 0.030 (σ는 mean과 거의 무관) |
| 학습 mean 범위 | 0.606 – 0.662 |
| 잠긴 모델 (BO 1/40, 일반 시작점) | sr 0.72, leak 0.021, input 0.023, static 0.0042, ridge 0.47, innovation 0.47, block 1.21 s, next-state |
| 정상 검증 | 통계 scaled MAE 1.53, 응답 기울기 0.72, 거짓 이탈 0 / 32, clipping 0 |
| GT 50% (같은 36점 격자) | mean 0.5894 (λ −2.0422) |
| GT 50% (0.0025 간격 정밀 격자) | λ −2.0438 → mean 0.5906 |
| **SCDT 50%** | **mean 0.5921**, bootstrap 95% CI [0.5907, 0.5939], 정렬 λ −2.0458 |
| 경계 오차 (정밀 GT 대비) | Δmean +0.0016 (상대오차 0.27%), Δλ −0.0021 → SCDT가 **먼저** 경보 |
| 경계 오차 (같은 격자 GT 대비) | Δmean +0.0028, Δλ −0.0036 → SCDT가 먼저 경보 |
| static 0 대조군 | 36개 점 모두 생존 ≥ 24/30, crossing 없음 |

## 사전 기준 판정

- **crossing 위치:** crossing이 존재하고 외삽 영역(mean < 0.606)에 있다. **충족**
- **보수성:** mean은 전이 쪽으로 감소하므로, SCDT crossing이 GT보다 크면 이른 경보다. SCDT가 GT보다 Δλ ≈ 0.002–0.004 먼저 떨어진다. **충족**
  - 이전 q05 최종본은 이 기준을 충족하지 못했다(+0.012 늦음).
- **GT 포함 여부:** GT 0.5906은 bootstrap CI 하한 0.5907의 바로 바깥이다. 경계는 CI 포함이 아니라 오차로 보고한다.
- **같은 격자에서의 전이:** GT는 mean 0.5916(λ −2.045)까지 30/30으로 유지되다가 다음 점 0.5871(λ −2.039)에서 0/30이 된다. SCDT는 0.5916에서 이미 14/30이고 0.5871에서 0/30이다. 즉 **같은 격자 간격 안에서 함께 붕괴하며, SCDT가 반 칸 먼저 떨어진다.**

## 해석과 한계

1. **통계 조건화는 필요하다.** static 입력을 0으로 두면 어느 점에서도 crossing이 없다.
2. **학습 범위 안 생존율이 0.77–1.0으로 출렁인다.** 대조군도 0.8–1.0 수준이다.
   - 따라서 이 출렁임은 조건과 무관한 모델 자체의 잡음성 이탈이다. 200 s rollout에서 약 10–20%가 −0.5 아래로 한 번 내려간다.
   - 120 s 정상 검증에서는 0/32였다.
3. **경계를 지난 뒤에는 깔끔하다.** 생존율은 0.77 → 0.47 → 0으로 떨어지고, 먼 외삽 꼬리에서도 다시 오르지 않는다.
4. **이탈 이후 궤적은 발작이 아니다.** 이탈한 rollout은 출력 하한(≈ −6) 근처에서 평탄해진다. 외삽 꼬리의 clipping 비율은 0.62–0.98이다. 결과는 "정상 regime을 잃는 위치"의 재현이다.
5. **첫 이탈 노드가 한 노드로 모이지 않는다.**
   - 50% crossing 부근의 첫 이탈 노드 분포는 node 0/1/2 = 4/6/6이다.
   - 바로 앞 지점(23/30 생존)에서는 6/1/0으로 node 0이 많다.
   - GT는 node 0에서 시작한다. 이전 q05 최종본과 달리 "첫 이탈 노드가 GT와 일치"한다고는 말할 수 없다.
6. **통계 재현 오차가 크다.** 잠긴 모델의 정상 검증 통계 MAE는 1.53(scaled)이다.
   - 이전 최종본은 0.32였다. SCDT가 공급된 mean을 자기 궤적에서 정확히 재생성하지는 못한다.
   - BO는 40회 중 일반 시작점을 선택했다.
7. **외삽 거리가 짧다.** GT 경계는 학습 범위 끝(mean 0.606)에서 학습 폭(0.057)의 약 0.26배 떨어져 있다. 이전 q05 최종본은 약 0.26–0.43배였다.
8. **σ는 사실상 정보가 없다.** 조건 경로 R²가 0.03이므로, 실질적으로 mean 한 좌표로 조건화한 것이다.
9. **GT 사상은 외삽을 포함한다.** GT의 mean 좌표(= SCDT 격자의 λ 사상)는 정상 보정식(λ −2.14 … −2.045)을 이용한다. 보정 범위 밖의 먼 외삽 쪽 λ는 선형 외삽이다.

## 산출물

발표용 `figure/`(SCDT 논문 그림 형식, 3개 + 요약 1개):

0. `00_scdt_summary.png`: SCDT 논문 요약 그림 형식이다. (a)는 GT와 SCDT 생존율(그림 3과 같음), (b)는 선행 통계 mean vs λ(그림 1 왼쪽과 같음)다. `CODE/build_scdt_summary.py`로 만든다.
1. `01_parameter_statistics.png`: 논문 그림 (b) 형식이다.
   - 검증 전용 정상 GT 코호트(λ 12수준 × 20개, `CODE/statistics_cohort.py` → `data/statistics_cohort.csv`)의 수준별 평균 mean·σ를 λ에 대해 그리고, 선형 적합을 겹쳤다. 세로선은 표준오차다.
   - R²는 mean 0.993, σ 0.956이다.
   - 개별 기록 수준에서는 σ 잡음이 커서 보정 기록 R²가 0.373이고, 학습 기록의 조건 경로 R²는 0.03이다.
   - 통계 vs 통계 조건 경로 그림(02)은 2026-09-29에 발표용에서 제외했고, `archive/figure_2026-09-29/`에 보관했다.
3. `03_survival_curve.png`: 논문 그림 (a) 형식이다. GT와 SCDT의 200 s 생존율(%)이며, 위 축은 λ, 빨간 점선은 SCDT 추정 임계점이다.
   - 두 곡선 모두 **같은 36개 지점**, 지점당 30개 궤적이다.
4. `04_normal_departure_trajectories_2x2.png`: 정상·이탈 조건의 GT/SCDT 2×2.
   - SCDT: 정상 mean 0.6142, 이탈 mean 0.5916(crossing 직후 격자점, 16/30 이탈).
   - GT: 정상 λ −2.070, 이탈 λ −2.040.
   - 이탈 예시는 각 코호트에서 onset이 중앙값에 가장 가까운 궤적이다(GT 99.3 s, SCDT 101.8 s, 둘 다 node 0).
5. ~~`05_gt_bifurcation_scan.png`~~: 2026-09-29에 발표용에서 제외했다(`archive/figure_2026-09-29/05_gt_bifurcation_scan_removed.png`). 다시 만들려면 `CODE/build_final_figures.py --bifurcation-only`를 실행한다.

자동 진단 그림 6개는 `archive/diagnostic_figures_2026-09-29/`에 있다.

## 재현 순서 (`CODE/`, 모두 이 폴더 기준 경로)

```bash
python3 CODE/strict_multi_node_scdt.py        # 기록 생성(캐시 재사용) → 통계 선택 → BO 40회 → 잠금 → sweep·대조군 (~15분)
python3 CODE/gt_same_grid.py                  # SCDT와 같은 36점에서 GT 생존율 (~10분)
python3 CODE/statistics_cohort.py             # 그림 1용 검증 전용 통계 코호트 (λ 12수준 × 20개)
python3 CODE/build_final_figures.py           # figure/ 4개
python3 CODE/build_scdt_summary.py            # figure/00 (a)+(b) 요약 (궤적 코호트는 data/final_trajectory_cohorts.npz에 캐시)
```

- `CODE/scan_node0_bifurcation.py`와 `CODE/plot_node0_wait_comparison.py`는 그림 5의 GT 스캔 데이터를 만든 코드다(`data/node0_bifurcation_*`).
- 같은 환경에서 다시 실행하면 `results/summary.json`의 수치가 그대로 재현된다. 2026-09-29에 실험 폴더 결과와 비교해 SCDT 50% 0.5921329964를 확인했다.
