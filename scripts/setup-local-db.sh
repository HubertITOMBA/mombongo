#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/setup-local-env.mjs
pg_bin=/usr/pgsql-18/bin
pg_data="$PWD/.local/postgres"
mkdir -p "$PWD/.local"
chmod 700 "$PWD/.local"
if [ ! -f "$pg_data/PG_VERSION" ]; then
  "$pg_bin/initdb" -D "$pg_data" --username=facturia --auth-local=trust --auth-host=scram-sha-256 --pwfile="$PWD/.local/postgres-password" --encoding=UTF8 --locale=C.UTF-8 >/dev/null
fi
if ! "$pg_bin/pg_ctl" -D "$pg_data" status >/dev/null 2>&1; then
  "$pg_bin/pg_ctl" -D "$pg_data" -l "$PWD/.local/postgres.log" -o "-p 5433 -h 127.0.0.1 -k $PWD/.local" start
fi
if ! "$pg_bin/psql" -h "$PWD/.local" -p 5433 -U facturia -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='facturia'" | grep -q 1; then
  "$pg_bin/createdb" -h "$PWD/.local" -p 5433 -U facturia facturia
fi
