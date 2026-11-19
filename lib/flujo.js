import { group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { NEGOCIO, THINK } from '../config.js';
import * as api from './api.js';
import { socioDelVu } from './socios.js';

export const sesionesCompletas = new Rate('sesiones_completas');
export const duracionSesion = new Trend('duracion_sesion_sin_pausas', true);
export const paginasVistas = new Counter('paginas_catalogo_vistas');
export const fallosPorPaso = new Counter('fallos_por_paso');

export function pensar() {
  if (THINK.max <= 0) return;
  sleep(THINK.min + Math.random() * (THINK.max - THINK.min));
}

function fallo(paso) {
  fallosPorPaso.add(1, { paso });
  return false;
}

export function consultaCatalogo(socios) {
  let ok = true;
  let ms = 0;

  group('Consulta de catálogo', () => {
    const l = api.login(socioDelVu(socios), NEGOCIO.passwordSocio);
    ms += l.r.timings.duration;
    if (!l.token) { ok = fallo('login'); return; }
    pensar();

    const c = api.listarCategorias(l.token, 1, NEGOCIO.limiteCategorias);
    ms += c.r.timings.duration;
    if (!c.ok) ok = fallo('categorias');
    pensar();

    const lim = NEGOCIO.librosPorPagina;
    const primera = api.listarLibros(l.token, 1, lim);
    ms += primera.r.timings.duration;
    paginasVistas.add(1);
    if (!primera.ok) { ok = fallo('libros'); return; }
    pensar();

    const existentes = Math.max(1, Math.ceil(primera.total / lim));
    const aVer = Math.min(existentes, 1 + Math.floor(Math.random() * NEGOCIO.paginasMax));
    for (let p = 2; p <= aVer; p++) {
      const b = api.listarLibros(l.token, p, lim);
      ms += b.r.timings.duration;
      paginasVistas.add(1);
      if (!b.ok) ok = fallo('libros');
      pensar();
    }
  });

  sesionesCompletas.add(ok);
  if (ok) duracionSesion.add(ms);
}
