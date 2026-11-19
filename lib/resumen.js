import { SLO } from '../config.js';

export const ENDPOINTS = ['POST /auth/login', 'GET /categories', 'GET /books'];
export const TREND_STATS = ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'];

const v = (d, k, s) => (d.metrics[k] && d.metrics[k].values ? d.metrics[k].values[s] : undefined);
const ms = (x) => (x === undefined ? '—' : `${x.toFixed(0)} ms`);
const pct = (x) => (x === undefined ? '—' : `${(x * 100).toFixed(2)} %`);
const num = (x, dec = 0) => (x === undefined ? '—' : Number(x).toFixed(dec));

export function thresholdsInformativos(escalones = []) {
  const t = {};
  for (const e of ENDPOINTS) {
    t[`http_reqs{name:${e},fase:prueba}`] = [];
    t[`http_req_failed{name:${e},fase:prueba}`] = [];
    t[`http_req_duration{name:${e}}`] = [];
    for (const s of escalones) t[`http_req_duration{name:${e},escalon:${s}}`] = [];
  }
  for (const s of escalones) {
    t[`http_reqs{escalon:${s}}`] = [];
    t[`http_req_failed{escalon:${s}}`] = [];
    t[`http_req_duration{escalon:${s}}`] = [];
  }
  return t;
}

const SLO_EP = {
  'POST /auth/login': SLO.p95LoginMs,
  'GET /categories': SLO.p95CategoriasMs,
  'GET /books': SLO.p95LibrosMs,
};

function kpis(d) {
  const durSeg = d.state.testRunDurationMs / 1000;
  const sesiones = v(d, 'iterations', 'count') || 0;
  return [
    ['Duración', `${num(durSeg / 60, 1)} min`, ''],
    ['VUs máximos (socios concurrentes)', num(v(d, 'vus', 'max') ?? v(d, 'vus_max', 'max')), ''],
    ['Sesiones (iteraciones)', num(sesiones), ''],
    ['Sesiones por minuto', num(sesiones / (durSeg / 60), 1), ''],
    ['Requests totales', num(v(d, 'http_reqs', 'count')), ''],
    ['Throughput', `${num(v(d, 'http_reqs', 'rate'), 2)} req/s`, ''],
    ['Tasa de error HTTP', pct(v(d, 'http_req_failed{fase:prueba}', 'rate') ?? v(d, 'http_req_failed', 'rate')), `< ${pct(SLO.tasaErrorMax)}`],
    ['Checks OK', pct(v(d, 'checks', 'rate')), '> 99 %'],
    ['Sesiones completas', pct(v(d, 'sesiones_completas', 'rate')), `> ${pct(SLO.sesionesOkMin)}`],
    ['p95 sesión (sin pausas)', ms(v(d, 'duracion_sesion_sin_pausas', 'p(95)')), ''],
    ['Páginas de catálogo vistas', num(v(d, 'paginas_catalogo_vistas', 'count')), ''],
    ['p95 global', ms(v(d, 'http_req_duration{fase:prueba}', 'p(95)') ?? v(d, 'http_req_duration', 'p(95)')), ''],
  ];
}

function porEndpoint(d) {
  return ENDPOINTS.map((e) => ({
    endpoint: e,
    reqs: v(d, `http_reqs{name:${e},fase:prueba}`, 'count'),
    error: v(d, `http_req_failed{name:${e},fase:prueba}`, 'rate'),
    avg: v(d, `http_req_duration{name:${e}}`, 'avg'),
    med: v(d, `http_req_duration{name:${e}}`, 'med'),
    p95: v(d, `http_req_duration{name:${e}}`, 'p(95)'),
    p99: v(d, `http_req_duration{name:${e}}`, 'p(99)'),
    max: v(d, `http_req_duration{name:${e}}`, 'max'),
    slo: SLO_EP[e],
  })).filter((x) => x.reqs);
}

