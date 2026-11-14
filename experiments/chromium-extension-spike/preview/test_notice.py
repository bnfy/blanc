import html
import importlib.util
import json
from pathlib import Path
import re
import unittest

spec = importlib.util.spec_from_file_location('notice', Path(__file__).with_name('notice.py'))
notice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(notice)

class NoticeTests(unittest.TestCase):
    def test_package_version_and_exact_revision_are_preserved(self):
        info = notice.build_metadata('157.0.8103.15', 'a' * 40)
        result = notice.stamp_html('<head><meta name="blanc-preview-build" content="old"></head>', info)
        embedded = json.loads(html.unescape(re.search(r'content="([^"]+)"', result)[1]))
        self.assertEqual(embedded['version'], '157.0.8103.15')
        self.assertEqual(embedded['revision'], 'a' * 40)
        self.assertEqual(embedded['status'], 'not-released')

    def test_unreviewed_urls_and_release_status_are_rejected(self):
        base = notice.build_metadata('157.0.8103.15', 'a' * 40)
        for field, value in [('statusUrl', 'https://example.com/'),
                             ('supportUrl', 'javascript:alert(1)'),
                             ('status', 'released'), ('maintainer', 'Someone else')]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                notice.build_metadata('157.0.8103.15', 'a' * 40, {**base, field: value})

    def test_invalid_version_revision_or_template_cannot_be_packaged(self):
        for version, revision in [('157\" onload=', 'a' * 40), ('157.0.8103.15', 'HEAD')]:
            with self.assertRaises(ValueError):
                notice.build_metadata(version, revision)
        info = notice.build_metadata('157.0.8103.15', 'a' * 40)
        for source in ['<head></head>', '<meta name="blanc-preview-build" content="x">' * 2]:
            with self.assertRaises(ValueError):
                notice.stamp_html(source, info)

    def test_withdrawn_status_is_explicit_and_html_values_are_encoded(self):
        info = notice.build_metadata('157.0.8103.15', 'a' * 40)
        info = notice.build_metadata('157.0.8103.15', 'a' * 40, {**info, 'status': 'withdrawn'})
        info['packagedAt'] = '\"><script>evil</script>'
        result = notice.stamp_html('<meta name="blanc-preview-build" content="x">', info)
        self.assertNotIn('<script>', result)
        self.assertIn('&lt;script&gt;', result)
        self.assertEqual(info['status'], 'withdrawn')

if __name__ == '__main__':
    unittest.main()
