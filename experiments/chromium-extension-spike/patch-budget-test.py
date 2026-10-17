import importlib.util
from pathlib import Path
import subprocess
import tempfile
import sys
import unittest

spec = importlib.util.spec_from_file_location('budget', Path(__file__).with_name('patch-budget.py'))
budget = importlib.util.module_from_spec(spec)
spec.loader.exec_module(budget)


class BudgetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'src'
        self.root.mkdir()
        self.entries = {'src': 'https://example.invalid/src.git'}
        self.write_entries()
        self.git('init', '-q')
        self.git('config', 'user.name', 'Fixture')
        self.git('config', 'user.email', 'fixture@example.invalid')
        (self.root / 'text').write_text('one\nkeep\nthree\n')
        (self.root / 'binary').write_bytes(b'\x00before')
        self.git('add', '.')
        self.git('commit', '-qm', 'pristine')

    def write_entries(self):
        (self.root.parent / '.gclient_entries').write_text('entries = ' + repr(self.entries))

    def dependency(self):
        dep = self.root / 'nested'
        dep.mkdir()
        def git(*args):
            return subprocess.check_output(['git', '-C', str(dep), *args])
        git('init', '-q')
        git('config', 'user.name', 'Fixture')
        git('config', 'user.email', 'fixture@example.invalid')
        (dep / 'file').write_text('original')
        git('add', '.')
        git('commit', '-qm', 'pinned')
        pin = git('rev-parse', 'HEAD').decode().strip()
        self.entries['src/nested'] = 'https://example.invalid/dep.git@' + pin
        self.write_entries()
        return dep, git

    def test_attributes_cannot_hide_text_hunks(self):
        (self.root / 'text').write_text('ONE\nkeep\nTHREE\n')
        for attr in ('-diff', 'binary', 'diff=custom'):
            (self.root / '.gitattributes').write_text('text ' + attr + '\n')
            result = budget.inventory(self.root, 'HEAD')
            row = next(f for f in result['files'] if f['path'] == 'text')
            self.assertFalse(row['binary'])
            self.assertEqual(row['hunks'], 2)
            self.assertNotEqual(row['attributes']['diff'], 'unspecified')

    def test_text_attribute_cannot_hide_binary_change(self):
        (self.root / '.gitattributes').write_text('binary diff\n')
        (self.root / 'binary').write_bytes(b'\0after')
        row = budget.inventory(self.root, 'HEAD')['files'][0]
        self.assertTrue(row['binary'])
        self.assertEqual(row['hunks'], 1)
        self.assertEqual(row['attributes']['diff'], 'set')

    def test_nul_boundary_and_binary_mode_only(self):
        (self.root / 'binary').chmod(0o755)
        row = budget.inventory(self.root, 'HEAD')['files'][0]
        self.assertTrue(row['binary'])
        self.assertEqual(row['hunks'], 0)
        (self.root / 'binary').chmod(0o644)
        for offset, expected in ((7999, True), (8000, False)):
            (self.root / 'text').write_bytes(b'x' * offset + b'\0changed')
            row = budget.inventory(self.root, 'HEAD')['files'][0]
            self.assertEqual(row['binary'], expected)

    def test_cli_refuses_incomplete_dependency_inventory(self):
        dep, _ = self.dependency()
        (dep / 'file').write_text('changed')
        output = self.root.parent / 'result.json'
        result = subprocess.run([sys.executable, str(Path(__file__).with_name('patch-budget.py')),
                                 str(self.root), '--upstream', 'HEAD', '--output', str(output)],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('local changes', result.stderr)
        self.assertFalse(output.exists())

    def test_dependency_clean_then_unstaged_staged_and_committed_changes(self):
        dep, git = self.dependency()
        self.assertEqual(len(budget.inventory(self.root, 'HEAD')['dependencies']['clean_git_checkouts']), 1)
        (dep / 'file').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'local changes'):
            budget.inventory(self.root, 'HEAD')
        git('add', 'file')
        with self.assertRaisesRegex(ValueError, 'local changes'):
            budget.inventory(self.root, 'HEAD')
        git('commit', '-qm', 'unpinned')
        with self.assertRaisesRegex(ValueError, 'differs from gclient pin'):
            budget.inventory(self.root, 'HEAD')

    def test_untracked_dependency_source_is_refused(self):
        dep, _ = self.dependency()
        (dep / 'new.cc').write_text('new')
        with self.assertRaisesRegex(ValueError, 'local changes'):
            budget.inventory(self.root, 'HEAD')

    def test_missing_manifest_or_checkout_is_refused(self):
        self.entries['src/missing'] = 'https://example.invalid/dep.git@' + 'a'*40
        self.write_entries()
        with self.assertRaisesRegex(ValueError, 'missing Git checkout'):
            budget.inventory(self.root, 'HEAD')
        (self.root.parent / '.gclient_entries').unlink()
        with self.assertRaises(FileNotFoundError):
            budget.inventory(self.root, 'HEAD')

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.root), *args])

    def test_hostile_config_does_not_join_hunks(self):
        (self.root / 'text').write_text('ONE\nkeep\nTHREE\n')
        clean = budget.inventory(self.root, 'HEAD')
        self.git('config', 'diff.interHunkContext', '5')
        self.git('config', 'diff.algorithm', 'histogram')
        self.git('config', 'diff.external', '/must-not-run')
        hostile = budget.inventory(self.root, 'HEAD')
        self.assertEqual(clean['hunks'], 2)
        self.assertEqual(clean['files'], hostile['files'])

    def test_binary_and_mode_only_and_new_files(self):
        (self.root / 'binary').write_bytes(b'\x00after')
        (self.root / 'text').chmod(0o755)
        (self.root / 'new').write_text('Blanc owned')
        self.git('add', 'new')
        (self.root / 'untracked').write_text('Blanc owned')
        result = budget.inventory(self.root, 'HEAD')
        self.assertEqual(result['upstream_files'], 2)
        self.assertEqual(result['hunks'], 1)
        self.assertEqual(result['excluded_new_tracked_files'], ['new'])
        self.assertEqual({f['path']: f['hunks'] for f in result['files']},
                         {'binary': 1, 'text': 0})

    def test_staged_and_unstaged_changes_are_both_included(self):
        (self.root / 'text').write_text('ONE\nkeep\nthree\n')
        self.git('add', 'text')
        (self.root / 'text').write_text('ONE\nkeep\nTHREE\n')
        self.assertEqual(budget.inventory(self.root, 'HEAD')['hunks'], 2)

    def test_clean_tree(self):
        result = budget.inventory(self.root, 'HEAD')
        self.assertEqual((result['upstream_files'], result['hunks']), (0, 0))


if __name__ == '__main__':
    unittest.main()
