export const sources = [
  {id:'swe', title:'USACE · Shallow Water Equations', url:'https://www.hec.usace.army.mil/confluence/rasdocs/hecras/latest/technical-reference/hydraulic-equations/shallow-water-equations', note:'수심 평균 연속·운동량 방정식과 정수압 가정. 해양 적용에는 회전·경계 강제력 등을 별도로 구성한다.'},
  {id:'qg', title:'MIT OCW · Quasi-balanced circulations', url:'https://ocw.mit.edu/courses/12-803-quasi-balanced-circulations-in-oceans-and-atmospheres-fall-2009/pages/lecture-notes/', note:'Lecture 7–9: shallow-water PV, 준지균 근사와 PV 역산.'},
  {id:'layer', title:'Thiry et al. (2024) · QG and rotating shallow-water', url:'https://arxiv.org/abs/2403.10199', note:'다층 RSW와 QG의 관계. 이 탐색기는 표준 PV 형태의 단일 활성층 QG를 사용한다.'},
  {id:'pe', title:'MITgcm · Hydrostatic and non-hydrostatic forms', url:'https://mitgcm.readthedocs.io/en/latest/overview/hydrostatic.html', note:'수직 운동량 근사, hydrostatic pressure와 비정수압 3D 압력 문제의 차이.'},
  {id:'algorithm', title:'MITgcm · Discretization and algorithm', url:'https://mitgcm.readthedocs.io/en/latest/algorithm/algorithm.html', note:'예측·진단 변수, 자유수면, 시간 적분과 압력 해법. 비용 설명의 근거.'},
  {id:'ns', title:'Alexakis & Doering (2006) · 2D turbulence', url:'https://arxiv.org/abs/physics/0605090', note:'점성·강제력이 있는 2D 난류에서 에너지와 enstrophy의 소산. 보존은 무점성 극한과 구분해야 한다.'}
];

