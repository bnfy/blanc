#!/usr/bin/env python3
"""Pinned native Electron build. Does not install, sign, or publish Blanc.

Run on each native target; gclient supplies upstream's pinned toolchains and
dependencies. The build directory belongs to this script, not to the app repo.
Long-running phases stop before consuming the host's last 20 GiB of disk.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import signal
import subprocess
import sys
import time
import tempfile

HERE = Path(__file__).resolve().parent
LOCK = json.loads((HERE / 'source.json').read_text())
RESERVE = 20 * 1024**3


def sha256(file):
    h = hashlib.sha256()
    with open(file, 'rb') as src:
        for chunk in iter(lambda: src.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def run(argv, cwd, env=None):
    print('+ ' + ' '.join(map(str, argv)), flush=True)
    windows = sys.platform == 'win32'
    child = subprocess.Popen(list(map(str, argv)), cwd=cwd, env=env,
                             start_new_session=not windows)
    try:
        while child.poll() is None:
            if shutil.disk_usage(cwd).free < RESERVE:
                raise RuntimeError('Build paused: less than 20 GiB free. Add build capacity before retrying.')
            time.sleep(2)
        if child.returncode:
            raise RuntimeError(f'Command failed ({child.returncode}): {argv[0]}')
    finally:
        if child.poll() is None:
            if windows:
                subprocess.run(['taskkill', '/pid', str(child.pid), '/T', '/F'], check=False)
            else:
                os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
            child.wait()


def git_head(directory):
    return subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=directory, text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True, type=Path)
    parser.add_argument('--stage', choices=['sync', 'build', 'package'], required=True)
    parser.add_argument('--jobs', type=int, default=4)
    args = parser.parse_args()
    root = args.root.resolve()
    if ' ' in str(root) or args.jobs < 1:
        parser.error('Use a build path without spaces and a positive job count.')
    root.mkdir(parents=True, exist_ok=True)
    if root == HERE or HERE in root.parents:
        parser.error('Source/output must live outside runtime/electron.')
    for patch in LOCK['patches']:
        if sha256(HERE / patch['file']) != patch['sha256']:
            raise RuntimeError('Pinned runtime patch hash mismatch')
    depot = root / 'depot_tools'
    env = dict(os.environ)
    env.update(DEPOT_TOOLS_UPDATE='0', DEPOT_TOOLS_WIN_TOOLCHAIN='0', GIT_LFS_SKIP_SMUDGE='1')
    env['PATH'] = str(depot) + os.pathsep + env.get('PATH', '')
    if args.stage == 'sync':
        if not (root / 'src').exists() and shutil.disk_usage(root).free < 80 * 1024**3:
            raise RuntimeError('A fresh sync requires at least 80 GiB free, with a 20 GiB reserve during work.')
        if not depot.exists():
            run(['git', 'init', depot], root)
            run(['git', 'remote', 'add', 'origin', 'https://chromium.googlesource.com/chromium/tools/depot_tools.git'], depot)
            run(['git', 'fetch', '--depth=1', 'origin', LOCK['depotToolsCommit']], depot)
            run(['git', 'checkout', '--detach', 'FETCH_HEAD'], depot)
        if git_head(depot) != LOCK['depotToolsCommit']:
            raise RuntimeError('Unexpected depot_tools revision; use a separate build root')
        config = ('solutions = [{"name": "src/electron", "url": '
                  '"https://github.com/electron/electron", "managed": False, '
                  '"custom_deps": {}, "custom_vars": {}}]\n')
        gclient_file = root / '.gclient'
        if gclient_file.exists() and gclient_file.read_text() != config:
            raise RuntimeError('Refusing to replace an unrelated .gclient configuration')
        gclient_file.write_text(config)
        command = 'gclient.bat' if sys.platform == 'win32' else 'gclient'
        run([depot / command, 'sync', '--no-history', '--revision',
             'src/electron@' + LOCK['electronCommit'], '--revision', 'src@' + LOCK['chromiumCommit'], '-j', args.jobs], root, env)
    source = root / 'src' / 'electron'
    if git_head(source) != LOCK['electronCommit']:
        raise RuntimeError('Electron source commit differs from source.json')
    for patch in LOCK['patches']:
        patch_path = HERE / patch['file']
        applied = subprocess.run(['git', 'apply', '--reverse', '--check', patch_path],
                                 cwd=source, capture_output=True).returncode == 0
        if not applied:
            run(['git', 'apply', '--check', patch_path], source)
            run(['git', 'apply', patch_path], source)
    if args.stage == 'sync':
        print('Pinned source synced and capture patch applied; binary not yet built.', flush=True)
        return
    # Require precisely the reviewed diff, not an arbitrary modified runtime.
    changed = subprocess.check_output(['git', 'diff', 'HEAD', '--name-only'], cwd=source, text=True).splitlines()
    if changed != ['shell/browser/web_contents_permission_helper.cc']:
        raise RuntimeError('Unexpected runtime source changes')
    # Reverse the patch in memory and compare to the pinned source. Matching
    # a filename alone would permit unrelated edits inside that same file.
    original = subprocess.check_output(['git', 'show', 'HEAD:shell/browser/web_contents_permission_helper.cc'], cwd=source)
    with tempfile.TemporaryDirectory(prefix='blanc-patch-verify-') as check:
        check_path = Path(check) / 'shell/browser/web_contents_permission_helper.cc'
        check_path.parent.mkdir(parents=True)
        check_path.write_bytes(original)
        for patch in LOCK['patches']:
            run(['git', 'apply', HERE / patch['file']], Path(check))
        if check_path.read_bytes() != (source / 'shell/browser/web_contents_permission_helper.cc').read_bytes():
            raise RuntimeError('Runtime source differs from the exact approved patch')
    if not (depot / 'python3_bin_reldir.txt').exists():
        if sys.platform == 'win32':
            run([depot / 'bootstrap' / 'win_tools.bat'], depot, env)
        else:
            env['DEPOT_TOOLS_BOOTSTRAP_PYTHON3'] = '1'
            run([depot / 'ensure_bootstrap'], depot, env)
    # Upstream GN registers packed-refs as an input even in a fresh shallow clone.
    run(['git', 'pack-refs', '--all'], source)
    out = root / 'src' / 'out' / 'BlancRelease'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'args.gn').write_text(LOCK['gnArgs'])
    gn = 'gn.bat' if sys.platform == 'win32' else 'gn'
    ninja = 'autoninja.bat' if sys.platform == 'win32' else 'autoninja'
    run([depot / gn, 'gen', out], root / 'src', env)
    # Compile the authorization patch early so errors do not surface only
    # after the rest of Chromium has finished its first full build.
    run([depot / ninja, '-C', out, '-j', args.jobs,
         'obj/electron/electron_lib/web_contents_permission_helper' +
         ('.obj' if sys.platform == 'win32' else '.o')], root / 'src', env)
    target = 'electron:electron_dist_zip' if args.stage == 'package' else 'electron'
    run([depot / ninja, '-C', out, '-j', args.jobs, target], root / 'src', env)
    if args.stage == 'package':
        archive = out / 'dist.zip'
        if not archive.is_file():
            raise RuntimeError('electron_dist_zip did not produce out/BlancRelease/dist.zip')
        record = {**LOCK, 'platform': sys.platform, 'machine': platform.machine(),
                  'archiveSha256': sha256(archive), 'archive': archive.name}
        (out / 'blanc-runtime-build.json').write_text(json.dumps(record, indent=2) + '\n')
        print('Built runtime and provenance record; native capture validation remains required.', flush=True)


if __name__ == '__main__':
    main()
