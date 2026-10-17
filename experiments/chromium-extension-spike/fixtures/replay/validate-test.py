"""Synthetic validator unit tests, never a captured acceptance corpus."""
import copy
import unittest
from validate import compare


def records():
    return [{'id': str(i), 'context': {
        'url': f'https://fixture.example/request/{i}', 'method': 'GET',
        'resource_type': 'image', 'initiator_origin': 'https://page.example',
        'top_frame_origin': 'https://page.example', 'frame_role': 'main', 'profile_kind': 'regular',
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

    def test_profile_mismatch_and_invalid_profiles_fail(self):
        self.observed[0]['context']['profile_kind'] = 'private'
        self.assertTrue(compare(self.oracle, self.observed)['harness_faults'])
        for kind in ('incognito', '', None, []):
            self.oracle[0]['context']['profile_kind'] = kind
            self.observed[0]['context']['profile_kind'] = kind
            self.assertTrue(compare(self.oracle, self.observed)['harness_faults'])

    def test_private_profile_records_compare(self):
        for record in self.oracle + self.observed:
            record['context']['profile_kind'] = 'private'
        self.assertTrue(compare(self.oracle, self.observed)['dataset_comparison_passed'])

    def test_absent_and_opaque_initiators_are_not_interchangeable(self):
        self.oracle[0]['context']['initiator_origin'] = 'absent'
        self.observed[0]['context']['initiator_origin'] = 'opaque:frame-1'
        result = compare(self.oracle, self.observed)
        self.assertTrue(result['harness_faults'])
        self.assertEqual(result['decision_differences'], [])

    def test_browser_started_navigation_can_have_absent_initiator(self):
        for dataset in (self.oracle, self.observed):
            dataset[0]['context'].update(
                resource_type='mainFrame', initiator_origin='absent',
                top_frame_origin='https://fixture.example')
        self.assertTrue(compare(self.oracle, self.observed)['dataset_comparison_passed'])
        # A renderer-started navigation must not be flattened to absent.
        self.observed[0]['context']['initiator_origin'] = 'https://page.example'
        self.assertTrue(compare(self.oracle, self.observed)['harness_faults'])

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

    def test_oracle_blocked_transport_miss_preserves_false_negative(self):
        self.observed[0]['decision'] = 'allow'
        result = compare(self.oracle, self.observed,
                         [{'code': 'unrecorded-request', 'request_id': '0'}])
        self.assertEqual(result['harness_faults'], [])
        self.assertEqual(len(result['decision_differences']), 1)
        self.assertEqual(result['decision_differences'][0]['oracle'], 'block')
        self.assertEqual(len(result['response_limitations']), 1)
        self.assertFalse(result['dataset_comparison_passed'])

    def test_transport_missing_or_wrong_join_cannot_exempt_fault(self):
        for event in [{'code': 'unrecorded-request', 'request_id': 'unknown'},
                      {'code': 'unrecorded-request', 'request_id': '2000'},
                      {'code': 'unrecorded-request', 'request_id': '0'},
                      {'code': 'unrecorded-request', 'url': 'https://fixture.example/request/0'}]:
            self.assertTrue(compare(self.oracle, self.observed, [event])['harness_faults'])

    def test_other_faults_and_missing_descendants_never_erase_difference(self):
        self.observed[0]['decision'] = 'allow'
        del self.observed[-1]
        result = compare(self.oracle, self.observed,
                         [{'code': 'unrecorded-request', 'request_id': '0'},
                          {'code': 'authority-mismatch', 'request_id': '1'}])
        self.assertTrue(result['harness_faults'])
        self.assertEqual(len(result['decision_differences']), 1)
        self.assertEqual(len(result['response_limitations']), 1)

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
