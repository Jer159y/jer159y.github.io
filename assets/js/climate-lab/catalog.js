// Content for the climate-systems ladder: equations, diagnostics, tasks, methods and caveats.
// TeX strings are rendered by the site's MathJax.
const tex = String.raw;
const doi = id => `https://doi.org/${id}`;

export const tasks = [
  { id: 'predict', name: '예측가능성·앙상블 예보', desc: '초기 오차가 얼마나 빨리 자라는지, 언제까지 예측이 의미 있는지 묻습니다.' },
  { id: 'da', name: '자료동화', desc: '불완전하고 잡음 섞인 관측과 모델을 결합해 현재 상태를 추정합니다.' },
  { id: 'tipping', name: '민감도·tipping·hysteresis', desc: '강제를 천천히 바꿀 때 평형이 어떻게 이동하고, 언제 갑자기 다른 상태로 넘어가는지 봅니다.' },
  { id: 'variability', name: '잡음 강제 변동성', desc: '빠른 "날씨" 잡음이 느린 기후 변수에 어떤 스펙트럼·체류 시간·극값을 만드는지 봅니다.' },
  { id: 'ml', name: '데이터 기반 예측 (ML·RC)', desc: '방정식 대신 시계열로 학습한 모델이 궤적과 장기 통계를 재현하는지 시험합니다.' },
  { id: 'param', name: '파라미터화·closure', desc: '해상하지 못하는 작은 규모의 효과를 큰 규모 변수의 함수로 표현합니다.' },
];

