#!/usr/bin/env sh
# SessionStart hook for the NEIN plugin.
#
# Prints the NEIN ruleset (skills/nein/SKILL.md without its frontmatter) so
# Claude Code adds it to the session context. Plain stdout from a SessionStart
# hook becomes context, so no JSON escaping is needed.
#
# Opt out with NEIN_DISABLE=1. Never blocks session start: every failure path
# exits 0 without output. Uses only sh and awk, so it also runs where Node is
# missing or PATH is minimal.

[ "${NEIN_DISABLE:-0}" = "1" ] && exit 0

# Resolve the plugin root from $0 without dirname (PATH can be empty at
# session start). "${0%/*}" is the directory part, or $0 itself when there is
# no slash, in which case the script was started from its own directory.
case "$0" in
  */*) script_dir="${0%/*}" ;;
  *) script_dir="." ;;
esac
skill_path="$script_dir/../skills/nein/SKILL.md"
[ -r "$skill_path" ] || exit 0

# Drop a leading YAML frontmatter block (--- ... ---) and the blank lines
# after it.
body=$(awk '
  NR == 1 && /^---[[:space:]]*$/ { in_fm = 1; next }
  in_fm && /^---[[:space:]]*$/ { in_fm = 0; next }
  in_fm { next }
  !started && /^[[:space:]]*$/ { next }
  { started = 1; print }
' "$skill_path") || exit 0
[ -n "$body" ] || exit 0

printf '%s\n\n%s\n' \
  'NEIN mode is on (always-on via the NEIN plugin). The ruleset below applies to every response in this session. "nein off" turns it off for this session; NEIN_DISABLE=1 turns the plugin off.' \
  "$body"
exit 0
