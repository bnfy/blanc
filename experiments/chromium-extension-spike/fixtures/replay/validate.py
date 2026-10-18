#!/usr/bin/env python3
"""Compare captured request decisions; this does not certify capture provenance."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit

CONTEXT = ('url', 'method', 'resource_type', 'initiator_origin',
           'top_frame_origin', 'frame_role', 'profile_kind', 'redirect_index')
DECISIONS = ('allow', 'block')


def index_records(records, label, errors):
    indexed = {}
    if not isinstance(records, list):
        errors.append(f'{label}: expected an array')
        return indexed
    for number, record in enumerate(records):
        if not isinstance(record, dict):
            errors.append(f'{label}[{number}]: expected an object')
            continue
        key = record.get('id')
        if not isinstance(key, str) or not key:
            errors.append(f'{label}[{number}]: missing nonempty id')
            continue
        if key in indexed:
            errors.append(f'{label}: duplicate id {key}')
            continue
        indexed[key] = record
        context = record.get('context')
        if not isinstance(context, dict) or set(context) != set(CONTEXT):
            errors.append(f'{label}/{key}: incomplete or unknown context fields')
            continue
        for field in CONTEXT[:-1]:
            if not isinstance(context[field], str) or not context[field]:
                errors.append(f'{label}/{key}: invalid {field}')
        if context['profile_kind'] not in ('regular', 'private'):
            errors.append(f'{label}/{key}: invalid profile_kind')
        if type(context['redirect_index']) is not int or context['redirect_index'] < 0:
            errors.append(f'{label}/{key}: invalid redirect_index')
        try:
            url = urlsplit(context['url'])
            if url.scheme not in ('http', 'https', 'ws', 'wss') or not url.hostname:
                raise ValueError('unsupported URL')
            _ = url.port
        except (ValueError, TypeError, AttributeError):
            errors.append(f'{label}/{key}: invalid network URL')
        if record.get('decision') not in DECISIONS:
            errors.append(f'{label}/{key}: missing or invalid decision')
    return indexed


def compare(corpus, observations):
    faults = []
    expected = index_records(corpus, 'oracle', faults)
    actual = index_records(observations, 'observed', faults)
    differences = []
    for key in sorted(expected.keys() - actual.keys()):
        faults.append(f'missing observation: {key}')
    for key in sorted(actual.keys() - expected.keys()):
        faults.append(f'unexpected observation: {key}')
    for key in sorted(expected.keys() & actual.keys()):
        left, right = expected[key], actual[key]
        if left.get('context') != right.get('context'):
            faults.append(f'context mismatch: {key}')
        elif (isinstance(left.get('context'), dict)
              and set(left['context']) == set(CONTEXT)
              and left.get('decision') in DECISIONS and right.get('decision') in DECISIONS):
            if left['decision'] != right['decision']:
                differences.append({'id': key, 'url': left['context']['url'],
                                    'oracle': left['decision'], 'observed': right['decision']})
    counts = {decision: sum(r.get('decision') == decision for r in expected.values())
              for decision in sorted(DECISIONS)}
    sufficient = all(count >= 2000 for count in counts.values())
    return {'harness_faults': faults, 'decision_differences': differences,
            'oracle_counts': counts, 'minimum_counts_met': sufficient,
            'dataset_comparison_passed': not faults and not differences and sufficient,
            'capture_provenance_verified': False,
            'note': 'Dataset comparison only; real capture, transport, coverage, cosmetics and latency require separate evidence.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('oracle', type=Path)
    parser.add_argument('observed', type=Path)
    args = parser.parse_args()
    try:
        result = compare(json.loads(args.oracle.read_text()), json.loads(args.observed.read_text()))
    except (OSError, json.JSONDecodeError) as error:
        parser.exit(2, f'{error}\n')
    print(json.dumps(result, indent=2))
    return 0 if result['dataset_comparison_passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
