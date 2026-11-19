import exec from 'k6/execution';
import { prepararSocios } from './lib/socios.js';
import { consultaCatalogo } from './lib/flujo.js';
import { crearResumen, thresholdsInformativos, TREND_STATS } from './lib/resumen.js';

const ESCALONES = (__ENV.ESCALONES || '50,100,200,300,400').split(',').map(Number);
const STEP_RAMP = seg(__ENV.STEP_RAMP || '1m');
const STEP_HOLD = seg(__ENV.STEP_HOLD || '3m');
const RECUP_HOLD = seg(__ENV.RECUP_HOLD || '3m');

function seg(s) {
  const r = String(s).match(/^(\d+)(s|m|h)$/);
  return r ? Number(r[1]) * { s: 1, m: 60, h: 3600 }[r[2]] : 0;
}

const stages = [];
const segmentos = [];
let t = 0;
function tramo(dur, target, etiqueta) {
  stages.push({ duration: `${dur}s`, target });
  segmentos.push({ desde: t, hasta: t + dur, etiqueta });
  t += dur;
}
for (const n of ESCALONES) {
  tramo(STEP_RAMP, n, `subida-${n}`);
  tramo(STEP_HOLD, n, `E${n}`);
}
const RECUP = ESCALONES[0];
tramo(STEP_RAMP, RECUP, `bajada-${RECUP}`);
tramo(RECUP_HOLD, RECUP, `R${RECUP}`);
stages.push({ duration: '30s', target: 0 });

const MESETAS = segmentos
  .filter((s) => /^[ER]\d+$/.test(s.etiqueta))
  .map((s) => ({ nombre: s.etiqueta, seg: s.hasta - s.desde }));

export const options = {
  setupTimeout: '3m',
  summaryTrendStats: TREND_STATS,
  scenarios: {
    escalones: { executor: 'ramping-vus', startVUs: 0, stages, gracefulRampDown: '30s' },
  },
  thresholds: {
    ...thresholdsInformativos(MESETAS.map((m) => m.nombre)),
    'http_req_failed{fase:prueba}': [{ threshold: 'rate<0.30', abortOnFail: true, delayAbortEval: '1m' }],
  },
};

export function setup() {
  return { socios: prepararSocios(Math.ceil(Math.max(...ESCALONES) * 1.05)) };
}

export default function (data) {
  const s = (Date.now() - exec.scenario.startTime) / 1000;
  const seg_ = segmentos.find((x) => s >= x.desde && s < x.hasta);
  exec.vu.metrics.tags.escalon = seg_ ? seg_.etiqueta : 'fin';
  consultaCatalogo(data.socios);
}

export const handleSummary = crearResumen('stress', MESETAS);