function porEscalon(d, escalones) {
  return escalones.map(({ nombre: s, seg }) => {
    const reqs = v(d, `http_reqs{escalon:${s}}`, 'count');
    const fila = {
      escalon: s,
      reqs,
      rps: reqs && seg ? reqs / seg : undefined,
      error: v(d, `http_req_failed{escalon:${s}}`, 'rate'),
      p95: v(d, `http_req_duration{escalon:${s}}`, 'p(95)'),
    };
    for (const e of ENDPOINTS) fila[e] = v(d, `http_req_duration{name:${e},escalon:${s}}`, 'p(95)');
    fila.cumpleSlo = (fila.error || 0) <= SLO.tasaErrorMax && ENDPOINTS.every((e) => (fila[e] || 0) <= SLO_EP[e]);
    return fila;
  }).filter((x) => x.reqs);
}

function analisisEstres(esc) {
  const roto = esc.find((x) => x.escalon.startsWith('E') && !x.cumpleSlo);
  const ultimoOk = [...esc].reverse().find((x) => x.escalon.startsWith('E') && x.cumpleSlo && (!roto || esc.indexOf(x) < esc.indexOf(roto)));
  const base = esc.find((x) => x.escalon.startsWith('E'));
  const recup = esc.find((x) => x.escalon.startsWith('R'));
  let recuperacion = '—';
  if (base && recup && base.p95 && recup.p95) {
    const r = recup.p95 / base.p95;
    recuperacion = `${r.toFixed(2)}x (${r <= 1.2 && (recup.error || 0) <= SLO.tasaErrorMax ? 'se recupera' : 'NO se recupera'})`;
  }
  return {
    capacidad: ultimoOk ? `${ultimoOk.escalon.slice(1)} VUs cumpliendo SLOs` : 'ningún escalón cumplió los SLOs',
    quiebre: roto ? `${roto.escalon.slice(1)} VUs` : 'no alcanzado',
    recuperacion,
  };
}

function umbrales(d) {
  const f = [];
  for (const [k, m] of Object.entries(d.metrics)) {
    if (!m.thresholds) continue;
    for (const [expr, r] of Object.entries(m.thresholds)) f.push({ metrica: k, umbral: expr, ok: r.ok });
  }
  return f;
}

function texto(nombre, k, eps, esc, an, th) {
  const pad = (s, n) => String(s).padEnd(n);
  let t = `\n════════ KPIs — ${nombre} ════════\n`;
  for (const [a, b, c] of k) t += `  ${pad(a, 36)} ${pad(b, 14)} ${c ? `objetivo ${c}` : ''}\n`;
  t += `\n  ${pad('Endpoint', 18)} ${pad('reqs', 7)} ${pad('error', 8)} ${pad('avg', 8)} ${pad('med', 8)} ${pad('p95', 8)} ${pad('p99', 8)} ${pad('max', 8)} SLO p95\n`;
  for (const e of eps) {
    t += `  ${pad(e.endpoint, 18)} ${pad(e.reqs, 7)} ${pad(pct(e.error), 8)} ${pad(ms(e.avg), 8)} ${pad(ms(e.med), 8)} ${pad(ms(e.p95), 8)} ${pad(ms(e.p99), 8)} ${pad(ms(e.max), 8)} < ${e.slo} ms ${e.p95 <= e.slo ? '✓' : '✗'}\n`;
  }
  if (esc) {
    t += `\n  Por escalón (E = meseta, R = recuperación):\n`;
    t += `  ${pad('escalón', 9)} ${pad('req/s', 8)} ${pad('error', 8)} ${pad('p95 login', 10)} ${pad('p95 categ', 10)} ${pad('p95 books', 10)} SLOs\n`;
    for (const x of esc) {
      t += `  ${pad(x.escalon, 9)} ${pad(num(x.rps, 1), 8)} ${pad(pct(x.error), 8)} ${pad(ms(x['POST /auth/login']), 10)} ${pad(ms(x['GET /categories']), 10)} ${pad(ms(x['GET /books']), 10)} ${x.cumpleSlo ? '✓' : '✗'}\n`;
    }
    t += `\n  Capacidad máxima: ${an.capacidad}\n  Punto de quiebre: ${an.quiebre}\n  Recuperación (p95 R / primer E): ${an.recuperacion}\n`;
  }
  t += `\n  Umbrales:\n`;
  for (const x of th) t += `  ${x.ok ? '✓' : '✗'} ${x.metrica}  ${x.umbral}\n`;
  const malos = th.filter((x) => !x.ok).length;
  t += `\n  Resultado: ${malos === 0 ? 'APROBADO ✓' : `${malos} umbral(es) NO cumplidos ✗`}\n`;
  return t;
}

