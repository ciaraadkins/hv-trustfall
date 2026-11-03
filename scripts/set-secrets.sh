#!/usr/bin/env bash
# Copy the API keys from .env.local into SST's secret store for a stage, and
# give that stage its own new round-token secret. Prints names, never values.
#
#   scripts/set-secrets.sh dev
#   scripts/set-secrets.sh production
#
# DbPassword is set separately, when the stage's database user is created (see README).
set -euo pipefail

stage="${1:?usage: scripts/set-secrets.sh <stage>}"
cd "$(dirname "$0")/.."

value() { sed -n "s/^$1=//p" .env.local | tail -1 | tr -d "\"'"; }

npx sst secret set RoundTokenSecret "$(openssl rand -base64 32)" --stage "$stage" >/dev/null
echo "$stage: RoundTokenSecret set (new)"

for pair in AnthropicApiKey:ANTHROPIC_API_KEY OpenaiApiKey:OPENAI_API_KEY GeminiApiKey:GEMINI_API_KEY \
  XaiApiKey:XAI_API_KEY DeepseekApiKey:DEEPSEEK_API_KEY; do
  name="${pair%%:*}"
  key="$(value "${pair##*:}")"
  if [ -z "$key" ]; then
    echo "$stage: ${pair##*:} is empty in .env.local, skipped"
    continue
  fi
  npx sst secret set "$name" "$key" --stage "$stage" >/dev/null
  echo "$stage: $name set"
done
