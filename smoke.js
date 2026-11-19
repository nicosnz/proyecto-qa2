import { group } from 'k6';
import { NEGOCIO } from './config.js';
import * as api from './lib/api.js';
import { prepararSocios, emailSocio } from './lib/socios.js';
import { consultaCatalogo } from './lib/flujo.js';
import { crearResumen, thresholdsInformativos, TREND_STATS } from './lib/resumen.js';

export const options = {
  scenarios: {
    smoke: { executor: 'per-vu-iterations', vus: 1, iterations: 3, maxDuration: '3m' },
  },
  summaryTrendStats: TREND_STATS,
  thresholds: {
    ...thresholdsInformativos(),
    checks: ['rate==1'],
    'http_req_failed{fase:prueba}': ['rate==0'],
    sesiones_completas: ['rate==1'],
  },
};

export function setup() {
  return { socios: prepararSocios(1) };
}

export default function (data) {
  consultaCatalogo(data.socios);

  if (__ITER === 0) {
    group('Seguridad del flujo', () => {
      api.login(emailSocio(1), 'incorrecta', { esperado: 401 });
      api.login('no.existe.k6@example.com', NEGOCIO.passwordSocio, { esperado: 400 });
      api.listarCategorias(null, 1, 50, { esperado: 401 });
      api.listarLibros(null, 1, 10, { esperado: 401 });
      api.listarLibros('abc.def.ghi', 1, 10, { esperado: 401 });
    });
  }
}

export const handleSummary = crearResumen('smoke');
