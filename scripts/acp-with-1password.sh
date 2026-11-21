#!/bin/sh
# Settings → ACP Agents: select this executable and set Arguments to the agent name.
set -eu

usage() {
	printf '%s\n' 'Usage: acp-with-1password.sh codex|claude|agy|opencode|zai [agent arguments...]'
}

executable=
case "${1:-}" in
--help | -h)
	usage
	exit 0
	;;
codex)
	adapter=codex-acp
	;;
claude)
	adapter=claude-agent-acp
	;;
agy | antigravity)
	executable=agy
	;;
opencode | zai | z.ai)
	if command -v opencode2 >/dev/null 2>&1; then
		executable=opencode2
	elif command -v opencode >/dev/null 2>&1; then
		executable=opencode
	else
		printf '%s\n' 'OpenCode CLI (opencode2 or opencode) was not found on PATH.' >&2
		exit 127
	fi
	;;
*)
	usage >&2
	exit 2
	;;
esac
shift

if ! command -v op >/dev/null 2>&1; then
	printf '%s\n' '1Password CLI (op) was not found on PATH.' >&2
	exit 127
fi

if [ -n "$executable" ]; then
	if ! command -v "$executable" >/dev/null 2>&1; then
		printf '%s\n' "$executable was not found on PATH." >&2
		exit 127
	fi
	set -- "$executable" acp "$@"
else
	script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
	entry="$script_dir/../node_modules/@agentclientprotocol/$adapter/dist/index.js"
	if [ -f "$entry" ] && command -v node >/dev/null 2>&1; then
		set -- node "$entry" "$@"
	elif command -v "$adapter" >/dev/null 2>&1; then
		set -- "$adapter" "$@"
	else
		printf '%s\n' "Could not start $adapter. Install the checkout dependencies and Node.js, or put $adapter on PATH." >&2
		exit 127
	fi
fi

exec op run --env-file="${VINTAGE_ACP_ENV_FILE:-$HOME/.env}" -- "$@"
