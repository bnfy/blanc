#!/usr/bin/env python3
"""Prospective effort ledger. Does not run builds or infer historical attention."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import subprocess
import time


def summarize(events):
    active = {}
    totals = {'owner': 0, 'agent': 0, 'machine': 0}
    uncertain = []
    for event in events:
        actor = event['actor']
        if actor not in totals:
            raise ValueError('Unknown actor')
        if event['event'] == 'start':
            if actor in active:
                raise ValueError('Overlapping interval for ' + actor)
            active[actor] = event
        elif event['event'] == 'stop':
            if actor not in active:
                raise ValueError('Stop without start')
            start = active.pop(actor)
            elapsed = event['monotonic_ns'] - start['monotonic_ns']
            if event['boot'] != start['boot'] or elapsed < 0:
                uncertain.append({'actor': actor, 'start': start, 'stop': event,
                                  'reason': 'Restart or monotonic clock discontinuity; no duration inferred'})
            else:
                totals[actor] += elapsed / 1e9
        else:
            raise ValueError('Unknown event')
    return {'recordedSeconds': totals, 'openIntervals': active,
            'uncertainIntervals': uncertain, 'historicalAttentionRecovered': False,
            'gateAccepted': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ledger', type=Path)
    parser.add_argument('action', choices=['start', 'stop', 'report'])
    parser.add_argument('--actor', choices=['owner', 'agent', 'machine'])
    parser.add_argument('--note')
    args = parser.parse_args()
    if args.action != 'report' and (not args.actor or not args.note):
        parser.error('start/stop require --actor and --note')
    if args.action == 'report':
        events = [json.loads(line) for line in args.ledger.read_text().splitlines()]
        print(json.dumps(summarize(events), indent=2))
        return
    args.ledger.parent.mkdir(parents=True, exist_ok=True)
    with args.ledger.open('a+', encoding='utf8') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        stream.seek(0)
        events = [json.loads(line) for line in stream if line.strip()]
        event = {'event': args.action, 'actor': args.actor, 'note': args.note,
                 'wallUnixSeconds': time.time(), 'monotonic_ns': time.monotonic_ns(),
                 'boot': subprocess.check_output(['/usr/sbin/sysctl', '-n', 'kern.bootsessionuuid'], text=True).strip()}
        report = summarize(events + [event])
        stream.seek(0, os.SEEK_END)
        stream.write(json.dumps(event) + '\n')
        stream.flush()
        os.fsync(stream.fileno())
        print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
