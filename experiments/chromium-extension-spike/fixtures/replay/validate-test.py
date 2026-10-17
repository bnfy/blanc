"""Synthetic validator unit tests, never a captured acceptance corpus."""
import copy
import unittest
from validate import compare


def records():
    return [{'id': str(i), 'context': {
        'url': f'https://fixture.example/request/{i}', 'method': 'GET',
        'resource_type': 'image', 'initiator_origin': 'https://page.example',
        'top_frame_origin': 'https://page.example', 'frame_role': 'main',
        'redirect_index': 0}, 'decision': 'block' if i < 2000 else 'allow'}
        for i in range(4000)]


class ValidatorTests(unittest.TestCase):
    def setUp(self):
        self.oracle = records()
        self.observed = copy.deepcopy(self.oracle)

    def test_equal_dataset_is_not_provenance_certification(self):
        result = compare(self.oracle, self.observed)
        self.assertTrue(result['dataset_comparison_passed'])
        self.assertFalse(result['capture_provenance_verified'])

    def test_missing_decision_is_harness_fault(self):
        del self.observed[0]['decision']
        self.assertTrue(compare(self.oracle, self.observed)['harness_faults'])

    def test_missing_duplicate_and_extra_requests_fail(self):
        for observed in (self.observed[1:], self.observed + [self.observed[0]],
                         self.observed + [dict(self.observed[0], id='extra')]):
            self.assertTrue(compare(self.oracle, observed)['harness_faults'])

    def test_localhost_rewrite_is_not_blocking_difference(self):
        self.observed[0]['context']['url'] = 'https://localhost/request/0'
        result = compare(self.oracle, self.observed)
        self.assertTrue(result['harness_faults'])
        self.assertEqual(result['decision_differences'], [])

    def test_each_context_field_is_compared(self):
        for field in self.observed[0]['context']:
            observed = copy.deepcopy(self.observed)
            observed[0]['context'][field] = 1 if field == 'redirect_index' else 'different'
            self.assertTrue(compare(self.oracle, observed)['harness_faults'], field)

    def test_both_false_negative_and_false_positive_are_named(self):
        self.observed[0]['decision'] = 'allow'
        self.observed[-1]['decision'] = 'block'
        result = compare(self.oracle, self.observed)
        self.assertEqual(len(result['decision_differences']), 2)
        self.assertFalse(result['dataset_comparison_passed'])

    def test_small_corpus_never_passes(self):
        result = compare(self.oracle[:2], self.observed[:2])
        self.assertFalse(result['minimum_counts_met'])
        self.assertFalse(result['dataset_comparison_passed'])

    def test_malformed_inputs_fail_closed(self):
        for malformed in (None, {}, [None], [{'id': 'x'}],
                          [dict(self.oracle[0], context=None)],
                          [dict(self.oracle[0], decision=[]) ]):
            self.assertTrue(compare(malformed, self.observed)['harness_faults'])


if __name__ == '__main__':
    unittest.main()
