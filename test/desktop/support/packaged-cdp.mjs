import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const availableLoopbackPort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close((error) => error ? reject(error) : resolve(address.port));
  });
});

/**
 * Launch a hardened packaged Electron binary without Playwright's Electron
 * driver. That driver requires `--inspect=0` in the main process, which Blanc
 * deliberately disables with the NodeCliInspect fuse. Chromium's remote
 * debugging endpoint is sufficient for visible WebContents smoke coverage and
 * leaves the production fuse policy intact.
 */
export async function launchPackagedOverCdp({
  executablePath,
  args = [],
  env = process.env,
  timeoutMs = 20_000,
  launchViaOpen = false,
}) {
  if (launchViaOpen && process.platform !== 'darwin') {
    throw new Error('LaunchServices packaged launch is macOS-only.');
  }
  const port = launchViaOpen ? await availableLoopbackPort() : 0;
  const appSuffix = '.app/Contents/MacOS';
  const appRootIndex = launchViaOpen
    ? executablePath.lastIndexOf(appSuffix)
    : -1;
  if (launchViaOpen && appRootIndex < 0) {
    throw new Error(`Packaged executable is not inside a macOS app bundle: ${executablePath}`);
  }
  const appPath = launchViaOpen
    ? executablePath.slice(0, appRootIndex + '.app'.length)
    : null;
  const command = launchViaOpen ? '/usr/bin/open' : executablePath;
  const commandArgs = launchViaOpen
    ? ['-n', '-W', path.resolve(appPath), '--args', `--remote-debugging-port=${port}`, ...args]
    : ['--remote-debugging-port=0', ...args];
  const child = spawn(command, commandArgs, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let exited = false;
  let exitCode = null;
  child.once('exit', (code, signal) => {
    exited = true;
    exitCode = code ?? signal;
  });

  const endpoint = await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const inspect = (chunk) => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) finish(resolve, match[1]);
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('error', (error) => finish(reject, error));
    child.once('exit', (code, signal) => finish(
      reject,
      new Error(`packaged app exited before CDP was ready (${code ?? signal})\n${output}`),
    ));
    const timer = setTimeout(() => finish(
      reject,
      new Error(`timed out waiting for packaged CDP endpoint\n${output}`),
    ), timeoutMs);
    if (launchViaOpen) {
      const probe = async () => {
        if (settled) return;
        try {
          const response = await fetch(`http://127.0.0.1:${port}/json/version`);
          const info = await response.json();
          if (typeof info.webSocketDebuggerUrl === 'string') {
            finish(resolve, info.webSocketDebuggerUrl);
            return;
          }
        } catch {}
        setTimeout(probe, 100);
      };
      probe();
    }
  });

  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  if (!context) throw new Error(`packaged CDP endpoint exposed no browser context\n${output}`);

  return {
    browser,
    context,
    process: child,
    pages: () => context.pages(),
    output: () => output,
    async close() {
      if (launchViaOpen) {
        // A CDP connection created by connectOverCDP can disconnect without
        // terminating Electron. Send the protocol's explicit close command so
        // a LaunchServices smoke never strands a second signed Blanc process.
        try {
          const session = await browser.newBrowserCDPSession();
          await session.send('Browser.close');
        } catch {}
        await browser.close().catch(() => {});
        for (let i = 0; i < 50 && !exited; i += 1) await delay(100);
        return;
      }
      await browser.close().catch(() => {});
      if (exited) return;
      child.kill('SIGTERM');
      for (let i = 0; i < 50 && !exited; i += 1) await delay(100);
      if (!exited) child.kill('SIGKILL');
      for (let i = 0; i < 20 && !exited; i += 1) await delay(100);
      if (!exited) throw new Error(`packaged app would not exit\n${output}`);
      if (typeof exitCode === 'number' && exitCode !== 0) {
        throw new Error(`packaged app exited with ${exitCode}\n${output}`);
      }
    },
  };
}
