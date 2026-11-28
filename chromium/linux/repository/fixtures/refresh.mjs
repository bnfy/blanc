import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import worker from '../worker/index.mjs';
import {publishTree} from '../worker/upload.mjs';
import {MemoryBucket} from './memory-bucket.mjs';

const exec = promisify(execFile);
const arch = 'rpm/stable/x86_64';

export async function exercisePackageManagers(dir) {
  await exec('bash', [fileURLToPath(new URL('build-generations.sh', import.meta.url)), dir], {maxBuffer: 4 * 1024 * 1024});
  const manifests = {};
  for (const n of [2, 3]) manifests[n] = JSON.parse(await readFile(path.join(dir, 'signed' + n, 'signed-tree.json')));
  for (const client of ['apt', 'dnf']) {
    const bucket = new MemoryBucket();
    let origin;
    const readBack = key => worker.fetch(new Request(origin + '/' + key), {PACKAGES: bucket});
    const publish = n => publishTree(bucket, path.join(dir, 'signed' + n), manifests[n], {
      target: 'staging', generation: n, readBack,
    });
    const requests = [];
    let switched = false;
    let failure;
    const server = createServer(async (req, res) => {
      try {
        const key = req.url.slice(1);
        requests.push(key);
        const response = await readBack(key);
        // Finish publishing N+1 after resolving N's root metadata, before the next client request.
        if (!switched && (key.endsWith('/InRelease') || key.endsWith('/repomd.xml'))) {
          switched = true;
          await publish(3);
        }
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (e) {
        failure = e;
        res.writeHead(500).end();
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    origin = 'http://127.0.0.1:' + server.address().port;
    try {
      await publish(2);
      const home = path.join(dir, client);
      await mkdir(home);
      let command, args;
      const key = path.join(dir, 'linux/keys/blanc-repository.asc');
      if (client === 'apt') {
        await mkdir(home + '/lists/partial', {recursive: true});
        await mkdir(home + '/empty');
        await writeFile(home + '/sources.list', `deb [arch=amd64 signed-by=${key}] ${origin}/deb stable main\n`);
        command = 'apt-get';
        args = ['-o', 'Dir::Etc::sourcelist=' + home + '/sources.list', '-o', 'Dir::Etc::sourceparts=' + home + '/empty',
          '-o', 'Dir::State::lists=' + home + '/lists', '-o', 'Dir::Cache=' + home,
          '-o', 'APT::Architecture=amd64', '-o', 'APT::Sandbox::User=' + (process.env.USER || 'root'),
          '-o', 'APT::Update::Error-Mode=any', '-o', 'Acquire::Languages=none',
          // The runner's apt forces IPv4 (scripts/ci-apt-mirror.sh). In this
          // loopback-only namespace glibc then finds no IPv4 address to use and
          // apt can't resolve even 127.0.0.1, so this run lets apt choose.
          '-o', 'Acquire::ForceIPv4=false', 'update'];
      } else {
        const repos = home + '/repos';
        await mkdir(repos);
        await mkdir(home + '/logs');
        await writeFile(repos + '/blanc.repo', [
          '[blanc]', 'name=Blanc fixture', 'enabled=1', 'skip_if_unavailable=0', 'gpgcheck=1',
          'repo_gpgcheck=1', 'gpgkey=file://' + key, 'mirrorlist=' + origin + '/' + arch + '/mirrorlist',
        ].join('\n') + '\n');
        command = 'dnf';
        args = ['-y', '--noplugins', '--releasever=1', '--installroot=' + home,
          '--setopt=reposdir=' + repos, '--setopt=cachedir=' + home + '/cache',
          '--setopt=persistdir=' + home + '/persist', '--setopt=logdir=' + home + '/logs', '--refresh', 'makecache'];
      }
      for (let i = 0; i < 3; i++) {
        const {stdout, stderr} = await exec(command, args, {env: {...process.env, LC_ALL: 'C'}});
        assert.doesNotMatch(stdout + stderr, /hash sum mismatch|bad signature|gpg.*error|failed to download/i);
      }
      assert.ifError(failure);
      assert.ok(switched, client + ' fetched root metadata');
      if (client === 'apt') {
        assert.ok(requests.filter(p => p.includes('/by-hash/')).length >= 2, requests.join('\n'));
      } else {
        for (const n of [2, 3]) {
          assert.ok(requests.includes(`generations/${n}/${arch}/repodata/repomd.xml.asc`), requests.join('\n'));
        }
      }
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
}

