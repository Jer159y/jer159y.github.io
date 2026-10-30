# Single-node Epileptor × strict SCDT: 정상 이탈 survival 실험

발표용 그림은 `figure/`에 요약 00과 01·03·04를 둔다(2026-09-29에 조건 경로 02와 분기 05를 제외했다). 재현·진단 과정에서 만든 이전 그림 11개는 `archive/diagnostic_figures_2026-09-26/`에 보관했다. `figure/03_survival_curve.png`는 아래의 **탐색적 중앙값 이탈 기준**을 적용한 곡선이며, 이 기준으로 BO를 다시 돌린 결과는 아니다.

## 결과 (2026-09-26)

정상 궤적의 이탈을 `-0.5` trough crossing과 지속적인 저활동 상태의 합집합으로 정의한 뒤, 동일한 기준으로 RC와 GT의 survival rate를 평가했다.

| 항목 | 결과 |
|---|---:|
| GT 50% 경계 | `x0 = -2.0615`, 통계축 `sigma = 0.379186` |
| RC 첫 하강 50% 경계 | `sigma = 0.380292` |
| 두 경계 차이 | `+0.001106 sigma` (RC가 약간 늦음) |
| RC 경계의 이항 bootstrap 95% 구간 | `0.374466–0.386849` |
| 정상 validation RC 오경보 | `3/18 = 16.7%` |
| 별도 정상 GT validation 오경보 | `0/6` |
| 조건을 제거한 대조군 | sweep 전 구간 생존율 `0.933–1.0` |

각 통계 좌표에서 독립 RC rollout 30개를 140초 평가했다. GT는 `x0=-2.30–-1.70`의 87개 좌표마다 독립 30개 궤적을 평가했다. 기존 임계 부근 `-2.08–-2.04`의 41개 점은 유지하고, 양쪽의 정상·이탈 구간에 46개 점을 추가했다(대부분 `0.01 x0` 간격, 맨 오른쪽은 `0.02 x0` 간격). GT의 50% 경계는 임계 부근 `0.001 x0` 격자에서 생존율 1→0으로 바뀐 두 점의 중간값이다. `x0 -> sigma` 회귀는 **결과를 같은 축에 놓기 위한 검증용**으로만 사용하며, RC 조건 생성에는 쓰지 않는다. 특히 calibration의 정상 범위 밖에 있는 postcritical GT의 통계축 위치는 선형 외삽이므로, 그 구간의 수평 위치를 정밀하게 해석해서는 안 된다.

원래 판정 규칙에서 임계 부근의 첫 하강 crossing은 GT와 매우 가깝지만, 모델이 전 구간에서 정확하다는 뜻은 아니다. 원래 RC rate는 `sigma=0.456–0.474`에서 다시 상승한다. 정상 validation의 오경보도 16.7%다. bootstrap 구간은 30개 rollout의 이항 변동만 반영하며 모델 seed, 통계축 회귀, GT 격자 불확실성은 포함하지 않는다.

## 이탈의 두 원인

1. **Trough 이탈:** autonomous rollout 5초 이후 `x2-x1 <= -0.5`인 점이 하나라도 있음.
2. **저활동 이탈:** 10초 rolling 표준편차가 정상 training 전체에서 관측한 최소값 `0.0486308`보다 낮은 상태가 1초 간격 window 5개 연속 지속됨.

두 번째 기준은 18개 정상 training record에서만 유도했고 BO와 test 전에 고정했다. 단발성 저진폭 구간은 이탈로 세지 않는다. 별도 정상 GT 6개와 임계 전 GT test에서는 이 기준으로 생존이 잘못 깎이지 않았다.

선택 좌표의 30개 RC rollout을 사건별로 다시 분해한 결과, **첫 50% crossing(`sigma=0.380292`)의 15개 이탈은 전부 trough 이탈**이었다. 저활동 기준은 그 이후의 정상 피크 소실을 추가로 잡는다. 예를 들어 `sigma=0.432724`에서는 30개 모두 이탈이고, 그중 24개가 trough 없이 저활동으로만 검출됐다. 따라서 두 기준이 동일한 현상을 중복해서 만들어낸 것은 아니다. 원자료는 `data/event_decomposition_selected.csv`에 있다.

## Survival 구간별 궤적 확인

동일한 잠긴 reservoir와 기존 sweep seed로 정상(`sigma=0.327860`), 첫 50% crossing(`0.380292`), 붕괴 이후(`0.432724`), 외삽 뒤 생존율 재상승(`0.467679`)의 30개 autonomous rollout을 재현했다. 결과는 각각 `30/30`, `15/30`, `0/30`, `21/30` 생존으로 기존 sweep 표와 일치한다. 전체 140초와 첫 25초 진단 궤적은 `archive/diagnostic_figures_2026-09-26/07_survival_regime_trajectories.png`, `archive/diagnostic_figures_2026-09-26/08_survival_regime_trajectories_zoom.png`에 있다.

