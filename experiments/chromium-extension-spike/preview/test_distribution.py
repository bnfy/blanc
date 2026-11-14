import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('distribution', Path(__file__).with_name('distribution.py'))
distribution = importlib.util.module_from_spec(spec)
spec.loader.exec_module(distribution)

class DistributionTests(unittest.TestCase):
    def layout(self, root):
        browser = root / 'Contents/MacOS/Blanc Prototype'
        framework = root / 'Contents/Frameworks/Blanc Prototype Framework.framework/Versions/157.0.8103.15/Blanc Prototype Framework'
        for file in [browser, framework]:
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(b'ordinary native content')
        return browser, framework

    def test_absent_hooks_and_version_symlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.layout(root)
            versions = root / 'Contents/Frameworks/Blanc Prototype Framework.framework/Versions'
            (versions / 'Current').symlink_to('157.0.8103.15')
            distribution.verify_distribution(root)

    def test_research_markers_in_either_binary_are_refused_across_chunks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for marker in distribution.FORBIDDEN:
                for index in [0, 1]:
                    files = self.layout(root)
                    files[index].write_bytes(b'x' * (1024 * 1024 - 4) + marker + b'end')
                    with self.subTest(marker=marker, binary=index), self.assertRaises(ValueError):
                        distribution.verify_distribution(root)

    def test_missing_framework_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _, framework = self.layout(root)
            framework.unlink()
            with self.assertRaises(ValueError):
                distribution.verify_distribution(root)

    def test_packaged_launcher_rejects_all_blanc_overrides_before_exec(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = root / 'Preview.app/Contents/MacOS'
            folder.mkdir(parents=True)
            launcher = folder / 'Blanc Preview Launcher'
            subprocess.run(['xcrun', 'clang', '-Wall', '-Wextra', '-Werror',
                            str(Path(__file__).with_name('launcher.c')), '-o', str(launcher)], check=True)
            native = folder / 'Blanc Prototype'
            marker = root / 'executed'
            native.write_text('#!/bin/sh\ntouch "' + str(marker) + '"\n')
            native.chmod(0o700)
            for flag in ['--blanc-ubo-reload-probe', '--blanc-worker-update-log=x',
                         '--blanc-blocker-assets=x', '--blanc-prototype-assets=x',
                         '--blanc-renderer-token-mismatch-probe']:
                result = subprocess.run([str(launcher), flag])
                self.assertEqual(result.returncode, 64)
                self.assertFalse(marker.exists())
            self.assertEqual(subprocess.run([str(launcher), '--user-data-dir=' + str(root / 'profile')]).returncode, 0)
            self.assertTrue(marker.exists())

if __name__ == '__main__':
    unittest.main()
