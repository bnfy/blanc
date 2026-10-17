import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('budget', Path(__file__).with_name('patch-budget.py'))
budget = importlib.util.module_from_spec(spec)
spec.loader.exec_module(budget)


class BudgetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git('init', '-q')
        self.git('config', 'user.name', 'Fixture')
        self.git('config', 'user.email', 'fixture@example.invalid')
        (self.root / 'text').write_text('one\nkeep\nthree\n')
        (self.root / 'binary').write_bytes(b'\x00before')
        self.git('add', '.')
        self.git('commit', '-qm', 'pristine')

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
