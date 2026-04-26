#!/usr/bin/env bash

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Uso: ./push.sh \"mensagem do commit\""
  exit 1
fi

message="$*"

git add .
git commit -m "$message"
git push

