import http from 'k6/http';
import exec from 'k6/execution';
import { API, NEGOCIO } from '../config.js';

const LOTE = 20;

export function emailSocio(n) {
  return `k6.socio.${String(n).padStart(3, '0')}@example.com`;
}

export function prepararSocios(cantidad) {
  const emails = [];
  for (let n = 1; n <= cantidad; n++) emails.push(emailSocio(n));
  const p = {
    tags: { name: 'POST /auth/register', fase: 'setup' },
    responseCallback: http.expectedStatuses(200, 400),
  };
  for (let i = 0; i < emails.length; i += LOTE) {
    const res = http.batch(emails.slice(i, i + LOTE).map((email) => ({
      method: 'POST', url: `${API}/auth/register`,
      body: { name: 'Socio k6', email, password: NEGOCIO.passwordSocio }, params: p,
    })));
    const malos = res.filter((r) => r.status !== 200 && !String(r.body).includes('already registered'));
    if (malos.length) exec.test.abort(`No se pudo preparar socios: ${malos[0].status} ${malos[0].body}. ¿Está la API arriba en ${API}?`);
  }
  return emails;
}

export function socioDelVu(socios) {
  return socios[(exec.vu.idInTest - 1) % socios.length];
}