재상승한 21개 궤적의 시간 중앙값은 모두 `1.868–1.888`로, 정상 training record 중앙값 범위 `0.591–0.718`보다 훨씬 높다. 파형도 정상의 불규칙한 피크가 아니라 높은 기준선 위의 규칙적 진동이다. 따라서 그래프의 재상승은 **정상 동역학으로 복귀했다는 증거가 아니다**. 현재 이탈 기준이 이 다른 진동 상태를 정상으로 남기는 판정 한계다. `sigma=0.432724`에서는 전체 샘플의 `95.6%`가 RC 출력 clip 상·하한에 걸렸다. 이 구간의 평평한 궤적 역시 물리적 발작 파형이 아니라 모델 포화다. 세부 수치는 `results/survival_regime_trajectories.json`에 저장했다.

## 탐색적 추가 기준: 지속적인 기준선 상승

기존 trough/저활동 이탈에, **10초 rolling 중앙값이 정상 training window 최댓값을 지속적으로 넘는지**를 추가 평가했다. training 중앙값 범위 `0.462566–0.836114`에 범위 폭의 20% 여유를 주어 상한 `0.910824`를 고정했고, 1초 간격 window 5개가 연속으로 넘으면 이탈로 판정했다. 이는 정상 궤적에서만 정한 파형 기준이다. 높은 기준선 위의 비정상 진동을 잡되, 발작 궤적을 이용해 임계값을 맞추지는 않았다.

잠긴 모델의 기존 35점 sweep에 이 기준을 사후 적용하면, 재상승 구간 `sigma=0.4502–0.4735`의 생존이 모두 0이 된다. `sigma=0.467679`는 `21/30 → 0/30`이고, 첫 RC 50% crossing `sigma=0.380292`와 GT 경계 `x0=-2.0615`는 그대로다. GT에도 같은 기준을 적용해 비교했으며 발표용 곡선은 `figure/03_survival_curve.png`에 있다. 별도 정상 코호트에서는 GT `0/40` 이탈 유지, RC는 기존·새 기준 모두 `14/120` 이탈이었다. 독립 RC 잡음 시드의 재상승 4점에서도 새 기준의 생존율은 모두 `0/30`이었다. 세부 결과는 `results/median_guard.json`, `results/waveform_guard_fresh_normal.json`에 있다.

추가 기준은 **문제의 재상승을 관찰한 후 선택한 탐색적 기준**이다. 따라서 이 그림을 확정 결과로 쓰려면 새 판정 규칙을 먼저 고정하고 BO·독립 test를 다시 수행해야 한다. 함께 시험한 주기성(10초 window의 lagged autocorrelation) 기준도 재상승을 일부 잡았지만, 새로운 정상 RC 120개 중 오경보를 2개 늘려 단독 채택하지 않았다.

## 실험 설계

1. 각 `x0`에서 얻은 160초 궤적 전체를 하나의 record로 사용했다. 실제 EEG 실험용 window segmentation은 적용하지 않았다.
2. 정상 `x0` 6개 × 독립 seed 3개 = training record 18개. postcritical 궤적은 readout, BO, residual pool에 들어가지 않는다.
3. 각 training record에서 `sigma`와 order-3 permutation entropy를 직접 측정해 RC static input으로 사용했다. 동적 입력은 `x2-x1` 하나다.
4. training point만으로 `H_perm = -0.293063 sigma + 1.036366` 통계 경로를 적합했다 (`R²=0.576`).
5. BO 48회는 별도 정상 validation record의 통계 재현과 복합 이탈 오경보만으로 선택했다. 모든 후보는 같은 reservoir seed와 같은 validation innovation seed를 사용했다.
6. 잠긴 모델을 training record의 마지막 20초로만 warm-up하고, 통계 경로를 sweep해 autonomous survival rate를 계산했다. target GT의 warm-up은 RC에 제공하지 않았다.
7. 별도 GT test cohort를 모델 잠금 후 평가했다. 사건 판정에는 RC와 GT 모두 동일한 복합 기준을 썼다.

선택된 모델은 BO 1/48 후보이며, 정상 validation 통계 오차는 scaled MAE `1.239`, 오경보는 `3/18`이다. 최종 50% crossing은 `results/summary.json`, 모든 sweep 점은 `data/scdt_rate_sweep.csv`에서 확인할 수 있다.

## 그림