export const models = [
  {
    id:'qg', name:'Quasi-geostrophic', short:'QG', korean:'준지균 모델', number:'01', color:'#5b75d6', dimension:'단일 활성층 · 수평 2D', levels:'활성층 1개', cost:1,
    tagline:'빠른 파동을 걸러내고, 느린 소용돌이에 집중합니다.',
    capabilities:[], prognostic:'잠재와도 q(x,y). 유선함수 ψ와 수평 속도는 타원형 역산으로 진단.',
    assumptions:'작은 Rossby 수, 선도차수 지균 균형, 중위도 f₀ ≠ 0. 여기서는 단일 활성층의 1.5층 QG를 비교한다.',
    conservation:'무강제·무마찰, 적절한 경계에서 QG 에너지와 잠재 enstrophy, 물질을 따르는 q 보존.',
    scale:'중위도의 균형 소용돌이·Rossby 파동. 흔히 수십–수백 km, 수일–수개월. 고정된 적용 경계가 아니다.',
    time:'느린 이류 L/U와 Rossby 파동. 표면·내부 관성중력파는 필터링된다.',
    compute:'PV 이류 + 2D Helmholtz/Poisson 역산. 단일층 기준 상태가 작고 빠른 중력파 제약이 없다. 역산·격자에 따라 NS보다 비쌀 수도 있다.',
    problems:'균형 mesoscale eddy, 제트·쌍환류의 이상화 실험, 저비용 장기 통계·예측 벤치마크.',
    limits:'조석·폭풍해일·중력파를 직접 예측하지 않는다. 적도, 큰 Ro, 강한 비지균 운동에는 부적합.',
    needs:'PV 또는 역산 가능한 초기장, 변형반경 Lᴅ, f₀·β, 경계조건, 바람/마찰 등 강제력.',
    equations:[
      '∂<sub>t</sub>q + J(ψ, q) = F − D',
      'q = ∇<sub>h</sub>²ψ − ψ/L<sub>D</sub>² + βy',
      'u = −∂<sub>y</sub>ψ, &nbsp; v = ∂<sub>x</sub>ψ'
    ], eqnote:'평저 단일 활성층 예시. J(a,b)=aₓbᵧ−aᵧbₓ. Lᴅ→∞이면 barotropic QG. 다층 QG는 이 버전의 범위 밖이다.',
    refs:['qg','layer'], features:['회전·균형','PV 역산','중력파 필터'], mapType:'balanced'
  },
  {
    id:'swe', name:'Shallow-water', short:'SWE', korean:'단층 천수 방정식', number:'02', color:'#168e83', dimension:'수심 평균 · 수평 2D', levels:'수직층 없음', cost:2,
    tagline:'자유수면과 수심 평균 해류를 함께 예측합니다.',
    capabilities:['surface'], prognostic:'층 두께 h=H+η, 수심 평균 속도 ū,v̄. 보존형에서는 h와 수송량 hū,hv̄.',
    assumptions:'균질 단일층, 정수압, 수평 규모가 수심보다 큼. 수직 속도 구조는 평균·폐쇄항으로 대신한다.',
    conservation:'무강제·무마찰, 고정 바닥·적절한 경계에서 물의 질량과 총 기계에너지. q=(ζ+f)/h의 물질 보존.',
    scale:'장파 조건 λ ≫ H. 연안·대륙붕·해역 규모의 수위와 순압류. 분–수일 예시는 문제 크기에 따라 달라진다.',
    time:'이류 L/U, 관성 시간, 외부 중력파 L/√(gH). 명시적 해법은 빠른 외부파 CFL에 제약된다.',
    compute:'격자당 h,u,v 3개 장. 국소 flux 계산은 대체로 O(Nₕ); 작은 파동 시간 간격 또는 implicit/split 방식의 추가 해법이 필요.',
    problems:'조석·폭풍해일, 해협의 수심 평균 수송, 장파 전파. 해일은 장파 구간에 한하며 쇄파는 별도 처리.',
    limits:'연속 수온·염분과 수직 전단, 밀도 성층·내부파를 단일층으로 표현하지 못한다. 짧은 분산파에도 한계.',
    needs:'수심 H(x,y), 초기 수위·유속, 개방 경계 조석, 바람·기압, 바닥 마찰. 범람은 wetting/drying 구현 필요.',
    equations:[
      '∂<sub>t</sub>h + ∇<sub>h</sub>·(h u) = 0',
      '∂<sub>t</sub>u + (u·∇<sub>h</sub>)u + f k×u = −g∇<sub>h</sub>η + F',
      'h = H + η'
    ], eqnote:'u=(ū,v̄), H는 고정 수심, η는 기준면 위 수위. F는 바람·마찰·혼합 등. 물 공급/유출은 첫 식에 별도 추가한다.',
    refs:['swe','qg'], features:['자유수면','순압류','중력파'], mapType:'surface'
  },
  {
    id:'layer', name:'Layered shallow-water', short:'Layered SW', korean:'다층 천수 방정식', number:'03', color:'#287ea9', dimension:'수평 2D × 유한층', levels:'유한 K개 층', cost:3,
    tagline:'밀도 층 사이의 움직임을, 간결한 수직 구조로.',
    capabilities:['surface','stratification'], prognostic:'각 층의 hᵢ,uᵢ,vᵢ. 계면 높이는 층 두께에서 얻고, 층 밀도 ρᵢ는 여기서는 고정.',
    assumptions:'층별 균질 밀도·수심 평균 속도, 정수압, 층간 압력 결합. 여기서는 자유수면과 비혼합 층을 둔다.',
    conservation:'무강제·무마찰·무연행, 적절한 경계에서 각 층 질량, 총 기계에너지와 층별 PV qᵢ=(ζᵢ+f)/hᵢ.',
    scale:'긴 내부파·계면 변위와 경압 불안정. 수 km–수백 km와 수시간–수개월의 이상화 예시; 파장/층 두께를 확인.',
    time:'외부 중력파와 더 느린 내부 모드, 이류. 빠른 외부파 처리는 여전히 필요하다.',
    compute:'대략 3K개 장, 국소 계산 O(KNₕ). 층간 결합·external mode 처리 비용이 추가된다. K가 커지면 장점이 감소.',
    problems:'상층·심층 교환, thermocline 계면 운동, 내부 장파, 경압 소용돌이의 이상화 예측.',
    limits:'연속 T/S 프로파일·세밀한 혼합을 그대로 예측하지 않는다. 내부파 쇄파·강한 수직가속도에는 비정수압 필요.',
    needs:'층 밀도·층수, 초기 두께·유속, 층간 압력식, 경계·마찰. 층 소멸·연행 여부는 구현에서 결정.',
    equations:[
      '∂<sub>t</sub>h<sub>i</sub> + ∇<sub>h</sub>·(h<sub>i</sub> u<sub>i</sub>) = 0',
      'D<sub>i</sub>u<sub>i</sub>/Dt + f k×u<sub>i</sub> = −∇<sub>h</sub>Φ<sub>i</sub> + F<sub>i</sub>',
      'Φ<sub>i</sub> = Φ<sub>i</sub>(η, h₁, …, h<sub>K</sub>; ρ₁, …, ρ<sub>K</sub>)'
    ], eqnote:'Dᵢ/Dt=∂t+uᵢ·∇h. Φᵢ는 모든 층의 계면 변위를 결합하는 정수압 potential. reduced-gravity 1.5층은 별도 단순화다.',
    refs:['layer','qg'], features:['자유수면','층간 성층','내부 장파'], mapType:'layers'
  },
  {
    id:'pe', name:'Primitive equations', short:'Hydrostatic PE', korean:'정수압 원시 방정식', number:'04', color:'#b17c35', dimension:'수평 2D × 수직격자 = 3D', levels:'수직 N𝓏개 격자', cost:4,
    tagline:'온도·염분과 수직 전단이 해류를 바꿀 때.',
    capabilities:['surface','stratification','profiles'], prognostic:'u,v,T,S와 자유수면 η. w는 연속식, 압력은 정수압식, 밀도는 상태방정식으로 진단.',
    assumptions:'Boussinesq·비압축성·정수압. 수직 운동량의 가속도를 생략하지만, w와 수직 수송 자체를 없애지는 않는다.',
    conservation:'닫힌·무강제 조건에서 체적과 tracer 적분. 무점성·단열·일관된 상태방정식 아래 에너지/PV 보존 구조; 실제 혼합·열속은 수지를 바꾼다.',
    scale:'지역–대양의 성층 순환. km–대양 규모, 시간–계절 이상 예시. 전선 해상도·성층·수직가속도에 따라 정수압 타당성을 점검.',
    time:'이류·관성·내부파·외부파. 보통 외부 mode 분리/implicit 해법과 작은 수직격자 관련 제약을 고려한다.',
    compute:'O(NₕN𝓏) 격자와 다중 tracer, 수직 혼합·상태방정식·표면 mode 해법. 2D 평균 모델보다 상태·입력이 크게 증가.',
    problems:'성층 연안·지역 해류, 바람 구동 순환, 수온·염분·혼합층 진화. ROMS/MITgcm류의 전형적 물리 계층.',
    limits:'대류 plume·비정수압 내부파 등 강한 수직가속도를 직접 해결하지 않는다. 격자 이하 혼합은 여전히 parameterization.',
    needs:'3D 초기 T/S·해류, 수심, 대기·경계 강제력, EOS, 수직 좌표·혼합 폐쇄. 수평 2D 입력장만으로 닫히지 않는다.',
    equations:[
      'D u<sub>h</sub>/Dt + f k×u<sub>h</sub> = −∇<sub>h</sub>p/ρ₀ + F<sub>h</sub>',
      '∂<sub>z</sub>p = −ρg, &nbsp; ∇<sub>h</sub>·u<sub>h</sub> + ∂<sub>z</sub>w = 0',
      'DT/Dt = Q<sub>T</sub>, &nbsp; DS/Dt = Q<sub>S</sub>, &nbsp; ρ = ρ(T,S,p)',
      '∂<sub>t</sub>η + ∇<sub>h</sub>·∫<sub>−H</sub><sup>η</sup>u<sub>h</sub> dz = 0'
    ], eqnote:'z는 위쪽 양의 방향, D/Dt=∂t+uₕ·∇h+w∂z. Boussinesq 근사에서 관성 밀도는 ρ₀. 표면 담수·tracer 속은 생략한 도식적 z좌표식이다.',
    refs:['pe','algorithm'], features:['3D 성층','T/S 수송','수직 전단'], mapType:'profiles'
  },
  {
    id:'ns', name:'2D Navier–Stokes', short:'2D NS', korean:'2차원 비압축성 유동', number:'05', color:'#8a699c', dimension:'엄밀한 평면 2D', levels:'수직 방향 없음', cost:1,
    tagline:'와류와 비선형 이류를 가장 단순하게 분리합니다.',
    capabilities:[], prognostic:'u,v 또는 와도 ζ. 압력 p 또는 유선함수 ψ는 비압축성 제약을 만족하도록 진단.',
    assumptions:'단일 평면의 일정 밀도 비압축성 유동, 수직 변화·자유수면·성층 없음. 여기서는 비회전 기본형.',
    conservation:'주기/적절한 닫힌 경계의 무강제·무점성 Euler 극한에서 운동에너지와 enstrophy. 점성이 있으면 일반적으로 소산된다.',
    scale:'자체에 해양 고유 길이·시간 없음. L,U,Re로 정하는 이상화 와류·난류 문제. 해양 자료에 맞춰도 빠진 물리가 생기지는 않는다.',
    time:'이류 L/U, 점성 L²/ν. 명시적 점성은 Δt∝Δx²/ν 제약; 자유수면 중력파는 없다.',
    compute:'와도 이류·확산 + 2D Poisson 역산/압력 projection. 주기 격자 FFT는 O(Nₕ log Nₕ) 예시; 복잡 경계는 다른 solver 필요.',
    problems:'와류 병합·역에너지 cascade, RC/SciML의 통제된 PDE 벤치마크. 현실 해류 예보용 기본 대체재는 아니다.',
    limits:'수위·조석·β 효과·성층·수직 혼합을 이 기본형은 표현하지 않는다. 일정 f의 평면 회전만 추가해도 가변수심 해양이 되지 않는다.',
    needs:'초기 비발산 유속/와도, 점성 ν, 강제력, 경계조건. 물리적 L,U와 nondimensionalization을 명시.',
    equations:[
      '∂<sub>t</sub>u + (u·∇)u = −∇p/ρ₀ + ν∇²u + F',
      '∇·u = 0',
      '∂<sub>t</sub>ζ + J(ψ,ζ) = ν∇²ζ + (∇×F)<sub>z</sub>, &nbsp; ζ = ∇²ψ'
    ], eqnote:'u=(−ψᵧ,ψₓ). ζ는 수직 와도, enstrophy Z=½∫ζ²dA. 위 점성식의 E·Z를 보존량으로 오해하지 않도록 Euler 극한과 구별한다.',
    refs:['ns'], features:['비압축성','와류·난류','이상화 기준선'], mapType:'vortex'
  },
  {
    id:'nh', name:'Non-hydrostatic Boussinesq', short:'Non-hydrostatic', korean:'비정수압 3D 모델', number:'06', color:'#b9645a', dimension:'3D · 평면 2D 범위 밖', levels:'수직 N𝓏개 격자', cost:5,
    tagline:'수직가속도가 예측의 일부일 때, 차원을 확장합니다.',
    capabilities:['surface','stratification','profiles','vertical'], prognostic:'u,v,w,T,S와 선택한 자유수면의 η. 3D 압력은 비압축성 제약을 통해 진단.',
    assumptions:'Boussinesq·비압축성은 유지하되 수직 운동량을 적분. 여기서는 해양 자유수면 설정을 가정한다.',
    conservation:'무강제·무점성·단열 및 적절한 경계의 일관된 식에서 체적·tracer·운동+위치에너지와 Ertel PV. 수치 보존은 이산화에 달림.',
    scale:'대류·작은 내부파·지형 주변 비정수압 운동. m–km와 초–시간의 예시; 영역·해상도에 따라 범위는 달라진다.',
    time:'수평·수직 이류, 부력·내부파, 자유수면파. 비압축성이므로 음파를 새로 해결하는 모델은 아니다.',
    compute:'3D 압력 Poisson 해법 + 수직 속도 적분. 큰 격자·작은 Δt와 전역 통신으로 대체로 비쌈. hydrostatic 대비 일정 배수는 아님.',
    problems:'해양 대류, 내부파 분산·쇄파, 작은 지형 주변 수직 운동. 쇄파·난류 해석은 해상도와 closure 검증이 별도로 필요.',
    limits:'수평 2D만 저장하는 모델로 구현할 수 없다. 높은 비용만으로 난류나 실제 예보 정확도가 보장되지 않는다.',
    needs:'3D 초기·경계장, 수직 해상도, 압력 solver, 표면 조건, subgrid closure. 관심 현상에서 hydrostatic 오차가 큰지 먼저 검증.',
    equations:[
      'D U/Dt + f k×U = −∇p′/ρ₀ + b k + F',
      '∇·U = 0, &nbsp; U = (u,v,w)',
      'b = −g(ρ−ρ₀)/ρ₀, &nbsp; DT/Dt = Q<sub>T</sub>, &nbsp; DS/Dt = Q<sub>S</sub>'
    ], eqnote:'기준 정수압을 제거한 압력 p′와 traditional f-plane의 도식적 운동량식. 자유수면에는 kinematic/dynamic 경계조건을 추가한다.',
    refs:['pe','algorithm'], features:['수직가속도','3D 압력','물리 확장'], mapType:'vertical'
  }
];

