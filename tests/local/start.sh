#!/usr/bin/env bash
# Local Supabase-like stack for tests: Postgres + PostgREST + storage mock gateway.
# Usage: tests/local/start.sh   (needs local postgres 15+/16 and ./postgrest binary in PATH or POSTGREST_BIN)
set -euo pipefail
cd "$(dirname "$0")/../.."

DB=${DB:-arena_test}
PGRST_BIN=${POSTGREST_BIN:-postgrest}
SECRET=${JWT_SECRET:-local-test-secret-local-test-secret-123456}
export PGPASSWORD=${PGPASSWORD:-postgres}
PSQL="psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 -q"

for f in /tmp/ba-postgrest.pid /tmp/ba-gateway.pid; do
  [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true
  rm -f "$f"
done
sleep 0.5

$PSQL -d postgres <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login password 'authpass' noinherit; end if;
end \$\$;
grant anon, authenticated, service_role to authenticator;
select pg_terminate_backend(pid) from pg_stat_activity where datname = '$DB' and pid <> pg_backend_pid();
drop database if exists $DB;
create database $DB;
SQL

# mimic Supabase defaults: public schema usable by API roles, default grants on new tables
$PSQL -d $DB <<SQL
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create publication supabase_realtime;
SQL
if [ "${SKIP_SCHEMA:-0}" != "1" ]; then
  $PSQL -d $DB -f supabase/schema.sql 2>&1 | grep -v NOTICE || true
fi

cat > tests/local/postgrest.conf <<CONF
db-uri = "postgres://authenticator:authpass@127.0.0.1:5432/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = 3001
db-pool = 10
CONF

jwt() {
  node -e '
    const c=require("crypto");const [secret,role]=process.argv.slice(1);
    const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
    const h=b({alg:"HS256",typ:"JWT"}),p=b({iss:"supabase",role,iat:1700000000,exp:2000000000});
    process.stdout.write(h+"."+p+"."+c.createHmac("sha256",secret).update(h+"."+p).digest("base64url"));
  ' "$SECRET" "$1"
}
ANON=$(jwt anon)
SERVICE=$(jwt service_role)

cat > tests/local/env.sh <<ENV
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON
export SUPABASE_SERVICE_ROLE_KEY=$SERVICE
export ADMIN_PASSWORD=test-admin-pass
export POSTGRES_URL_NON_POOLING=postgres://postgres:postgres@127.0.0.1:5432/$DB
export INSECURE_COOKIES=1
ENV

rm -rf /tmp/ba-storage
nohup "$PGRST_BIN" tests/local/postgrest.conf > /tmp/postgrest.log 2>&1 &
echo $! > /tmp/ba-postgrest.pid
JWT_SECRET=$SECRET nohup node tests/local/gateway.mjs > /tmp/gateway.log 2>&1 &
echo $! > /tmp/ba-gateway.pid
for i in $(seq 1 40); do
  if curl -fsS -o /dev/null "http://127.0.0.1:54321/rest/v1/" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"; then
    echo "local supabase ready (db=$DB)"; exit 0
  fi
  sleep 0.25
done
echo "failed to start"; cat /tmp/postgrest.log /tmp/gateway.log; exit 1
