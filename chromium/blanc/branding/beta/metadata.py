#!/usr/bin/env python3
"""Beta-only outer Info.plist action. No framework/helper version rewriting."""
import argparse
import base64
import json
import plistlib
import re

def metadata(info, version, build):
    if not re.fullmatch(r'2\.0\.0-beta\.[1-9][0-9]*', version):
        raise ValueError('invalid beta version')
    if not 1 <= build <= 9999:
        raise ValueError('invalid beta build')
    result = dict(info)
    result.update(CFBundleIdentifier='me.bnfy.blanc.beta',
                  CFBundleName='Blanc Beta', CFBundleDisplayName='Blanc Beta',
                  CFBundleExecutable='Blanc Beta', CrProductDirName='Blanc Beta',
                  CFBundleShortVersionString=version, CFBundleVersion=str(build),
                  LSMinimumSystemVersion='13.0')
    # tweak_info_plist drops unknown direct-launch schemes. Keep web/document
    # declarations and add only beta's own external launch registration.
    urls = []
    for entry in result.get('CFBundleURLTypes', []):
        entry = dict(entry)
        entry['CFBundleURLSchemes'] = [s for s in entry.get('CFBundleURLSchemes', [])
            if s not in ('chromium', 'google-chrome', 'blanc', 'blanc-beta', '%DIRECT_LAUNCH_URL_SCHEME%')]
        if entry['CFBundleURLSchemes']:
            urls.append(entry)
    urls.append({'CFBundleURLName': 'me.bnfy.blanc.beta', 'CFBundleURLSchemes': ['blanc-beta']})
    result['CFBundleURLTypes'] = urls
    return result

def updater_metadata(info, public_key, arch):
    try:
        key = base64.b64decode(public_key, validate=True)
    except Exception:
        raise ValueError('invalid updater public key') from None
    if len(key) != 32 or not any(key) or base64.b64encode(key).decode() != public_key:
        raise ValueError('invalid updater public key')
    if arch not in ('arm64', 'x64'):
        raise ValueError('invalid updater architecture')
    result = dict(info)
    result.update(SUFeedURL='https://blanc.day/updates/chromium-beta/' + arch + '.xml',
                  SUPublicEDKey=public_key, SUVerifyUpdateBeforeExtraction=True,
                  SUShowReleaseNotes=False, SUAutomaticallyUpdate=False)
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--build', required=True, type=int)
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    with open(args.config) as stream:
        config = json.load(stream)
    with open(args.input, 'rb') as stream:
        result = updater_metadata(metadata(plistlib.load(stream), args.version, args.build), config['public_key'], config['arch'])
    with open(args.output, 'wb') as stream:
        plistlib.dump(result, stream)
