#!/bin/sh
set -eu

expected_login="alex-agiventures"
expected_remote="git@github.com-work:AGI-Ventures-Canada/oatmeal.git"

git config --local user.name "Alex Ivany"
git config --local user.email "alex@agiventures.ca"
git config --local core.hooksPath .githooks
git remote set-url origin "$expected_remote"
git remote set-url --push origin "$expected_remote"

login="$(gh api user --jq .login 2>/dev/null || true)"
if [ "$login" != "$expected_login" ]; then
  printf 'GitHub account policy failed: active GitHub login must be %s\n' "$expected_login" >&2
  exit 1
fi

exec "$(git rev-parse --show-toplevel)/.githooks/verify-account" all