export const physics = [
  {id:'surface',name:'자유수면 중력파',detail:'조석·수위·순압 장파'},
  {id:'stratification',name:'성층과 내부 중력파',detail:'밀도 층·계면의 파동'},
  {id:'profiles',name:'연속 수직 구조·T/S',detail:'수직 전단과 수온·염분 수송'},
  {id:'vertical',name:'수직가속도',detail:'대류·비정수압 운동'}
];

export const purposes = [
  {id:'tide',name:'조석·연안 수송',icon:'≈',description:'수위와 수심 평균 해류를 예측',requirements:['surface'],L:40,H:80,U:0.5,lat:35,rank:['swe','layer','pe','nh','qg','ns'],why:{swe:'수위와 수심 평균 수송이 목적이므로, 단층 자유수면이 가장 간결한 출발점입니다.',layer:'연안 성층·층간 흐름이 중요할 때 단층 모델을 확장할 수 있습니다.',pe:'성층과 수직 전단까지 필요할 때 검토하세요. 수직 초기·경계장과 혼합 설정이 추가됩니다.',nh:'표면 장파만 필요하면 수직가속도와 3D 압력 해법의 추가 비용이 큽니다.'}},
  {id:'eddy',name:'느린 소용돌이',icon:'↻',description:'균형 mesoscale eddy의 이동·상호작용',requirements:[],L:100,H:1000,U:0.2,lat:40,rank:['qg','layer','swe','pe','nh','ns'],why:{qg:'작은 Ro의 느린 균형 운동을 남기므로, 불필요한 중력파 없이 소용돌이를 탐색하기 좋습니다.',layer:'층간 성층과 비지균 운동을 함께 남기고 싶을 때 QG와 비교할 후보입니다.',swe:'균질 해류의 자유수면·비지균 조정을 포함하는 순압 기준선입니다.',pe:'연속 성층과 수직 구조가 핵심이면 더 풍부한 물리가 필요합니다.',ns:'와류의 비선형 이류는 보이지만, 이 기본형에는 β·성층 등 해양 회전 물리가 없습니다.',nh:'균형 소용돌이만으로는 비정수압 계산의 필요성이 낮습니다.'}},
  {id:'internal',name:'내부 장파·계면',icon:'≋',description:'층간 교환과 긴 내부 중력파',requirements:['stratification'],L:20,H:300,U:0.25,lat:35,rank:['layer','pe','nh','swe','qg','ns'],why:{layer:'소수 밀도 층으로 계면 변위와 내부 장파를 직접 예측하는 최소 후보입니다.',pe:'연속 성층과 수직 전단을 해결할 필요가 있을 때 층 모델을 넘어섭니다.',nh:'파장/수심 비가 작거나 분산·수직가속도가 중요하면 검토하세요.'}},
  {id:'forecast',name:'성층 해류 예보',icon:'⇄',description:'T/S와 수직 구조를 포함한 지역 해류',requirements:['profiles'],L:100,H:500,U:0.4,lat:35,rank:['pe','nh','layer','swe','qg','ns'],why:{pe:'수온·염분의 3D 수송과 수직 전단을 예측하며, 정수압이 타당한 지역 해류의 출발점입니다.',nh:'강한 수직가속도를 해결해야 할 근거가 있을 때 hydrostatic PE와 비교합니다.'}},
  {id:'benchmark',name:'와류·학습 실험',icon:'∇',description:'RC·SciML을 위한 통제된 PDE 실험',requirements:[],L:10,H:100,U:0.3,lat:35,rank:['ns','qg','swe','layer','pe','nh'],why:{ns:'단순한 상태와 명확한 와도·에너지 수지로 예측 알고리즘을 분리해 시험하기 좋습니다.',qg:'회전·균형 물리를 남긴 해양 지향 기준선으로 확장할 수 있습니다.',swe:'수위와 빠른 중력파가 학습 성능에 미치는 영향을 비교할 수 있습니다.',layer:'층간 결합·내부파가 꼭 필요한 벤치마크일 때 추가하세요.',pe:'3D 성층 데이터와 계산 자원이 준비된 후의 더 복잡한 시험 단계입니다.',nh:'수직가속도 자체가 연구 대상일 때 사용하는 확장 단계입니다.'}},
  {id:'mixing',name:'대류·수직 운동',icon:'↕',description:'수직가속도와 작은 규모의 혼합',requirements:['vertical'],L:1,H:300,U:0.1,lat:35,rank:['nh','pe','layer','swe','qg','ns'],why:{nh:'수직 운동량을 직접 적분하므로, 수직가속도를 요구하는 현재 목적을 표현하는 유일한 후보입니다.'}}
];

