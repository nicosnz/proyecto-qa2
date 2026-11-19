import { NEGOCIO, THRESHOLDS_SLO } from './config.js';
import { prepararSocios } from './lib/socios.js';
import { consultaCatalogo } from './lib/flujo.js';
import { crearResumen, thresholdsInformativos, TREND_STATS } from './lib/resumen.js';

const VUS = NEGOCIO.sociosConcurrentesPico;

export const options = {
  setupTimeout: '2m',
  summaryTrendStats: TREND_STATS,
  scenarios: {
    hora_pico: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.RAMP || '2m', target: VUS },
        { duration: __ENV.HOLD || '15m', target: VUS },
        { duration: __ENV.DOWN || '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: { ...thresholdsInformativos(), ...THRESHOLDS_SLO },
};

export function setup() {
  return { socios: prepararSocios(Math.ceil(VUS * 1.1)) };
}

export default function (data) {
  consultaCatalogo(data.socios);
}

export const handleSummary = crearResumen('load');
