#!/usr/bin/env python3
"""Read-only, configuration-pinned inventory of modifications to upstream files."""
import argparse
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


def inventory(src, upstream):
    env = dict(os.environ, GIT_CONFIG_GLOBAL='/dev/null', GIT_CONFIG_NOSYSTEM='1',
               GIT_OPTIONAL_LOCKS='0', LC_ALL='C')
    # Ignore command-level config supplied by a surrounding process too.
    for key in list(env):
        if key in ('GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT') or key.startswith(
                ('GIT_CONFIG_KEY_', 'GIT_CONFIG_VALUE_')):
            del env[key]

    def git(*args):
        return subprocess.check_output(['git', '-C', str(src), *args], env=env)

    revision = git('rev-parse', '--verify', upstream + '^{commit}').decode().strip()
    upstream_paths = set(git('ls-tree', '-r', '--name-only', '-z', revision).split(b'\0'))
    changed = git('diff', '--name-only', '-z', '--no-renames', '--no-ext-diff',
                  '--no-textconv', revision, '--').split(b'\0')
    files, excluded = [], []
    for raw in sorted(filter(None, changed)):
        path = os.fsdecode(raw)
        if raw not in upstream_paths:
            excluded.append(path)
            continue
        patch = git('diff', *DIFF_OPTIONS, revision, '--', path)
        binary = re.search(rb'^Binary files .* differ$', patch, re.M) is not None
        files.append({'path': path, 'binary': binary,
                      'hunks': 1 if binary else len(re.findall(rb'^@@ ', patch, re.M)),
                      'patch_sha256': hashlib.sha256(patch).hexdigest()})
    return {
        'schema': 1, 'observed_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'upstream_commit': revision, 'git_version': git('--version').decode().strip(),
        'diff_options': DIFF_OPTIONS, 'upstream_files': len(files),
        'hunks': sum(f['hunks'] for f in files), 'files': files,
        'excluded_new_tracked_files': excluded,
        'policy': 'Existing upstream paths only; untracked/new Blanc files excluded; '
                  'binary change = one hunk; mode-only = zero hunks; renames disabled.',
        'budget': {'upstream_files': 40, 'hunks': 120},
        'within_budget': len(files) <= 40 and sum(f['hunks'] for f in files) <= 120,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('src', type=Path)
    parser.add_argument('--upstream', required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = inventory(args.src, args.upstream)
    rendered = json.dumps(result, indent=2) + '\n'
    if args.output:
        args.output.write_text(rendered)
    else:
        print(rendered, end='')
