"""Launcher path isolation tests; the browser is a harmless argv printer."""
import os
import pathlib
import subprocess
import tempfile
import unittest

class LauncherTests(unittest.TestCase):
    def test_paths_and_reserved_asset_arguments(self):
        with tempfile.TemporaryDirectory(prefix='blanc-launcher-') as tmp:
            root = pathlib.Path(tmp)
            mac = root / 'Relocated Preview.app/Contents/MacOS'
            mac.mkdir(parents=True)
            browser = mac / 'Blanc Prototype'
            browser.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n')
            browser.chmod(0o755)
            exe = mac / 'Launcher'
            subprocess.run(['xcrun', 'clang', '-Wall', '-Wextra', '-Werror',
                            str(pathlib.Path(__file__).with_name('launcher.c')),
                            '-o', str(exe)], check=True)
            env = {**os.environ, 'HOME': str(root / 'clean-home')}
            args = subprocess.check_output([str(exe)], env=env, text=True).splitlines()
            self.assertIn('--user-data-dir=' + env['HOME'] + '/Library/Application Support/Blanc Chromium Preview', args)
            self.assertTrue(any('/Contents/Resources/BlancAssets' in arg for arg in args))
            self.assertFalse(any('/../' in arg for arg in args))
            for flag in ['--blanc-prototype-assets=/tmp/foreign', '--blanc-blocker-assets=/tmp/foreign']:
                self.assertEqual(subprocess.run([str(exe), flag], env=env).returncode, 64)
            env['HOME'] = 'relative'
            self.assertEqual(subprocess.run([str(exe)], env=env).returncode, 70)

if __name__ == '__main__':
    unittest.main()