- `figure/00_scdt_summary.png`: SCDT 논문 요약 그림 형식이다. (a)는 GT와 SCDT 생존율(그림 3과 같음), (b)는 σ vs x0(그림 1 왼쪽과 같음)다. `CODE/build_scdt_summary.py`로 만든다.
- `figure/01_parameter_statistics.png`: SCDT 논문 그림 (b) 형식이다.
  - 검증 전용 정상 GT 코호트(x0 12수준 × 20개, `CODE/statistics_cohort.py` → `data/statistics_cohort.csv`)의 수준별 평균 σ·PE를 x0에 대해 그리고, 선형 적합을 겹쳤다. 세로선은 표준오차다.
  - R²는 σ 0.943, PE 0.921이다.
  - 이 코호트는 모델 학습·선택·임계값에 쓰이지 않는다. 이전의 보정 기록 산점도 그림과 통계 vs 통계 조건 경로 그림(02)은 2026-09-29에 발표용에서 제외했고, `archive/figure_2026-09-29/`에 보관했다.
- `figure/03_survival_curve.png`: 중앙값 이탈 기준을 GT·SCDT에 동일하게 적용한 탐색적 survival curve. SCDT 논문 그림 (a) 형식이다(생존율 %, 위 축 x0, 빨간 점선 = SCDT 추정 임계점). 임계 부근 원 GT는 `data/gt_boundary.csv`, 확장 GT는 `data/gt_boundary_extended.csv`.
- `figure/04_normal_departure_trajectories_2x2.png`: 정상·이탈 각각 GT와 autonomous SCDT를 비교. 정상/GT 패널은 대표 궤적을, SCDT 이탈 패널은 피크를 유지하다 지연 붕괴하는 **선택 사례**를 표시한다. 해당 통계 조건 30개 중 최초 `-0.5` 교차가 10초 이후인 궤적은 5개다. 이는 전형적인 이탈 파형을 뜻하지 않으며, 붕괴 후 출력은 clip 근처에 포화된다. 선정 인덱스와 기준은 `results/final_figure_selection.json`에 기록했다. 전체 지연 사례는 `archive/delayed_departure_candidates.png`에서 볼 수 있다.
- ~~`figure/05_bifurcation.png`~~: 2026-09-29에 발표용에서 제외했다(`archive/figure_2026-09-29/05_bifurcation_removed.png`). 다시 만들려면 `CODE/build_final_figures.py --bifurcation-only`를 실행한다.

이전 normal validation, 통계 재현, 대조군 및 구간별 궤적 진단 그림은 `archive/diagnostic_figures_2026-09-26/`에 보관했다.

이전 trough 전용 실험은 `attempts/attempt_02_trough_only`, 과도하게 넓은 6-feature kNN morphology 기준 실험은 `attempts/attempt_03_knn_morphology`에 보존했다. kNN 기준은 정상 transient GT도 이탈로 잘못 분류해 최종 정의에서 제외했다.

## 재현

```bash
cd single/CODE
MPLCONFIGDIR=/tmp/aicp_mpl PYTHONPYCACHEPREFIX=/tmp/aicp_pycache \
  python3 build_final_figures.py

# 아래는 실험과 진단 자료를 처음부터 재생성할 때 사용
MPLCONFIGDIR=/tmp/aicp_mpl PYTHONPYCACHEPREFIX=/tmp/aicp_pycache \
  python3 strict_single_node_scdt.py --out-dir .. --bo-calls 48

# 기존 모델과 RC sweep을 유지하며 GT 범위 및 2-curve 그림만 다시 생성
MPLCONFIGDIR=/tmp/aicp_mpl PYTHONPYCACHEPREFIX=/tmp/aicp_pycache \
  python3 extend_gt_survival_figure.py --out-dir ..

# 잠긴 모델의 네 구간 궤적 재현
MPLCONFIGDIR=/tmp/aicp_mpl PYTHONPYCACHEPREFIX=/tmp/aicp_pycache \
  python3 inspect_survival_regimes.py

# 파형 기준과 독립 정상 코호트 검증, 최종 중앙값 기준 그림
MPLCONFIGDIR=/tmp/aicp_mpl PYTHONPYCACHEPREFIX=/tmp/aicp_pycache \
  python3 evaluate_waveform_guard.py
MPLCONFIGDIR=/tmp/aicp_mpl PYTHONPYCACHEPREFIX=/tmp/aicp_pycache \
  python3 validate_waveform_guard_fresh.py
MPLCONFIGDIR=/tmp/aicp_mpl PYTHONPYCACHEPREFIX=/tmp/aicp_pycache \
  python3 summarize_median_guard.py
```

환경: Python 3.9, NumPy 2.0.2, SciPy 1.13.1, scikit-learn 1.6.1, Matplotlib 3.9.4, pandas 2.3.3.
