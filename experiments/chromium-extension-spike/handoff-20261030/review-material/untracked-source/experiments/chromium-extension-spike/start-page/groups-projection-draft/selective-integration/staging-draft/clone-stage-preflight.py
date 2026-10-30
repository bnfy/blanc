"""Read-only nine-target state classifier. Not a staging or rollback tool.

Its caller must independently prove workspace identity, isolation, quiescence
and receipt provenance. Hash classification alone never authorizes mutation.
"""
import hashlib
import os
import pathlib
import stat

UI = 'chrome/browser/ui/blanc_prototype_ui.cc'
GN = 'chrome/browser/ui/views/frame/BUILD.gn'
MODULES = {
    'custom_template.cc': 'cfecac0516a96d6eb62f9ed0f0171dccb3f9ac12747a652fc600a7c516277c0c',
    'custom_template.h': 'd5e4d9e602a7fd74c604a6bfb44da5305e1402b828ecd9df8f080d30d10454ca',
    'selected_custom.cc': 'f0adf7f8298beefa82f6662fdc22bda965fe505d6356e91e7a21baa277beba40',
    'selected_custom.h': '9ab2ad9c99cf640cef07947f4ec9782bf6a28a0d94e22f47b1cdc3a5d03e6e92',
    'selected_shipping.cc': 'a3ec9e9244ae62205994c9e475ab85046479c661cb9419222d045c1b924e194d',
    'selected_shipping.h': '22cf60920620ed482df8286f9399feba8b595949805db6cdd4139a451147b7ee',
    'selected_shipping_browser.cc': '950d071452d53421a68f9887eb65226c8919c31bfa9536b92e81c258cf08a882',
}
SPEC = {
    UI: ('ab7da9ea16b821746b22f1fb1fa66f9cd86aa7b9b2638432e3c95dc1a0294abf',
         'e8cd2e37af0aeaf73f55d2afeee5afc10344fbb170dd444d68238aadcd67a76e'),
    GN: ('b663b8814097f9d6c9fdb7b6e8103c6d32955c390b86ed185e2dbbbc1fc7f4f1',
         'f5015b3be510c840a2956d30cb2d418e8f561411902fec0fa8e53b2958ffb219'),
    **{'chrome/browser/ui/modules/' + name: (None, digest) for name, digest in MODULES.items()},
}

def _read_regular(root, relative):
    parts = pathlib.PurePosixPath(relative).parts
    if not parts or any(p in ('', '.', '..') for p in parts) or relative.startswith('/'):
        raise ValueError('invalid relative path')
    current = pathlib.Path(root)
    st = current.lstat()
    if not stat.S_ISDIR(st.st_mode) or stat.S_ISLNK(st.st_mode):
        raise ValueError('unsafe root')
    for part in parts[:-1]:
        current = current / part
        try:
            st = current.lstat()
        except FileNotFoundError:
            return None
        if not stat.S_ISDIR(st.st_mode) or stat.S_ISLNK(st.st_mode):
            raise ValueError('unsafe ancestor')
    target = current / parts[-1]
    try:
        before = target.lstat()
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(before.st_mode) or stat.S_ISLNK(before.st_mode):
        raise ValueError('unsafe file type')
    fd = os.open(target, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(fd)
        if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
            raise ValueError('file identity changed')
        h = hashlib.sha256()
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
        after = os.fstat(fd)
        fields = ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
        if any(getattr(opened, k) != getattr(after, k) for k in fields):
            raise ValueError('file changed during read')
        return {'sha256': h.hexdigest(), 'device': after.st_dev, 'inode': after.st_ino,
                'size': after.st_size, 'mode': stat.S_IMODE(after.st_mode),
                'mtime_ns': after.st_mtime_ns, 'ctime_ns': after.st_ctime_ns}
    finally:
        os.close(fd)

def classify(root, spec=SPEC):
    """Return snapshots for before/after states; reject any foreign state.

    This is only diagnostic: an after-state hash does not establish ownership
    for rollback, and a missing ancestor does not prove creation is safe.
    """
    result = {}
    for relative, (before, after) in spec.items():
        if before == after:
            raise ValueError('ambiguous state')
        actual = _read_regular(root, relative)
        digest = actual['sha256'] if actual else None
        if digest == before:
            state = 'before'
        elif digest == after:
            state = 'after'
        else:
            raise ValueError('foreign state: ' + relative)
        result[relative] = {'state': state, 'identity': actual}
    return result

def all_preimages_present(snapshot, spec=SPEC):
    """Pure completeness check; it is not an authorization decision."""
    return (bool(spec) and set(snapshot) == set(spec) and
            all(x['state'] == 'before' for x in snapshot.values()))
