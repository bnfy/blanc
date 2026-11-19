#!/bin/bash
# Blanc Beta for Windows: deploys and keys the release gate's staging update
# server, blanc-update-staging (W3 Task E1), with update-worker-staging.command.
BLANC_WORKER_ENV=staging exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/update-worker-staging.command"
