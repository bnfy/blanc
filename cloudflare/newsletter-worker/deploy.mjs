import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const WORKER_DIR = path.dirname(fileURLToPath(import.meta.url));
const RESEND_API = 'https://api.resend.com/domains';

function senderHostFromWrangler(source) {
  const from = source.match(/^NEWSLETTER_FROM\s*=\s*"[^"]*<[^@<>]+@([^<>]+)>"\s*$/m)?.[1]
    ?? source.match(/^NEWSLETTER_FROM\s*=\s*"[^@"]+@([^"<>]+)"\s*$/m)?.[1];
  if (!from) throw new Error('Could not parse NEWSLETTER_FROM from wrangler.toml');
  return from.toLowerCase();
}

export function assertVerifiedDomain(domain, senderHost) {
  if (!domain || domain.status !== 'verified' || typeof domain.name !== 'string') {
    throw new Error('Resend domain is not verified; refusing newsletter Worker deploy');
  }
  const verified = domain.name.toLowerCase();
  if (senderHost !== verified && !senderHost.endsWith(`.${verified}`)) {
    throw new Error(`NEWSLETTER_FROM host ${senderHost} is outside verified Resend domain ${verified}`);
  }
}

async function main() {
  // Keep the Worker's send-only key least-privileged. Resend's domain lookup
  // requires a full-access key, which is used locally for this preflight only
  // and is never installed as a Worker secret.
  const apiKey = process.env.RESEND_DEPLOY_API_KEY;
  const domainId = process.env.RESEND_DOMAIN_ID;
  if (!apiKey || !domainId) {
    throw new Error('RESEND_DEPLOY_API_KEY and RESEND_DOMAIN_ID are required for verified deploy');
  }

  const senderHost = senderHostFromWrangler(
    readFileSync(path.join(WORKER_DIR, 'wrangler.toml'), 'utf8')
  );
  const response = await fetch(`${RESEND_API}/${encodeURIComponent(domainId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Could not verify Resend domain status (HTTP ${response.status})`);
  }
  assertVerifiedDomain(await response.json(), senderHost);

  const deployed = spawnSync('npx', ['wrangler', 'deploy'], {
    cwd: WORKER_DIR,
    env: process.env,
    stdio: 'inherit',
  });
  if (deployed.error) throw deployed.error;
  if (deployed.status !== 0) process.exitCode = deployed.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
