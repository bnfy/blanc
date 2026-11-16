#!/bin/bash
# Only the Sync part of the owner checks (the passkey part already passed).
exec "$HOME/Projects/Blanc/scripts/beta4-owner-checks.command" sync
