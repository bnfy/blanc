#!/usr/bin/env python3
"""Read-only source disposition capture; does not run or build Chromium."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

src, repo, out = map(Path, sys.argv[1:])
selections = {
    'chrome/browser/chrome_content_browser_client.cc': [(6885, 6900), (7045, 7150)],
    'content/browser/websockets/websocket_connector_impl.cc': [(105, 172)],
    'content/browser/webtransport/web_transport_connector_impl.cc': [(275, 355)],
    'content/browser/preloading/prefetch/prefetch_url_loader_factory_utils.cc': [(45, 185)],
    'content/public/common/content_features.cc': [(842, 855)],
    'content/browser/preloading/prefetch/prefetch_features.cc': [(104, 109)],
    'content/browser/preloading/prefetch/prefetch_service.cc': [(502, 575)],
    'content/browser/preloading/prefetch/pre_prefetch_service_impl.cc': [(310, 340)],
    'android_webview/browser/prefetch/aw_prefetch_manager.cc': [(175, 201), (420, 441)],
}
def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()

def entry(root, name, ranges):
    data = (root / name).read_bytes()
    lines = data.decode().splitlines()
    return {'path': name, 'sha256': hashlib.sha256(data).hexdigest(),
            'bytes': len(data), 'excerpts': [
                {'first_line': a, 'last_line': b,
                 'text': '\n'.join(lines[a-1:b])} for a, b in ranges]}

query = ['rg', '-n', 'PrePrefetchService::Create|StartPrePrefetchRequest\\(',
         'chrome/browser', 'android_webview/browser', 'content/browser',
         '--glob', '*.cc', '--glob', '!**/*test*',
         '--glob', '!**/pre_prefetch_service_impl.cc']
result = {
    'kind': 'source-only; zero runtime acceptance claims',
    'chromium_head': git(src, 'rev-parse', 'HEAD'),
    'prototype_parent': git(repo, 'rev-parse', 'HEAD'),
    'chromium_selected_status': git(src, 'status', '--short', '--', *selections),
    'sources': [entry(src, p, r) for p, r in selections.items()],
    'adapter': entry(repo, 'experiments/chromium-extension-spike/native/blocker/blocker_proxy.cc', [(492, 510)]),
    'caller_search': {'argv': query, 'scope': 'listed trees only; excludes test filenames',
                      'output': subprocess.check_output(query, cwd=src, text=True)},
}
out.write_text(json.dumps(result, indent=2) + '\n')
