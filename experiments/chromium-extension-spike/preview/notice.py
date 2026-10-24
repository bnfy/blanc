"""Bind the bundled notice to the package being signed, without trusting runtime URLs."""
import datetime
import html
import json
import re
from pathlib import Path

STATUS_URL = 'https://github.com/bnfy/blanc/pull/1028'
SUPPORT_URL = 'mailto:support@blanc.day?subject=Blanc%20Chromium%20Preview'


def build_metadata(version, revision, status=None):
    if not re.fullmatch(r'\d+\.\d+\.\d+\.\d+', version):
        raise ValueError('Invalid Chromium version')
    if not re.fullmatch(r'[a-f0-9]{40}', revision):
        raise ValueError('An exact source revision is required')
    if status is None:
        status = json.loads(Path(__file__).with_name('status.json').read_text())
    if status.get('schemaVersion') != 1 or status.get('status') not in ('not-released', 'withdrawn'):
        raise ValueError('Unsupported preview status; release approval is separate')
    if status.get('statusUrl') != STATUS_URL or status.get('supportUrl') != SUPPORT_URL:
        raise ValueError('Unreviewed preview status or support destination')
    if status.get('maintainer') != 'Anthony Loria':
        raise ValueError('Maintenance owner must match the approved policy')
    return {**status, 'version': version, 'revision': revision,
            'packagedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')}


def stamp_html(source, metadata):
    marker = r'<meta name="blanc-preview-build" content="[^"]*">'
    if len(re.findall(marker, source)) != 1:
        raise ValueError('Expected one preview metadata marker')
    value = html.escape(json.dumps(metadata, separators=(',', ':')), quote=True)
    return re.sub(marker, lambda _: '<meta name="blanc-preview-build" content="' + value + '">', source)
