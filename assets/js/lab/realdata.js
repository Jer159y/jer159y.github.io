// Real-data panels: observed Niño3.4 (Climate lab) and an OISST point series with marine-heatwave detection (Marine lab).
import { Plot, PALETTE, css, fmt, extent, positiveExtent, clearCanvas } from './plots.js';
import { mean, std, acf, psd, runningMean, mhwClimatology, detectMhw } from './stats.js';

const MON = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
const CAT = ['#e8a33d', '#d9663b', '#b8322a', '#6e1a1a'];

function panel(container, tabs, render) {
  container.innerHTML = `<div class="compare-options lab-real-tabs">${tabs.map(([id, l], i) => `<button type="button" data-real="${id}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div><div class="lab-real-extra"></div><canvas width="820" height="380" role="img" aria-label="관측 자료 그림"></canvas><p class="sim-help lab-real-caption"></p>`;
  const canvas = container.querySelector('canvas'), cap = container.querySelector('.lab-real-caption'), extra = container.querySelector('.lab-real-extra');
  let cur = tabs[0][0];
  const draw = () => { const ctx = clearCanvas(canvas); cap.textContent = render(cur, ctx, canvas.width, canvas.height, extra) ?? ''; };
  container.addEventListener('click', e => { const b = e.target.closest('[data-real]'); if (!b) return; cur = b.dataset.real; container.querySelectorAll('[data-real]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); });
  container.addEventListener('change', draw);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  draw();
}

async function nino(container) {
  const { default: d } = await import('./data/nino34.js');
  const n = d.anom.length, t = d.anom.map((_, i) => d.start[0] + (d.start[1] - 1 + i) / 12), month = d.anom.map((_, i) => ((d.start[1] - 1 + i) % 12) + 1);
  const oni = runningMean(d.anom, 3).map((v, i, a) => a[i + 1] ?? NaN); // centred 3-month mean
  panel(container, [['series', '지수와 사건'], ['season', '계절 위상고정'], ['psd', '스펙트럼'], ['acf', '자기상관·기억']], (view, ctx, W, H) => {
    const box = { l: 58, t: 24, w: W - 76, h: H - 64 };
    if (view === 'series') {
      const p = new Plot(ctx, box, { x: [t[0], t.at(-1)], y: extent([d.anom]), ylabel: 'Niño3.4 이상 (°C)', xlabel: '연도' }); p.axes({ zero: true });
      oni.forEach((v, i) => { if (v >= 0.5) p.vspan(t[i] - 1 / 24, t[i] + 1 / 24, PALETTE[1], 0.25); if (v <= -0.5) p.vspan(t[i] - 1 / 24, t[i] + 1 / 24, PALETTE[0], 0.25); });
      p.line(t, d.anom, PALETTE[5], { width: 0.8, alpha: 0.7 }); p.line(t, oni, css('--global-text-color', '#333'), { width: 1.5 });
      return `월별 이상(회색)과 3개월 이동평균(검정). 이동평균이 +0.5°C 이상인 달은 주황(El Niño 조건), −0.5°C 이하인 달은 파랑(La Niña 조건). CPC의 공식 ONI는 5개월 이상 지속과 이동 기준기간을 함께 쓰므로 이 음영은 근사입니다. ${t[0].toFixed(0)}–${Math.floor(t.at(-1))}년, ${n}개월.`;
    }
    if (view === 'season') {
      const sd = MON.map((_, m) => std(d.anom.filter((_, i) => month[i] === m + 1)));
      const p = new Plot(ctx, box, { x: [0.5, 12.5], y: [0, Math.max(...sd) * 1.15], xlabel: '달', ylabel: '표준편차 (°C)' }); p.axes();
      p.bars(sd.map((_, i) => i + 1), sd, 0.7, PALETTE[1]);
      const mx = sd.indexOf(Math.max(...sd)), mn = sd.indexOf(Math.min(...sd));
      return `달별 Niño3.4 이상의 표준편차: 최대 ${MON[mx]} ${fmt(sd[mx], 2)}°C, 최소 ${MON[mn]} ${fmt(sd[mn], 2)}°C. ENSO는 북반구 겨울에 정점을 이루고 봄에 약한데, 이것이 계절 위상고정이며 봄철 예측 장벽과 연결됩니다.`;
    }
    if (view === 'psd') {
      const s = psd(d.anom, 1 / 12, 256);
      const p = new Plot(ctx, box, { x: positiveExtent([s.f]), y: positiveExtent([s.p]), logx: true, logy: true, xlabel: '진동수 (주기/년)', ylabel: 'PSD' }); p.axes();
      p.vspan(1 / 7, 1 / 2, PALETTE[1], 0.12); p.line(s.f, s.p, PALETTE[0], { width: 2 });
      let j = 0; s.p.forEach((v, k) => { if (v > s.p[j]) j = k; });
      return `Welch PSD (21년 창). 음영은 2–7년 대역. 최대 봉우리 주기 ≈ ${fmt(1 / s.f[j], 1)}년 — 하나의 주기가 아니라 넓은 봉우리라는 점이 잡음 강제 감쇠 진동자 해석과 맞습니다.`;
    }
    const a = acf(d.anom, 48), lags = a.r.map((_, i) => i);
    const p = new Plot(ctx, box, { x: [0, 48], y: [-1, 1], xlabel: '지연 (개월)', ylabel: 'ACF' }); p.axes({ zero: true });
    p.line(lags, a.r, PALETTE[0], { width: 2 }); p.line([0, 48], [1 / Math.E, 1 / Math.E], PALETTE[5], { dash: [3, 3], width: 1 });
    return `e-folding 지연 ≈ ${a.efold}개월, 음의 상관 최저는 약 ${a.r.indexOf(Math.min(...a.r))}개월. 지속성(persistence) 예측이 몇 달 안에 무너지는 이유이자, 반대 위상으로 넘어가는 진동 성분을 보여 줍니다.`;
  });
  return { nino: { anom: d.anom, month } };
}

async function oisst(container) {
  let d, mod;
  try { mod = await import('./data/oisst-eastsea.js'); d = mod.default; } catch { container.innerHTML = '<p class="ol-fine">OISST 자료를 불러오지 못했습니다.</p>'; return {}; }
  const days = [], sst = d.sst.map(v => (v === null ? NaN : v / 100)), t0 = Date.UTC(...d.start.map((v, i) => (i === 1 ? v - 1 : v)));
  for (let i = 0; i < sst.length; i++) { const dt = new Date(t0 + i * 86400000), y = dt.getUTCFullYear(), doy = Math.floor((dt - Date.UTC(y, 0, 1)) / 86400000) + 1; days.push({ year: y, doy, date: dt }); }
  const valid = sst.map(Number.isFinite);
  const { clim, thresh } = mhwClimatology(days.filter((_, i) => valid[i]), sst.filter((_, i) => valid[i]), 1991, 2020), ev = detectMhw(days, sst, clim, thresh);
  const years = [...new Set(days.map(x => x.year))];
  panel(container, [['year', '연도별 탐지'], ['annual', '연간 지표'], ['clim', '기후값·임계값·자료 처리']], (view, ctx, W, H, extra) => {
    const box = { l: 58, t: 24, w: W - 76, h: H - 64 };
    if (view === 'year') {
      if (!extra.querySelector('select')) extra.innerHTML = `<label>연도 <select>${years.map(y => `<option ${y === years.at(-1) - (days.at(-1).doy < 300 ? 1 : 0) ? 'selected' : ''}>${y}</option>`).join('')}</select></label>`;
      const y = Number(extra.querySelector('select').value), idx = days.map((x, i) => (x.year === y ? i : -1)).filter(i => i >= 0);
      const xs = idx.map(i => days[i].doy), s = idx.map(i => sst[i]), c = idx.map(i => clim[days[i].doy - 1]), th = idx.map(i => thresh[days[i].doy - 1]);
      const p = new Plot(ctx, box, { x: [1, 366], y: extent([s, c, th]), xlabel: `${y}년의 날 (1–366)`, ylabel: 'SST (°C)' }); p.axes();
      const evs = ev.filter(e => days[e.end].year >= y && days[e.start].year <= y);
      evs.forEach(e => { const a = days[e.start].year < y ? 1 : days[e.start].doy, b = days[e.end].year > y ? 366 : days[e.end].doy; p.vspan(a, b + 1, CAT[e.category - 1], 0.35); });
      p.line(xs, c, PALETTE[5]); p.line(xs, th, PALETTE[1], { dash: [4, 3] }); p.line(xs, s, PALETTE[0], { width: 1.6 });
      const list = evs.map(e => `${days[e.start].date.toISOString().slice(5, 10)}부터 ${e.duration}일, 최대 +${fmt(e.imax, 1)}°C (${['Moderate', 'Strong', 'Severe', 'Extreme'][e.category - 1]})`);
      return `${y}년: 파랑 SST, 회색 기후값(1991–2020), 주황 점선 90% 임계값. 음영은 탐지된 해양열파(범주 색). ${list.length ? list.join(' · ') : '이 해에는 탐지된 해양열파가 없습니다.'}`;
    }
    extra.innerHTML = '';
    if (view === 'annual') {
      // Only years with (almost) complete records: long gaps would undercount heatwave days.
      const full = years.filter(y => days.filter((x, i) => x.year === y && valid[i]).length >= 360);
      const dayCount = full.map(y => ev.reduce((s, e) => { let n = 0; for (let k = e.start; k <= e.end; k++) if (days[k].year === y) n++; return s + n; }, 0));
      const p = new Plot(ctx, box, { x: [full[0] - 0.5, full.at(-1) + 0.5], y: [0, Math.max(...dayCount, 10) * 1.1], xlabel: '연도', ylabel: '해양열파 일수' }); p.axes();
      p.bars(full, dayCount, 0.8, PALETTE[1]);
      const early = mean(dayCount.slice(0, 10)), late = mean(dayCount.slice(-10));
      return `연간 해양열파 일수 (결측이 거의 없는 ${full.length}개 해만; 긴 결측이 있는 ${years.length - full.length}개 해는 제외). 처음 10년 평균 ${fmt(early, 0)}일, 마지막 10년 평균 ${fmt(late, 0)}일. 고정 기준기간(1991–2020)과 장기 온난화 추세가 함께 작용하며, 추세를 제거한 기준을 쓰면 결과가 달라집니다.`;
    }
    const doy = clim.map((_, i) => i + 1);
    const p = new Plot(ctx, box, { x: [1, 366], y: extent([clim, thresh]), xlabel: '날 (1–366)', ylabel: 'SST (°C)' }); p.axes();
    p.line(doy, clim, PALETTE[5], { width: 2 }); p.line(doy, thresh, PALETTE[1], { dash: [4, 3], width: 2 });
    return `자료: NOAA OISST v2.1 (CoastWatch ERDDAP), ${days.length.toLocaleString()}일. ERDDAP 집계에서 빠진 날 중 5일 이하 공백 ${mod.interpolated}일은 선형 보간했고, 더 긴 ${mod.gaps.length}개 공백(1993–1998년, 2023년 말)은 결측으로 두어 기후값·탐지에서 제외했습니다. 기준기간 1991–2020의 일별 기후값(회색)과 90% 임계값(주황 점선). 11일 창으로 날짜별 분포를 모으고 31일 이동평균으로 다듬었습니다(Hobday et al. 2016). 임계값과 기후값의 차이가 범주(Moderate·Strong·Severe·Extreme)를 정하는 단위입니다.`;
  });
  return { oisst: { n: sst.length, events: ev.length } };
}

export async function renderRealData(lab, container) {
  if (!container) return {};
  return lab === 'climate' ? nino(container) : oisst(container);
}
