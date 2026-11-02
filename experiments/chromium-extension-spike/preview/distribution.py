"""Reject native research-hook artifacts before staging a distributable app."""
from pathlib import Path

FORBIDDEN = (b'blanc-ubo-', b'blanc-worker-update-log',
             b'blanc-renderer-token-mismatch-probe', b'blanc-blocker-log')

def verify_distribution(source):
    source = Path(source)
    binaries = [source / 'Contents/MacOS/Blanc Prototype']
    binaries += list((source / 'Contents/Frameworks').glob(
        '*.framework/Versions/*/Blanc Prototype Framework'))
    binaries = list({path.resolve() for path in binaries})
    if len(binaries) != 2 or any(not path.is_file() for path in binaries):
        raise ValueError('Expected one browser executable and one native framework')
    for path in binaries:
        with path.open('rb') as stream:
            carry = b''
            while True:
                block = stream.read(1024 * 1024)
                if not block:
                    break
                text = carry + block
                if any(marker in text for marker in FORBIDDEN):
                    raise ValueError('Native research hooks cannot be packaged: ' + str(path))
                carry = text[-max(map(len, FORBIDDEN)):]
