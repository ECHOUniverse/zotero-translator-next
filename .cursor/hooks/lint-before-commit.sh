#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
command=$(echo "$input" | jq -r '.command // empty')

# Only gate real commits; allow amend flags and other git subcommands.
if [[ ! "$command" =~ ^git[[:space:]]+commit ]]; then
  echo '{ "permission": "allow" }'
  exit 0
fi

if ! npm run lint:check; then
  echo '{
    "permission": "deny",
    "user_message": "Commit blocked: npm run lint:check failed. Run npm run lint:fix or prettier --write on changed files.",
    "agent_message": "lint:check must pass before git commit in this repo."
  }'
  exit 0
fi

echo '{ "permission": "allow" }'
exit 0