export const systems = [
  {
    id: 'ebm', name: '0D 에너지 균형 모델', short: 'EBM', dim: '1', dimNote: '전지구 평균 온도 T 하나',
    timeUnit: '년', view: 'branch', stepsPerFrame: 25,
    predicts: '전지구 평균 지표 온도의 평형과, 태양·온실가스 강제에 대한 반응',
    physics: '흡수 단파(ASR)와 외향 장파(OLR)의 균형, 얼음-알베도 되먹임, 혼합층 열용량',
    omitted: '위도 구조와 열 수송, 구름·수증기 되먹임의 상세, 심층 해양 열 흡수',
    cost: 'O(1)',
    summary: '알베도가 온도에 따라 바뀌면 같은 태양 강도에서 따뜻한 상태와 눈덩이 상태가 함께 안정할 수 있습니다. "현재 상태에서 이어가기"를 켠 채 μ를 0.85 아래로 내렸다가 1.21 위로 올려 hysteresis loop를 따라가 보세요.',
    params: [
      { key: 'mu', label: '태양 상수 배율 μ', min: 0.8, max: 1.3, step: 0.005 },
      { key: 'forcing', label: '복사 강제 ΔF (W m⁻²)', min: 0, max: 10, step: 0.1 },
      { key: 'depth', label: '혼합층 깊이 (m)', min: 10, max: 200, step: 5 },
      { key: 'sigma', label: '날씨 잡음 σ (W m⁻² yr^½)', min: 0, max: 20, step: 0.5 },
      { key: 'T0', label: '초기 온도 T₀ (°C)', min: -50, max: 30, step: 1 },
    ],
    equations: [
      tex`C\,\frac{dT}{dt} = \underbrace{\mu Q\,[1-\alpha(T)]}_{\text{ASR}} - \underbrace{(A - \Delta F + B\,T)}_{\text{OLR}} + \sigma\,\xi(t)`,
      tex`\alpha(T) = \alpha_w + \frac{\alpha_i-\alpha_w}{2}\left[1-\tanh\frac{T-T_c}{w}\right]`,
    ],
    variables: tex`$T$: 전지구 평균 온도(°C), $Q=342\ \mathrm{W\,m^{-2}}$, $A=203.3$, $B=2.09\ \mathrm{W\,m^{-2}K^{-1}}$ (Budyko형 OLR 근사), $\alpha_w=0.30$, $\alpha_i=0.62$, $T_c=-10^\circ$C, $w=6$ K, $C=\rho c_p H$ (혼합층 깊이 $H$).`,
    diagnostics: [
      { name: '열 함량 (에너지 대응)', tex: tex`\mathcal{H} = C\,T`, explain: '이 모델의 "에너지"는 운동에너지가 아니라 혼합층 열 함량입니다. 운동에너지·enstrophy·유속은 정의되지 않습니다.' },
      { name: '수지', tex: tex`\frac{d\mathcal{H}}{dt} = \mathrm{ASR} - \mathrm{OLR} \;(+\ \text{잡음})`, explain: '대기 상단 순복사 N = ASR − OLR이 곧 열 함량의 변화율입니다. 평형에서는 N = 0입니다.' },
      { name: '되먹임 계수와 ECS', tex: tex`\lambda = -\frac{dN}{dT} = B + \mu Q\,\alpha'(T),\qquad \mathrm{ECS} \approx \frac{F_{2\times}}{\lambda},\ F_{2\times}\approx 3.7\ \mathrm{W\,m^{-2}}`, explain: 'λ > 0이면 평형이 안정합니다. 얼음선 근처에서는 α′(T) < 0이라 λ가 작아지고 민감도가 커지며, λ < 0인 가지는 불안정합니다. 이 0D 모델의 ECS는 구름·수증기 되먹임이 없으므로 현실값보다 작습니다.' },
    ],
    numerics: 'RK4, Δt = 0.02년. 잡음은 Euler–Maruyama로 더합니다. 평형 가지는 T로 매개화한 μ(T) = OLR(T)/[Q(1−α(T))]로 그립니다.',
    tasks: {
      tipping: {
        method: '평형 가지 연속법(continuation), 준정적 강제 sweep',
        how: 'N(T; μ) = 0인 가지를 구하고 λ의 부호로 안정성을 판정합니다. μ를 천천히 낮췄다 올리면 두 saddle-node 사이에서 hysteresis loop가 생깁니다.',
        issues: '강제 변화 속도와 이완 시간 C/λ의 비(rate-induced tipping), 알베도 함수의 형태에 대한 민감도, 위도 구조가 없어 얼음선 역학(Budyko–Sellers 1D의 small ice-cap instability)을 다루지 못함.',
      },
      variability: {
        method: 'Hasselmann형 확률 기후 모델(Ornstein–Uhlenbeck 과정)',
        how: '날씨 잡음 σ를 주면 T는 적색 잡음처럼 움직이며, 자기상관 시간은 약 C/λ입니다. 혼합층이 깊을수록 변동은 느리고 작아집니다.',
        issues: '임계점 근처에서 λ → 0이 되어 분산과 자기상관이 커지는 critical slowing down은 조기 경보 신호의 근거지만, 잡음의 성질과 짧은 기록 길이에 민감합니다.',
      },
    },
    refs: [
      { title: 'Budyko (1969) · The effect of solar radiation variations on the climate of the Earth', url: doi('10.3402/tellusa.v21i5.10109') },
      { title: 'North, Cahalan & Coakley (1981) · Energy balance climate models', url: doi('10.1029/RG019i001p00091') },
      { title: 'Hasselmann (1976) · Stochastic climate models, Part I', url: doi('10.1111/j.2153-3490.1976.tb00696.x') },
    ],
  },
  {
    id: 'stommel', name: 'Stommel 2-box 열염순환', short: 'Stommel', dim: '2', dimNote: '두 상자 사이의 온도차 T, 염분차 S',
    timeUnit: '무차원(온도 복원 시간)', view: 'branch', stepsPerFrame: 20,
    predicts: '적도–극 밀도차로 구동되는 전도순환(AMOC의 개념 모델) 세기 q와 그 쌍안정성',
    physics: '온도와 염분이 밀도에 반대로 기여, 온도의 빠른 복원과 염분의 약한 복원(η₃ < 1), 순환이 염분을 실어 나르는 salt-advection 되먹임',
    omitted: '바람 구동 순환, 회전, 대류·혼합의 공간 구조, 해빙과 대기 결합, 심층 수괴 경로',
    cost: 'O(1)',
    summary: '담수 강제 η₂를 1.22 위로 올리면 열 주도 순환(q > 0)이 saddle-node에서 사라지고 염분 주도 상태(q < 0)로 넘어갑니다. 다시 내려도 η₂ ≈ 0.91 아래까지는 돌아오지 않습니다(기본값 η₁ = 3, η₃ = 0.3 기준).',
    params: [
      { key: 'eta1', label: '열 강제 η₁', min: 1, max: 5, step: 0.1 },
      { key: 'eta2', label: '담수(염분) 강제 η₂', min: 0, max: 2, step: 0.01 },
      { key: 'eta3', label: '염분/온도 복원 시간 비 η₃', min: 0.1, max: 1, step: 0.05 },
      { key: 'sigma', label: '담수 잡음 σ', min: 0, max: 0.3, step: 0.01 },
      { key: 'start', label: '시작 가지', options: [['thermal', '열 주도 (q > 0)'], ['haline', '염분 주도 (q < 0)']] },
    ],
    equations: [
      tex`\frac{dT}{dt} = \eta_1 - T\,(1+|q|),\qquad \frac{dS}{dt} = \eta_2 - S\,(\eta_3+|q|) + \sigma\,\xi(t)`,
      tex`q = T - S \quad(\text{밀도차} \propto \text{전도순환 세기})`,
    ],
    variables: tex`$T, S$: 적도–극 상자의 무차원 온도·염분 차이. $q>0$은 극 쪽 침강(현재 AMOC와 같은 방향), $q<0$은 반대 방향의 약한 염분 주도 순환입니다. 시간은 온도 복원 시간으로 무차원화했습니다.`,
    diagnostics: [
      { name: '순환 세기 (유속 대응)', tex: tex`q = T - S`, explain: '이 모델에서 "유속"은 상자 사이의 수송 q 하나입니다. 운동에너지·enstrophy는 정의되지 않습니다.' },
      { name: '염분 수지', tex: tex`\frac{dS}{dt} = \underbrace{\eta_2}_{\text{담수 강제}} \underbrace{-\,\eta_3 S}_{\text{복원}} \underbrace{-\,|q|\,S}_{\text{이류 유출}}`, explain: '순환이 강할수록 염분 차이를 빨리 지웁니다. 담수 강제가 커져 S가 T를 따라잡으면 q가 약해지고, 이류에 의한 제거도 약해지는 양의 되먹임이 생깁니다.' },
      { name: '평형 가지', tex: tex`q = \frac{\eta_1}{1+|q|} - \frac{\eta_2}{\eta_3+|q|}`, explain: '각 q에 대해 η₂를 풀어 가지를 그립니다. 실선은 안정(Jacobian의 trace < 0, det > 0), 점선은 불안정입니다.' },
    ],
    numerics: 'RK4, Δt = 0.005. 담수 잡음은 S에만 Euler–Maruyama로 더합니다.',
    tasks: {
      tipping: {
        method: 'saddle-node 분기 분석, 담수 hosing 실험',
        how: 'η₂를 천천히 올려 열 주도 가지가 끝나는 지점을 찾고, 다시 내려 hysteresis 폭을 확인합니다. 같은 실험을 EMIC·GCM에서 반복해 임계값을 비교합니다.',
        issues: '임계값은 모델 계층마다 크게 다릅니다. 담수 강제의 공간 패턴과 salt-advection 되먹임의 세기(예: 34°S 담수 수송 지표)가 핵심 불확실성이고, 관측 기반 조기 경보·붕괴 시기 추정은 통계 가정에 민감하다는 비판이 있습니다.',
      },
      variability: {
        method: '확률 분기 모델, 체류 시간·전이 확률 분석',
        how: '쌍안정 구간에서 담수 잡음을 주면 두 상태 사이를 드물게 오갑니다. 평균 체류 시간은 잡음 세기와 퍼텐셜 장벽 높이로 정해집니다.',
        issues: '전이가 드문 사건이라 긴 적분이나 rare-event 알고리즘이 필요하고, 잡음을 어떤 변수에 어떤 상관으로 넣는지에 결과가 민감합니다.',
      },
    },
    refs: [
      { title: 'Stommel (1961) · Thermohaline convection with two stable regimes of flow', url: doi('10.3402/tellusa.v13i2.9491') },
      { title: 'Cessi (1994) · A simple box model of stochastically forced thermohaline flow', url: doi('10.1175/1520-0485(1994)024<1911:ASBMOS>2.0.CO;2') },
      { title: 'Boers (2021) · Observation-based early-warning signals for a collapse of the AMOC', url: doi('10.1038/s41558-021-01097-4') },
      { title: 'Ditlevsen & Ditlevsen (2023) · Warning of a forthcoming collapse of the AMOC', url: doi('10.1038/s41467-023-39810-w') },
    ],
  },
  {
    id: 'enso', name: 'ENSO recharge oscillator', short: 'ENSO RO', dim: '2', dimNote: '동태평양 SST 이상 T, 서태평양 수온약층 깊이 h',
    timeUnit: '개월', view: 'phase', stepsPerFrame: 10,
    predicts: '동태평양 SST 이상(Niño 지수 근사)과 적도 수온약층의 충전·방전 순환',
    physics: 'Bjerknes 양의 되먹임(R), 수온약층 recharge/discharge, 감쇠, 대기 잡음(서풍 폭발 등), 계절 변조',
    omitted: '적도 Kelvin·Rossby 파동의 공간 구조, El Niño/La Niña 비대칭, EP/CP 다양성, 비선형성, 배경 상태 변화',
    cost: 'O(1)',
    summary: 'T가 오르면 바람이 열을 적도 밖으로 내보내 h가 줄고(방전), 줄어든 h가 다시 T를 낮춥니다. R(t)의 계절 변조가 봄철 예측 장벽과 겨울 정점을 만듭니다.',
    params: [
      { key: 'R0', label: '평균 성장률 R₀ (월⁻¹)', min: -0.1, max: 0.05, step: 0.005 },
      { key: 'R1', label: '계절 변조 R₁ (월⁻¹)', min: 0, max: 0.08, step: 0.005 },
      { key: 'period', label: '고유 주기 2π/ω (개월)', min: 24, max: 72, step: 1 },
      { key: 'r', label: '수온약층 감쇠 r (월⁻¹)', min: 0, max: 0.1, step: 0.005 },
      { key: 'sigma', label: '대기 잡음 σ', min: 0, max: 0.4, step: 0.01 },
    ],
    equations: [
      tex`\frac{dT}{dt} = R(t)\,T + \omega\,h + \sigma\,\xi(t),\qquad \frac{dh}{dt} = -r\,h - \omega\,T`,
      tex`R(t) = R_0 + R_1\cos\!\left(\frac{2\pi t}{12}\right)`,
    ],
    variables: tex`$T$: 동태평양 SST 이상(K), $h$: 서태평양 수온약층 깊이 이상(같은 척도로 정규화), $t$: 개월. 결합 계수를 $\alpha=\gamma=\omega$로 두어 Jin(1997)의 형태를 단순화했습니다.`,
    diagnostics: [
      { name: '이차 에너지', tex: tex`E = \frac{\omega}{2}\,(T^2 + h^2)`, explain: 'R = r = σ = 0이면 정확히 보존되는 이차 형식입니다. 위상 평면에서 원 궤도의 반지름에 해당합니다. 유체 운동에너지가 아니며 enstrophy·유속은 정의되지 않습니다.' },
      { name: '수지', tex: tex`\frac{dE}{dt} = \underbrace{\omega R(t)\,T^2}_{\text{Bjerknes 되먹임}} \underbrace{-\,\omega r\,h^2}_{\text{수온약층 감쇠}} + \underbrace{\omega\,\sigma T\xi + \tfrac{\omega}{2}\sigma^2}_{\text{잡음 일}}`, explain: 'R < 0이면 결정론적으로 감쇠하는 진동자이고, 변동은 잡음이 유지합니다. 계절에 따라 R이 양수가 되는 달에는 에너지가 자랍니다.' },
    ],
    numerics: 'RK4, Δt = 0.1개월. 잡음은 T에만 Euler–Maruyama로 더하고, 잡음이 바꾼 E를 따로 누적해 수지에 표시합니다.',
    tasks: {
      predict: {
        method: '동역학 모델 앙상블 예보, 선형 역모델(LIM), 통계·딥러닝 모델',
        how: '현재의 (T, h)와 달(月)에서 출발해 잡음 앙상블로 확률 예보를 만듭니다. h(열 함량)는 T보다 앞서므로 예측 인자로 중요합니다.',
        issues: '봄철 예측 장벽(R의 계절 변조로 봄에 신호 대 잡음비가 낮음), 결정론 대 잡음 비율(R의 부호), 수온약층 관측(TAO/Argo)의 지속성.',
      },
      variability: {
        method: '확률 감쇠 진동자, 스펙트럼·계절별 분산 분석',
        how: '잡음 강제 감쇠 진동자는 2–7년대의 넓은 스펙트럼 봉우리를 만듭니다. 계절 변조는 겨울철 정점(위상 고정)을 만듭니다.',
        issues: '비대칭(강한 El Niño, 긴 La Niña)과 다양성은 선형 모델로 설명할 수 없고, 잡음의 상태 의존성(곱셈 잡음)이 중요할 수 있습니다.',
      },
      ml: {
        method: 'CNN·RNN 등 데이터 기반 예보',
        how: '과거 SST·열 함량 지도로 학습해 수개월–1년 이상 앞의 Niño 지수를 예측합니다.',
        issues: '관측 표본(수십 개 사건)이 적어 기후 모델 출력으로 사전 학습하고, 과적합과 계절별 검증에 주의해야 합니다.',
      },
    },
    refs: [
      { title: 'Jin (1997) · An equatorial ocean recharge paradigm for ENSO, Part I', url: doi('10.1175/1520-0469(1997)054<0811:AEORPF>2.0.CO;2') },
      { title: 'Burgers, Jin & van Oldenborgh (2005) · The simplest ENSO recharge oscillator', url: doi('10.1029/2005GL022951') },
      { title: 'Penland & Sardeshmukh (1995) · The optimal growth of tropical SST anomalies', url: doi('10.1175/1520-0442(1995)008<1999:TOGOTS>2.0.CO;2') },
      { title: 'Ham, Kim & Luo (2019) · Deep learning for multi-year ENSO forecasts', url: doi('10.1038/s41586-019-1559-7') },
    ],
  },
  {
    id: 'l63', name: 'Lorenz-63', short: 'L63', dim: '3', dimNote: '대류 롤의 세 Fourier 진폭 x, y, z',
    timeUnit: '무차원', view: 'phase', stepsPerFrame: 6, twin: true,
    predicts: 'Rayleigh–Bénard 대류를 세 모드로 절단한 모델. 예측 대상보다는 혼돈과 예측가능성의 원형',
    physics: '부력 강제(ρ), 점성·열 확산에 의한 감쇠, 에너지를 보존하며 모드를 섞는 비선형 이류',
    omitted: '고차 공간 모드 전부. 3모드 절단은 정량적인 대류 모델이 아닙니다.',
    cost: 'O(1)',
    summary: '두 궤적을 10⁻⁶만큼 다르게 시작하면 오차가 exp(λ₁t)로 자라 결국 끌개 크기로 포화합니다. 예측 한계는 대략 ln(Δ/δ₀)/λ₁입니다.',
    params: [
      { key: 'sigma', label: 'Prandtl 수 σ', min: 1, max: 20, step: 0.5 },
      { key: 'rho', label: 'Rayleigh 수 비 ρ', min: 0, max: 50, step: 0.5 },
      { key: 'beta', label: '기하 인자 β', min: 0.5, max: 4, step: 0.05 },
    ],
    equations: [tex`\dot x = \sigma(y-x),\qquad \dot y = x(\rho - z) - y,\qquad \dot z = xy - \beta z`],
    variables: tex`$x$: 대류 세기, $y$: 상승·하강류의 온도차, $z$: 수직 온도 분포의 선형에서 벗어난 정도. 고전적 혼돈 매개변수는 $\sigma=10,\ \rho=28,\ \beta=8/3$입니다.`,
    diagnostics: [
      { name: '에너지 대응량', tex: tex`E = \tfrac12(x^2+y^2+z^2)`, explain: '비선형 항(xz, xy)은 E를 보존하지 않지만, 아래의 이동된 양 V는 감쇠와 강제로만 바뀝니다.' },
      { name: '흡수 집합 수지', tex: tex`V = \tfrac12\left[x^2+y^2+(z-\sigma-\rho)^2\right],\qquad \frac{dV}{dt} = \underbrace{-\sigma x^2 - y^2 - \beta z^2}_{\text{감쇠}} + \underbrace{\beta(\sigma+\rho)\,z}_{\text{강제}}`, explain: 'V가 크면 감쇠가 이겨 궤적이 유계 영역으로 들어옵니다. 끌개가 유한한 이유입니다.' },
      { name: '위상 공간 수축률', tex: tex`\nabla\cdot\mathbf f = -(\sigma + 1 + \beta)`, explain: '위상 공간 부피가 exp(−(σ+1+β)t)로 줄어 끌개의 부피는 0이고, 프랙탈 차원(≈2.06)을 가집니다.' },
      { name: '위상 속도와 최대 Lyapunov 지수', tex: tex`|\dot{\mathbf x}|,\qquad \lambda_1 = \lim_{t\to\infty}\frac1t\ln\frac{|\delta(t)|}{|\delta_0|}`, explain: '"최대 유속" 자리에는 위상 공간 속도를 표시합니다. λ₁은 재규격화한 쌍둥이 궤적으로 추정합니다(고전 매개변수에서 약 0.91).' },
    ],
    numerics: 'RK4, Δt = 0.005. 쌍둥이 궤적 두 개를 함께 적분합니다. 하나는 자유롭게 두어 오차 성장을 보고, 다른 하나는 매 스텝 δ₀로 재규격화해 λ₁을 추정합니다(Benettin 방법).',
    tasks: {
      predict: {
        method: '쌍둥이(twin) 실험, Lyapunov 지수, 앙상블 예보',
        how: '초기 오차 δ₀의 성장을 추적해 예측 한계 시간을 구하고, 앙상블 퍼짐이 오차를 잘 대변하는지 봅니다.',
        issues: '예측가능성은 끌개 위치에 따라 크게 다르며(날개 전환 직전이 어려움), 모델 오차와 초기 오차를 구분해야 합니다.',
      },
      da: {
        method: 'EnKF, 4D-Var, particle filter의 표준 시험대',
        how: '참 궤적에 잡음을 섞은 관측을 만들고, 관측 간격·잡음·앙상블 크기를 바꾸며 추정 오차를 비교합니다.',
        issues: '관측 간격이 길면 비선형성이 커져 가우시안 가정이 깨지고, 필터가 날개 전환을 놓치기 쉽습니다.',
      },
      ml: {
        method: 'Reservoir computing(ESN), SINDy, neural ODE',
        how: '궤적 시계열로 학습한 뒤 자율적으로 예측하고, 유효 예측 시간을 Lyapunov 시간(1/λ₁) 단위로 보고합니다.',
        issues: '짧은 궤적 예측보다 장기 통계(끌개 모양, 기후) 재현과 자율 실행 안정성이 더 엄격한 기준입니다.',
      },
    },
    refs: [
      { title: 'Lorenz (1963) · Deterministic nonperiodic flow', url: doi('10.1175/1520-0469(1963)020<0130:DNF>2.0.CO;2') },
      { title: 'Miller, Ghil & Gauthiez (1994) · Advanced data assimilation in strongly nonlinear dynamical systems', url: doi('10.1175/1520-0469(1994)051<1037:ADAISN>2.0.CO;2') },
      { title: 'Brunton, Proctor & Kutz (2016) · Discovering governing equations from data (SINDy)', url: doi('10.1073/pnas.1517384113') },
    ],
  },
  {
    id: 'l96', name: 'Lorenz-96', short: 'L96', dim: 'N', dimNote: '위도원 위 N개 격자의 추상 변수 xᵢ',
    timeUnit: '무차원 (1 ≈ 5일)', view: 'hovmoller', stepsPerFrame: 3, hovEvery: 3, twin: true,
    predicts: '위도원을 따라 놓인 대기 변수의 추상화. 실제 방정식이 아닌 자료동화·파라미터화의 시험대',
    physics: '에너지를 보존하는 이류형 비선형 항, 선형 감쇠, 상수 강제 F',
    omitted: '실제 역학·열역학 전부. 공간 구조는 순환 대칭인 1차원 고리뿐입니다.',
    cost: 'O(N)',
    summary: 'F가 커지면 정상 상태 → 진행파 → 혼돈으로 바뀝니다. Hovmöller에서 서쪽으로 진행하는 파동 묶음과 그 위의 혼돈을 볼 수 있습니다.',
    params: [
      { key: 'n', label: '변수 개수 N', min: 8, max: 80, step: 4 },
      { key: 'F', label: '강제 F', min: 0, max: 16, step: 0.5 },
    ],
    equations: [tex`\frac{dx_i}{dt} = (x_{i+1} - x_{i-2})\,x_{i-1} - x_i + F,\qquad i = 1,\dots,N\ (\text{주기})`],
    variables: tex`$x_i$: 위도원 위 $i$번째 지점의 대기 변수. Lorenz(1996)는 시간 1을 약 5일로 해석했습니다. 고전적 설정은 $N=40,\ F=8$입니다.`,
    diagnostics: [
      { name: '에너지', tex: tex`E = \frac{1}{2N}\sum_i x_i^2`, explain: '이 시스템의 "에너지"입니다. 이류 항은 합하면 정확히 0이 되어 E를 바꾸지 않습니다.' },
      { name: '에너지 수지', tex: tex`\frac{dE}{dt} = \underbrace{\frac{F}{N}\sum_i x_i}_{\text{강제}} \underbrace{-\,\frac1N\sum_i x_i^2}_{\text{감쇠}} + \underbrace{\frac1N\sum_i x_i x_{i-1}(x_{i+1}-x_{i-2})}_{\text{이류}\ =\ 0}`, explain: '그래프에서 이류 항이 반올림 오차 수준으로 0에 머무는지 확인할 수 있습니다. 강제와 감쇠가 평균적으로 균형을 이룹니다.' },
      { name: '최대 |xᵢ|와 λ₁', tex: tex`\max_i |x_i|,\qquad \lambda_1`, explain: 'N=40, F=8에서 λ₁ ≈ 1.7이고, 양의 Lyapunov 지수가 십여 개 있습니다. 오차 두 배 시간은 약 0.4(≈ 2일)입니다.' },
    ],
    numerics: 'RK4, Δt = 0.01. L63과 같은 방식으로 쌍둥이 궤적 두 개를 함께 적분합니다.',
    tasks: {
      da: {
        method: 'EnKF + 공분산 localization·inflation, 4D-Var, particle filter',
        how: '일부 격자만 관측하는 OSSE로 앙상블 크기, 관측 밀도·주기, localization 반경을 바꾸며 분석 오차를 비교합니다.',
        issues: '앙상블 크기가 불안정 차원보다 작으면 표본 공분산의 rank가 부족해 localization이 필요하고, inflation 조절이 중요합니다. Particle filter는 차원이 커지면 가중치가 붕괴합니다.',
      },
      param: {
        method: '두 규모 L96에서의 결정론·확률 파라미터화, ML closure',
        how: '빠른 소규모 변수 Y의 효과를 큰 규모 X의 함수로 근사하고, 축소 모델의 예보와 기후 통계를 비교합니다.',
        issues: '결정론적 closure는 변동성을 과소평가하기 쉬워 확률·시간 상관 잡음이 도움이 됩니다. Offline 정확도가 online 안정성을 보장하지 않습니다.',
      },
      ml: {
        method: '병렬(국소) reservoir computing, 신경망 emulator',
        how: '국소 상호작용을 이용해 격자마다 작은 모델을 두고 이웃 정보를 넣어 학습합니다.',
        issues: '차원이 커질수록 학습 데이터와 모델 크기가 늘어나므로 국소성을 활용해야 하고, 장기 통계 재현을 따로 검증해야 합니다.',
      },
      predict: {
        method: 'Lyapunov 스펙트럼, 앙상블 예보',
        how: 'N이 커지면 불안정 방향 수도 비례해 늘어납니다(extensive chaos).',
        issues: '오차 성장은 가장 불안정한 방향에 집중되어, 앙상블을 그 방향으로 배치하는 방법(bred vector, singular vector)이 효율적입니다.',
      },
    },
    refs: [
      { title: 'Lorenz & Emanuel (1998) · Optimal sites for supplementary weather observations', url: doi('10.1175/1520-0469(1998)055<0399:OSFSWO>2.0.CO;2') },
      { title: 'Evensen (1994) · Sequential data assimilation with a nonlinear QG model (EnKF)', url: doi('10.1029/94JC00572') },
      { title: 'Snyder et al. (2008) · Obstacles to high-dimensional particle filtering', url: doi('10.1175/2008MWR2529.1') },
      { title: 'Arnold, Moroz & Palmer (2013) · Stochastic parametrizations and model uncertainty in L96', url: doi('10.1098/rsta.2011.0479') },
    ],
  },
  {
    id: 'ks', name: 'Kuramoto–Sivashinsky', short: 'KS', dim: 'n', dimNote: '길이 L 주기 영역 위 n개 격자의 u(x)',
    timeUnit: '무차원', view: 'hovmoller', stepsPerFrame: 2, hovEvery: 1, twin: true,
    predicts: '불안정한 화염면·박막 흐름의 원형 PDE. 기후 모델은 아니지만, 시공간 혼돈을 다루는 데이터 기반 예측의 표준 벤치마크',
    physics: '장파 불안정(음의 확산 −u_xx), 단파 안정화(−u_xxxx), 에너지를 재분배하는 비선형 이류',
    omitted: '회전·성층 등 지구유체 물리 전부',
    cost: 'O(n log n)',
    summary: 'L이 클수록 독립된 "셀"이 많아져 혼돈의 차원이 L에 비례해 늘어납니다. L = 22는 작은 혼돈 영역의 표준 설정입니다.',
    params: [
      { key: 'L', label: '영역 길이 L', min: 12, max: 100, step: 1 },
      { key: 'n', label: '격자 수 n', options: [[64, '64'], [128, '128']] },
    ],
    equations: [tex`\partial_t u + u\,\partial_x u + \partial_x^2 u + \partial_x^4 u = 0,\qquad x\in[0,L)\ (\text{주기})`],
    variables: tex`$u(x,t)$: 경계면의 기울기(또는 높이 변동)에 해당하는 스칼라 장. 선형 성장률은 $k^2 - k^4$로, $0<k<1$인 파동만 불안정합니다.`,
    diagnostics: [
      { name: '에너지', tex: tex`E = \tfrac12\langle u^2\rangle`, explain: '공간 평균 제곱입니다. ⟨·⟩는 영역 평균입니다.' },
      { name: '에너지 수지', tex: tex`\frac{dE}{dt} = \underbrace{\langle u_x^2\rangle}_{\text{장파 생성}} \underbrace{-\,\langle u_{xx}^2\rangle}_{\text{초확산 소산}},\qquad \langle u^2 u_x\rangle = 0`, explain: '음의 확산이 큰 규모에서 에너지를 만들고, 4차 항이 작은 규모에서 없앱니다. 비선형 항은 에너지를 규모 사이로 옮길 뿐 총량은 바꾸지 않습니다.' },
      { name: 'Enstrophy 대응량', tex: tex`Z = \tfrac12\langle u_x^2\rangle`, explain: '기울기 제곱의 평균으로, 에너지 생성 항의 절반과 같습니다. 2D 유체의 enstrophy처럼 작은 규모 활동의 지표입니다.' },
      { name: '최대 |u|, 평균 보존, λ₁', tex: tex`\max_x|u|,\qquad \frac{d}{dt}\langle u\rangle = 0,\qquad \lambda_1`, explain: 'L = 22에서 λ₁ ≈ 0.043입니다. ⟨u⟩는 정확히 보존되므로 0에 머물러야 합니다.' },
    ],
    numerics: '의사 스펙트럼 ETDRK4(Kassam & Trefethen 2005), Δt = 0.25, 2/3 dealiasing. 실수장의 켤레 대칭을 매 스텝 투영해 반올림 오차가 불안정 모드로 자라지 않게 합니다.',
    tasks: {
      ml: {
        method: 'Reservoir computing(병렬 ESN), LSTM, neural operator',
        how: 'u(x, t) 시계열로 학습한 뒤 자율 예측하고, 유효 예측 시간을 Lyapunov 시간 단위로 비교합니다. 큰 L에서는 공간을 나눈 병렬 모델이 쓰입니다.',
        issues: '짧은 예측 정확도와 장기 통계(파워 스펙트럼, Lyapunov 스펙트럼) 재현은 다른 문제이며, 관측 잡음과 학습 길이에 민감합니다.',
      },
      predict: {
        method: 'Lyapunov 스펙트럼, 끌개 차원, 쌍둥이 실험',
        how: 'L을 늘리며 양의 지수 개수와 Kaplan–Yorke 차원이 L에 비례하는지 확인합니다.',
        issues: '고차원 혼돈에서는 오차가 국소적으로 자라고 퍼지므로, 전역 λ₁ 하나로 예측가능성을 다 설명하지 못합니다.',
      },
      da: {
        method: '시공간 혼돈용 EnKF + localization',
        how: '일부 지점만 관측하며 추정 오차를 비교합니다.',
        issues: '관측 간격과 공간 밀도가 불안정 셀 규모(약 2π√2)에 비해 충분해야 합니다.',
      },
    },
    refs: [
      { title: 'Kassam & Trefethen (2005) · Fourth-order time-stepping for stiff PDEs (ETDRK4)', url: doi('10.1137/S1064827502410633') },
      { title: 'Pathak et al. (2018) · Model-free prediction of large spatiotemporally chaotic systems', url: doi('10.1103/PhysRevLett.120.024102') },
    ],
  },
  {
    id: 'qg2', name: '2층 준지균(QG) 경압 모델', short: '2-layer QG', dim: '2n²', dimNote: '두 층의 PV 장 q₁, q₂ (각 n × n)',
    timeUnit: '무차원', view: 'field', stepsPerFrame: 4,
    predicts: '평균 경압 전단에서 에너지를 빼내 자라고 포화하는 중위도 해양·대기 mesoscale eddy',
    physics: '회전(지균 균형), 두 층 성층(변형반경 L_d), β 효과, 평균 전단 U(평균 APE 저장소), 바닥 마찰',
    omitted: '비지균 운동과 중력파, 연속 성층(두 층 근사), 지형, 해안 경계, 열·염 강제',
    cost: 'O(n² log n)',
    summary: '하층 평균 PV 기울기 β − k_d²U가 상층과 부호가 다르면 경압 불안정이 생깁니다. Eddy는 평균 흐름의 위치 에너지를 eddy 에너지로 바꾸고, 바닥 마찰과 작은 규모 필터가 이를 소산합니다.',
    params: [
      { key: 'n', label: '격자 n × n', options: [[32, '32 × 32'], [64, '64 × 64'], [128, '128 × 128']] },
      { key: 'U', label: '평균 전단 U (상층 +U, 하층 −U)', min: 0, max: 0.3, step: 0.01 },
      { key: 'kd', label: '변형 파수 k_d = 1/L_d', min: 2, max: 12, step: 0.5 },
      { key: 'beta', label: 'β', min: 0, max: 6, step: 0.1 },
      { key: 'drag', label: '바닥 마찰 r', min: 0.02, max: 1, step: 0.01 },
    ],
    fields: [['q1', '상층 PV 이상 q₁'], ['psi1', '상층 유선함수 ψ₁'], ['zeta1', '상층 와도 ζ₁'], ['bc', '경압 유선함수 (ψ₁ − ψ₂)/2']],
    equations: [
      tex`\partial_t q_j + U_j\,\partial_x q_j + J(\psi_j, q_j) + Q_{y,j}\,\partial_x \psi_j = -\delta_{j2}\, r\,\nabla^2\psi_2 + \text{filter}`,
      tex`q_1 = \nabla^2\psi_1 + F(\psi_2-\psi_1),\quad q_2 = \nabla^2\psi_2 + F(\psi_1-\psi_2),\quad F = \tfrac{k_d^2}{2}`,
      tex`Q_{y,1} = \beta + k_d^2 U,\qquad Q_{y,2} = \beta - k_d^2 U,\qquad U_1 = U,\ U_2 = -U`,
    ],
    variables: tex`$\psi_j$: 층 $j$의 섭동 유선함수, $q_j$: 섭동 PV, $U_j$: 고정된 평균 동서류, $k_d$: 경압 변형 파수. 두 층의 깊이는 같고 영역은 $[0,2\pi]^2$ 이중 주기입니다.`,
    diagnostics: [
      { name: '에너지 (KE + APE)', tex: tex`E = \underbrace{\tfrac12\langle|\nabla\psi_1|^2 + |\nabla\psi_2|^2\rangle}_{\text{KE}} + \underbrace{\tfrac{F}{2}\langle(\psi_1-\psi_2)^2\rangle}_{\text{APE}}`, explain: '경계면이 기울어진 만큼의 위치 에너지(APE)와 운동에너지의 합입니다. 평균 흐름 자체의 에너지는 고정되어 있어 포함하지 않습니다.' },
      { name: '에너지 수지', tex: tex`\frac{dE}{dt} = \underbrace{-\sum_j \langle \psi_j\, U_j\,\partial_x q_j\rangle}_{\text{평균류 변환 }P} \underbrace{-\,r\langle|\nabla\psi_2|^2\rangle}_{\text{바닥 마찰}} + \underbrace{D_\text{filter}}_{\text{작은 규모 필터}}`, explain: 'P > 0이면 eddy가 평균 전단에서 에너지를 얻고 있습니다(경압 변환). β 항과 dealiasing한 Jacobian은 에너지를 바꾸지 않습니다. 남는 잔차는 시간 적분 오차입니다.' },
      { name: 'Enstrophy', tex: tex`Z = \tfrac12\langle q_1^2 + q_2^2\rangle`, explain: '섭동 PV의 제곱 평균입니다. 평균 PV 기울기와의 교환 때문에 보존되지 않으며, 작은 규모 필터가 대부분을 소산합니다.' },
      { name: '최대 유속과 불안정 조건', tex: tex`\max|\mathbf u_j + U_j\hat{\mathbf x}|,\qquad \text{불안정 필요조건: } \beta < k_d^2\,U`, explain: '두 층의 평균 PV 기울기 부호가 다르면(Charney–Stern 조건) 경압 불안정이 가능합니다. β가 k_d²U보다 크면 섭동이 자라지 않습니다.' },
    ],
    numerics: '의사 스펙트럼, 2/3 dealiasing, SSP-RK3, CFL 제한 Δt. pyqg와 같은 지수형 스펙트럼 필터로 격자 규모 enstrophy를 제거하고, 필터가 없앤 에너지를 따로 측정합니다.',
    tasks: {
      param: {
        method: 'Eddy 파라미터화(Gent–McWilliams), backscatter, ML subgrid closure',
        how: '고해상도 QG를 "참값"으로 두고, 저해상도에서 필요한 eddy PV·운동량 플럭스를 진단하거나 학습합니다.',
        issues: 'Eddy와 평균 흐름 사이의 에너지 교환 방향(backscatter), 마찰·필터 선택에 따른 평형 에너지의 민감도, offline 학습과 online 결합 안정성의 차이.',
      },
      da: {
        method: 'OSSE, EnKF로 해수면 높이(altimetry) 유사 관측 동화',
        how: '참 실행에서 ψ를 성기게 관측해 eddy 위치·세기를 추정합니다.',
        issues: '관측 해상도가 L_d 규모의 eddy를 해상하는지, 관측 간격 동안의 비선형 성장, 하층 상태의 관측 부족.',
      },
      ml: {
        method: '신경망 emulator, 데이터 기반 subgrid 모델',
        how: '스냅샷이나 짧은 궤적으로 학습해 시간 진행을 대신하거나 저해상도 모델을 보정합니다.',
        issues: '에너지·enstrophy 수지와 스펙트럼을 지키는지, 장기 실행에서 불안정해지지 않는지가 핵심 검증 대상입니다.',
      },
      predict: {
        method: '쌍둥이 실험, 앙상블',
        how: '같은 평균 상태에서 조금 다른 eddy 장으로 시작해 오차 성장을 봅니다.',
        issues: '개별 eddy의 결정론적 예측은 유한한 시간으로 제한되고, 오차는 작은 규모에서 큰 규모로 번집니다.',
      },
    },
    refs: [
      { title: 'Phillips (1954) · Energy transformations and meridional circulations associated with simple baroclinic waves', url: doi('10.3402/tellusa.v6i3.8734') },
      { title: 'Arbic & Flierl (2004) · Baroclinically unstable geostrophic turbulence and bottom Ekman friction', url: doi('10.1175/1520-0485(2004)034<2257:BUGTIT>2.0.CO;2') },
      { title: 'Gent & McWilliams (1990) · Isopycnal mixing in ocean circulation models', url: doi('10.1175/1520-0485(1990)020<0150:IMIOCM>2.0.CO;2') },
      { title: 'Zanna & Bolton (2020) · Data-driven equation discovery of ocean mesoscale closures', url: doi('10.1029/2020GL088376') },
      { title: 'pyqg documentation · two-layer model and spectral filter', url: 'https://pyqg.readthedocs.io/' },
    ],
  },
];

// Rows of the ladder table that point outside this page.
export const ladderTail = [
  { name: 'Ocean PDE Lab: 2D NS · 1층 QG · SWE', dim: 'n² – 3n²', predicts: '단일층 와류·Rossby 파동·자유수면 조정', physics: '회전, 이류, (SWE) 중력파', cost: 'O(n²) – O(n² log n)', link: '/lab/ocean-pde/' },
  { name: '현실 해양·기후 모델 (OGCM / ESM)', dim: '10⁷ – 10⁹', predicts: '실제 해역의 순환, 수온·염분, 해빙, 탄소 순환', physics: 'Primitive equations, 연속 성층, 지형·해안, 대기·해빙 결합, 혼합·eddy 파라미터화', cost: '슈퍼컴퓨터 규모' },
];

export const overviewRefs = [
  { title: 'Held (2005) · The gap between simulation and understanding in climate modeling', url: doi('10.1175/BAMS-86-11-1609') },
  { title: 'Ghil & Lucarini (2020) · The physics of climate variability and climate change', url: doi('10.1103/RevModPhys.92.035002') },
];