function html(nombre, k, eps, esc, an, th) {
  const e_ = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const fila = (cs) => `<tr>${cs.map((c) => `<td>${e_(c)}</td>`).join('')}</tr>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>k6 ${e_(nombre)}</title><style>
body{font-family:system-ui,sans-serif;max-width:980px;margin:24px auto;padding:0 16px;color:#1d2433;background:#fff}
table{border-collapse:collapse;width:100%;margin:10px 0 24px}td,th{border-bottom:1px solid #e3e6ec;padding:6px 8px;text-align:left;font-size:.9rem}
th{background:#f4f6fa}.ok{color:#137333}.ko{color:#b3261e;font-weight:600}</style></head><body>
<h1>KPIs — ${e_(nombre)}</h1><p>Flujo: login → GET categories → GET books · ${new Date().toISOString()}</p>
<h2>Indicadores</h2><table><tr><th>KPI</th><th>Valor</th><th>Objetivo</th></tr>${k.map(fila).join('')}</table>
<h2>Por endpoint</h2><table><tr><th>Endpoint</th><th>reqs</th><th>error</th><th>avg</th><th>med</th><th>p95</th><th>p99</th><th>max</th><th>SLO p95</th></tr>
${eps.map((x) => fila([x.endpoint, x.reqs, pct(x.error), ms(x.avg), ms(x.med), ms(x.p95), ms(x.p99), ms(x.max), `< ${x.slo} ms ${x.p95 <= x.slo ? '✓' : '✗'}`])).join('')}</table>
${esc ? `<h2>Por escalón</h2><p>Capacidad: <b>${e_(an.capacidad)}</b> · Quiebre: <b>${e_(an.quiebre)}</b> · Recuperación: <b>${e_(an.recuperacion)}</b></p>
<table><tr><th>Escalón</th><th>req/s</th><th>error</th><th>p95 login</th><th>p95 categories</th><th>p95 books</th><th>SLOs</th></tr>
${esc.map((x) => fila([x.escalon, num(x.rps, 1), pct(x.error), ms(x['POST /auth/login']), ms(x['GET /categories']), ms(x['GET /books']), x.cumpleSlo ? '✓' : '✗'])).join('')}</table>` : ''}
<h2>Umbrales</h2><table><tr><th></th><th>Métrica</th><th>Umbral</th></tr>
${th.map((x) => `<tr><td class="${x.ok ? 'ok' : 'ko'}">${x.ok ? '✓' : '✗'}</td><td>${e_(x.metrica)}</td><td>${e_(x.umbral)}</td></tr>`).join('')}</table>
</body></html>`;
}

export function crearResumen(nombre, escalones = null) {
  return function handleSummary(d) {
    const k = kpis(d);
    const eps = porEndpoint(d);
    const esc = escalones ? porEscalon(d, escalones) : null;
    const an = esc ? analisisEstres(esc) : null;
    const th = umbrales(d);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return {
      stdout: texto(nombre, k, eps, esc, an, th),
      [`results/${nombre}-${ts}.json`]: JSON.stringify({ prueba: nombre, kpis: k, porEndpoint: eps, porEscalon: esc, analisis: an, umbrales: th, metricas: d.metrics }, null, 2),
      [`results/${nombre}-${ts}.html`]: html(nombre, k, eps, esc, an, th),
    };
  };
}
