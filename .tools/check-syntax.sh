#!/usr/bin/env bash
# Syntax check every game module. Nothing here is part of the entry: this is a local
# tool only, and lives outside game/ on purpose.
set -u
fail=0
count=0
while IFS= read -r file; do
  count=$((count + 1))
  if ! node --input-type=module --check < "$file" 2>/tmp/syntax.err; then
    echo "SYNTAX FAIL: $file"
    cat /tmp/syntax.err
    fail=1
  fi
done < <(find game/src -name '*.js' | sort)
echo "checked $count modules, failures=$fail"
exit $fail
