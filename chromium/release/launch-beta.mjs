// Launches a packaged Blanc Beta once for a release evidence check: a
// loopback page server that records every request, a throwaway HOME (so the
// beta's default folders, Crashpad included, land there and never in the
// owner's real Library), Chromium's mock keychain, and every host but
// loopback resolving to nothing. Returns the request log, whether the
// browser quit on its own before the wait ended, and its exit code.
import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';

export const PRODUCT = 'Blanc Beta';

export async function launchBeta({app, home, args = [], settle = 15000, page = () => '<!doctype html><title>evidence</title>ok'}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(`${req.headers.host} ${req.url}`);
    if (req.url === '/') { res.writeHead(200, {'content-type': 'text/html'}); res.end(page(server.address().port)); }
    else { res.writeHead(204); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const resolved = (typeof args === 'function' ? args(port) : args);
  const browser = spawn(path.join(app, 'Contents/MacOS', PRODUCT), ['--no-first-run', '--no-default-browser-check',
    '--use-mock-keychain', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
    ...resolved, `http://localhost:${port}/`],
  {stdio: 'ignore', env: {...process.env, HOME: home, CFFIXED_USER_HOME: home}});
  let exited = false;
  const exit = new Promise(resolve => browser.once('exit', () => { exited = true; resolve(); }));
  await Promise.race([exit, new Promise(r => setTimeout(r, settle))]);
  const quitOnItsOwn = exited;
  if (!exited) {
    browser.kill('SIGTERM');
    await Promise.race([exit, new Promise(r => setTimeout(r, 10000))]);
    if (!exited) browser.kill('SIGKILL');
  }
  server.close();
  return {requests, quitOnItsOwn, exitCode: browser.exitCode, port};
}
