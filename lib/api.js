import http from 'k6/http';
import { check } from 'k6';
import { API } from '../config.js';

function params(token, name, esperado, fase = 'prueba') {
  return {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    tags: { name, fase },
    responseCallback: http.expectedStatuses(...[].concat(esperado)),
  };
}

function json(r) {
  try { return r.json(); } catch (e) { return null; }
}

export function login(email, password, { esperado = 200, fase = 'prueba' } = {}) {
  const name = 'POST /auth/login';
  const r = http.post(`${API}/auth/login`, { email, password }, params(null, name, esperado, fase));
  const body = json(r);
  const feliz = esperado === 200;
  const ok = check(r, {
    [`${name} -> ${esperado}`]: (x) => x.status === esperado,
    ...(feliz ? { 'login devuelve token JWT': () => !!body && typeof body.token === 'string' && body.token.split('.').length === 3 } : {}),
  });
  return { r, ok, token: ok && feliz ? body.token : null, user: ok && feliz ? body.user : null };
}

export function listarCategorias(token, page, limit, { esperado = 200 } = {}) {
  const name = 'GET /categories';
  const r = http.get(`${API}/categories?page=${page}&limit=${limit}`, params(token, name, esperado));
  const body = json(r);
  const feliz = esperado === 200;
  const ok = check(r, {
    [`${name} -> ${esperado}`]: (x) => x.status === esperado,
    ...(feliz ? {
      'categories es lista': () => !!body && Array.isArray(body.categories),
      'categories respeta limit': () => !!body && body.categories.length <= limit,
      'categories tiene id y name': () => !!body && body.categories.every((c) => c.id && c.name),
    } : {}),
  });
  return { r, ok, total: ok && feliz ? body.total : 0 };
}

export function listarLibros(token, page, limit, { esperado = 200 } = {}) {
  const name = 'GET /books';
  const r = http.get(`${API}/books?page=${page}&limit=${limit}`, params(token, name, esperado));
  const body = json(r);
  const feliz = esperado === 200;
  const ok = check(r, {
    [`${name} -> ${esperado}`]: (x) => x.status === esperado,
    ...(feliz ? {
      'books es lista': () => !!body && Array.isArray(body.books),
      'books respeta limit': () => !!body && body.books.length <= limit,
      'books página correcta': () => !!body && Number(body.page) === page,
      'books tiene título y stock': () => !!body && body.books.every((b) => b.title && b.availableQuantity !== undefined),
    } : {}),
  });
  return { r, ok, total: ok && feliz ? body.total : 0 };
}