export const defaultState = () => ({purpose:'tide',requirements:['surface'],geometry:'any',budget:'balanced',L:40,H:80,U:0.5,lat:35,grid:256,nz:30,k:2,compare:['swe','qg','pe'],inspector:'swe'});

export function diagnostics(state) {
  const f=2*7.2921159e-5*Math.sin(state.lat*Math.PI/180);
  return {f,Ro:Math.abs(f)<1e-12?Infinity:state.U/(Math.abs(f)*state.L*1000),aspect:state.H/(state.L*1000),advective:state.L*1000/state.U,wave:state.L*1000/Math.sqrt(9.81*state.H),dx:state.L*1000/state.grid};
}

export function evaluate(state) {
  const purpose=purposes.find(p=>p.id===state.purpose) || purposes[0];
  const required=[...new Set([...purpose.requirements,...state.requirements])];
  const d=diagnostics(state);
  return models.map(model=>{
    const excluded=[]; const cautions=[];
    for(const req of required) if(!model.capabilities.includes(req)) {
      const p=physics.find(p=>p.id===req);
      excluded.push(`${p.name}을 이 모델 버전은 표현하지 않습니다.`);
    }
    if(state.geometry==='flat' && ['layer','pe','nh'].includes(model.id)) excluded.push('평면 2D만 사용한다는 차원 제한과 맞지 않습니다.');
    if(state.geometry==='layered' && ['pe','nh'].includes(model.id)) excluded.push('유한층까지만 허용하는 차원 제한과 맞지 않습니다.');
    if(model.id==='qg') {
      if(Math.abs(state.lat)<5) excluded.push('적도 부근: 이 중위도 f₀ 기반 QG 설정의 범위 밖입니다.');
      if(d.Ro>=0.3) excluded.push('Ro ≥ 0.3: 작은 Rossby 수 가정을 이 탐색기의 선별 기준에서 벗어납니다.');
      else if(d.Ro>=0.1) cautions.push('Ro ≥ 0.1: 준지균 근사의 오차를 검증하세요.');
    }
    if(['swe','layer','pe'].includes(model.id) && d.aspect>=0.1) cautions.push('H/L ≥ 0.1: 정수압·장파 가정을 별도로 점검하세요.');
    if(model.id==='ns' && state.purpose!=='benchmark') cautions.push('기본 비회전 2D NS는 실제 해양 회전·수위·성층을 포함하지 않습니다.');
    if(state.budget==='lean' && model.cost>=4) cautions.push('계산 예산 우선과 충돌: 물리를 유지하려면 격자·영역·예보 구간을 줄여야 할 수 있습니다.');
    let score=100-purpose.rank.indexOf(model.id)*12;
    if(state.budget==='lean')score-=model.cost*3;
    if(model.id==='qg' && d.Ro>=0.1)score-=25;
    return {...model,excluded,cautions,eligible:excluded.length===0,score,reason:purpose.why[model.id] || '필수 물리는 포함하지만, 현재 목적에 비해 추가 상태와 입력이 필요합니다.'};
  }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.score-a.score);
}

export function storageEstimate(model,state) {
  const n=state.grid**2;
  const fields=model.id==='qg'||model.id==='ns'?1:model.id==='swe'?3:model.id==='layer'?3*state.k:model.id==='pe'?4*state.nz+1:5*state.nz+1;
  return {fields,values:n*fields,MiB:n*fields*8/1024**2};
}
