#!/usr/bin/env node

import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const DEFAULT_PORT = 48765;
export const LOOPBACK_HOST = '127.0.0.1';
export const TEST_HOSTS = Object.freeze([
  'exact.localhost',
  'parent.localhost',
  'child.parent.localhost',
  'never.localhost',
]);

const RESPONSE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'none'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function hostnameFromHeader(value) {
  try {
    return new URL(`http://${String(value || '')}`).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function controls(variant) {
  if (variant === 'signup') {
    return `
      <form id="signup-form" autocomplete="on">
        <label>Email <input id="signup-email" name="email" type="email" autocomplete="username"></label>
        <label>New password <input id="new-password" name="new-password" type="password" autocomplete="new-password"></label>
        <label>Confirm password <input id="confirm-password" name="confirm-password" type="password" autocomplete="new-password"></label>
        <button type="submit">Create test account</button>
      </form>`;
  }
  if (variant === 'navigated') {
    return '<p id="navigated">Navigation completed. This document deliberately has no login fields.</p>';
  }
  if (variant === 'index') {
    return `
      <nav aria-label="Test pages">
        <a href="/login">Login form</a>
        <a href="/signup">Signup refusal form</a>
      </nav>`;
  }
  return `
    <form id="login-form" autocomplete="on">
      <label>Username <input id="username" name="username" type="text" autocomplete="username"></label>
      <label>Password <input id="password" name="password" type="password" autocomplete="current-password"></label>
      <div class="actions">
        <button type="submit">Sign in locally</button>
        <button id="clear" type="button">Clear fields</button>
        <a id="navigate" href="/navigated">Navigate during Fill</a>
      </div>
    </form>
    <p id="field-state" role="status">username empty · password empty</p>`;
}

export function buildPage({ variant = 'login', host = 'unknown' } = {}) {
  const safeHost = escapeHtml(host);
  const title = variant === 'signup' ? 'Signup refusal fixture'
    : variant === 'navigated' ? 'Navigation target'
      : variant === 'index' ? '1Password live gate'
        : 'Login fill fixture';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root { color-scheme: light dark; font: 16px/1.45 system-ui, sans-serif; }
    body { max-width: 42rem; margin: 4rem auto; padding: 0 1.25rem; }
    .notice { border: 1px solid currentColor; border-radius: .6rem; padding: .8rem 1rem; }
    form { display: grid; gap: 1rem; margin: 1.5rem 0; }
    label { display: grid; gap: .35rem; font-weight: 600; }
    input { box-sizing: border-box; font: inherit; padding: .65rem; width: 100%; }
    button, a { font: inherit; }
    .actions { align-items: center; display: flex; flex-wrap: wrap; gap: .8rem; }
    #field-state { font-family: ui-monospace, monospace; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="notice"><strong>Loopback-only test page.</strong> This server accepts GET/HEAD only, never submits a form, never logs requests, and never receives field values.</p>
  <p>Host: <code>${safeHost}</code></p>
  ${controls(variant)}
  <script>
    (() => {
      const form = document.querySelector('form');
      const username = document.querySelector('[autocomplete="username"]');
      const currentPassword = document.querySelector('[autocomplete="current-password"]');
      const state = document.querySelector('#field-state');
      const update = () => {
        if (!state) return;
        state.textContent = (username && username.value ? 'username filled' : 'username empty')
          + ' · ' + (currentPassword && currentPassword.value ? 'password filled' : 'password empty');
      };
      form?.addEventListener('submit', (event) => {
        event.preventDefault();
        if (state) state.textContent = 'submission blocked locally';
      });
      document.querySelectorAll('input').forEach((input) => input.addEventListener('input', update));
      document.querySelector('#clear')?.addEventListener('click', () => {
        document.querySelectorAll('input').forEach((input) => {
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
      update();
    })();
  </script>
</body>
</html>`;
}

function send(response, statusCode, body, method = 'GET') {
  const payload = Buffer.from(body);
  response.writeHead(statusCode, {
    ...RESPONSE_HEADERS,
    'Content-Length': payload.length,
    'Content-Type': 'text/html; charset=utf-8',
  });
  response.end(method === 'HEAD' ? undefined : payload);
}

export function createGateServer() {
  return http.createServer((request, response) => {
    const method = String(request.method || '').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      request.resume();
      send(response, 405, '<!doctype html><title>Method not allowed</title>', method);
      return;
    }

    const hostname = hostnameFromHeader(request.headers.host);
    const allowed = hostname === LOOPBACK_HOST || hostname === 'localhost'
      || TEST_HOSTS.includes(hostname);
    if (!allowed) {
      send(response, 421, '<!doctype html><title>Misdirected request</title>', method);
      return;
    }

    const requestUrl = new URL(request.url || '/', `http://${request.headers.host}`);
    const variant = requestUrl.pathname === '/signup' ? 'signup'
      : requestUrl.pathname === '/navigated' ? 'navigated'
        : requestUrl.pathname === '/' ? 'index'
          : requestUrl.pathname === '/login' ? 'login' : null;
    if (!variant) {
      send(response, 404, '<!doctype html><title>Not found</title>', method);
      return;
    }
    send(response, 200, buildPage({ variant, host: request.headers.host }), method);
  });
}

export async function startGateServer({ port = DEFAULT_PORT } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('BLANC_1P_GATE_PORT must be an integer from 1 to 65535');
  }
  const server = createGateServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK_HOST, resolve);
  });
  return server;
}

const isEntrypoint = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntrypoint) {
  const port = Number.parseInt(process.env.BLANC_1P_GATE_PORT || `${DEFAULT_PORT}`, 10);
  try {
    await startGateServer({ port });
    console.log('Blanc 1Password live gate is listening on loopback only.');
    for (const hostname of TEST_HOSTS) {
      console.log(`  http://${hostname}:${port}/login`);
    }
    console.log(`  http://exact.localhost:${port}/signup`);
    console.log('Press Ctrl+C to stop. No requests or field values are logged.');
  } catch (error) {
    console.error(`Could not start Blanc 1Password live gate: ${error.message}`);
    process.exitCode = 1;
  }
}
