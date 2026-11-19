export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
export const API = `${BASE_URL}/api`;

export const NEGOCIO = {
  sociosTotales: 3000,
  sociosConcurrentesPico: Number(__ENV.VUS || 50),
  passwordSocio: '123456',
  limiteCategorias: 50,
  librosPorPagina: 10,
  paginasMax: 3,
};

export const THINK = {
  min: Number(__ENV.THINK_MIN ?? 2),
  max: Number(__ENV.THINK_MAX ?? 5),
};

export const SLO = {
  p95LoginMs: 800,
  p95CategoriasMs: 300,
  p95LibrosMs: 300,
  tasaErrorMax: 0.01,
  sesionesOkMin: 0.99,
};

export const THRESHOLDS_SLO = {
  'http_req_duration{name:POST /auth/login}': [`p(95)<${SLO.p95LoginMs}`],
  'http_req_duration{name:GET /categories}': [`p(95)<${SLO.p95CategoriasMs}`],
  'http_req_duration{name:GET /books}': [`p(95)<${SLO.p95LibrosMs}`],
  'http_req_failed{fase:prueba}': [`rate<${SLO.tasaErrorMax}`],
  checks: ['rate>0.99'],
  sesiones_completas: [`rate>${SLO.sesionesOkMin}`],
};
