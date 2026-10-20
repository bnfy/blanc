#!/usr/bin/env python3
"""Read-only, configuration-pinned inventory of modifications to upstream files."""
import argparse
import ast
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

DIFF_OPTIONS = [
    '--unified=0', '--inter-hunk-context=0', '--diff-algorithm=myers',
    '--no-indent-heuristic', '--no-renames', '--no-ext-diff', '--no-textconv',
    '--no-color', '--src-prefix=a/', '--dst-prefix=b/',
]


def check_dependencies(src, git_at):
    """Refuse partial totals when any resolved gclient Git dependency is dirty."""
    manifest = src.parent / '.gclient_entries'
    tree = ast.parse(manifest.read_text())
    if (len(tree.body) != 1 or not isinstance(tree.body[0], ast.Assign)
            or len(tree.body[0].targets) != 1
            or not isinstance(tree.body[0].targets[0], ast.Name)
            or tree.body[0].targets[0].id != 'entries'):
        raise ValueError('Expected a literal entries assignment in .gclient_entries')
    entries = ast.literal_eval(tree.body[0].value)
    if not isinstance(entries, dict) or src.name not in entries:
        raise ValueError('gclient entries do not include this source root')
    checked, packages, failures = [], [], []
    for name, url in sorted(entries.items()):
        if not isinstance(name, str) or not isinstance(url, str):
            raise ValueError('Malformed gclient entry')
        if name == src.name:
            continue
        # These are downloaded assets/tool packages, not Git checkouts.
        if url.startswith(('gs://', 'https://chrome-infra-packages.appspot.com/')):
            packages.append(name)
            continue
        match = re.search(r'@([0-9a-f]{40})$', url)
        root = (src.parent / name).resolve()
        if not match or not root.is_relative_to(src) or root == src:
            raise ValueError(f'Unpinned or out-of-tree Git dependency: {name}')
        if not (root / '.git').exists():
            failures.append(f'{name}: missing Git checkout')
            continue
        pin = match.group(1)
        head = git_at(root, 'rev-parse', 'HEAD').decode().strip()
        status = git_at(root, '-c', 'core.fsmonitor=false', 'status',
                        '--porcelain=v1', '-z', '--untracked-files=all',
                        '--ignore-submodules=none')
        if head != pin:
            failures.append(f'{name}: HEAD {head} differs from gclient pin {pin}')
        if status:
            failures.append(f'{name}: local changes: {os.fsdecode(status).replace(chr(0), "; ")}')
        checked.append({'path': name, 'revision': pin})
    if failures:
        raise ValueError('Dependency inventory is incomplete; no budget result: ' +
                         ' | '.join(failures))
    return {'policy': 'Fail closed on changed, missing or revision-drifted Git dependencies; '
                      'pins from the resolved gclient sync manifest, not re-evaluated DEPS.',
            'manifest_sha256': hashlib.sha256(manifest.read_bytes()).hexdigest(),
            'clean_git_checkouts': checked, 'non_git_entries_excluded': packages}


def inventory(src, upstream):
    src = Path(src).resolve()
    env = dict(os.environ, GIT_CONFIG_GLOBAL='/dev/null', GIT_CONFIG_NOSYSTEM='1',
               GIT_OPTIONAL_LOCKS='0', LC_ALL='C')
    # Ignore command-level config supplied by a surrounding process too.
    for key in list(env):
        if key in ('GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT') or key.startswith(
                ('GIT_CONFIG_KEY_', 'GIT_CONFIG_VALUE_')):
            del env[key]

    def git_at(root, *args):
        return subprocess.check_output(['git', '-C', str(root), *args], env=env)

    def git(*args):
        return git_at(src, *args)

    revision = git('rev-parse', '--verify', upstream + '^{commit}').decode().strip()
    if git('diff', '--no-ext-diff', '--no-textconv', revision, '--', 'DEPS'):
        raise ValueError('DEPS changed: dependency pins must be re-audited before counting')
    dependencies = check_dependencies(src, git_at)
    upstream_paths = set(git('ls-tree', '-r', '--name-only', '-z', revision).split(b'\0'))
    changed = git('diff', '--name-only', '-z', '--no-renames', '--no-ext-diff',
                  '--no-textconv', revision, '--').split(b'\0')
    files, excluded = [], []
    for raw in sorted(filter(None, changed)):
        path = os.fsdecode(raw)
        if raw not in upstream_paths:
            excluded.append(path)
            continue
        before = git('show', f'{revision}:{path}')
        target = src / path
        if target.is_symlink():
            after = os.fsencode(os.readlink(target))
        else:
            after = target.read_bytes() if target.exists() else b''
        binary = b'\0' in before[:8000] or b'\0' in after[:8000]
        patch = git('diff', *DIFF_OPTIONS, *([] if binary else ['--text']),
                    revision, '--', path)
        attrs = git('check-attr', '-z', 'diff', 'binary', '--', path).split(b'\0')
        attributes = {os.fsdecode(attrs[i+1]): os.fsdecode(attrs[i+2])
                      for i in range(0, len(attrs)-1, 3)}
        files.append({'path': path, 'binary': binary, 'attributes': attributes,
                      'hunks': int(before != after) if binary else len(re.findall(rb'^@@ ', patch, re.M)),
                      'patch_sha256': hashlib.sha256(patch).hexdigest()})
    return {
        'schema': 2, 'observed_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'upstream_commit': revision, 'git_version': git('--version').decode().strip(),
        'diff_options': DIFF_OPTIONS, 'upstream_files': len(files),
        'hunks': sum(f['hunks'] for f in files), 'files': files,
        'excluded_new_tracked_files': excluded, 'dependencies': dependencies,
        'binary_detection': 'NUL in the first 8000 bytes of either upstream or working-tree content; --text for text diffs',
        'policy': 'Existing upstream paths only; untracked/new Blanc files excluded; '
                  'binary change = one hunk; mode-only = zero hunks; renames disabled.',
        'budget': {'upstream_files': 52, 'hunks': 124},
        'within_budget': len(files) <= 52 and sum(f['hunks'] for f in files) <= 124,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('src', type=Path)
    parser.add_argument('--upstream', required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    try:
        result = inventory(args.src, args.upstream)
    except (OSError, ValueError, SyntaxError, subprocess.CalledProcessError) as error:
        parser.exit(2, f'Inventory refused: {error}\n')
    rendered = json.dumps(result, indent=2) + '\n'
    if args.output:
        args.output.write_text(rendered)
    else:
        print(rendered, end='')
    raise SystemExit(0 if result['within_budget'] else 1)
