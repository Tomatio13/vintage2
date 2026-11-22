#!/bin/sh
# Select this file as the CodexBar executable in Settings > Usage.
# Reuse the user's existing 1Password mount without copying credentials.
set -eu

# Version probes do not need to unlock 1Password.
case "${1:-}" in
--version | -V | --help | -h)
	exec "$HOME/.local/bin/codexbar" "$@"
	;;
esac

exec /usr/bin/op run --env-file "$HOME/.env" -- "$HOME/.local/bin/codexbar" "$@"
