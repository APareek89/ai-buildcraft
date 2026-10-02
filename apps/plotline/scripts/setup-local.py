#!/usr/bin/env python3
"""Create a fresh local preview database and private generated configuration."""
import argparse
import os
from pathlib import Path
import secrets
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--pg-bin', type=Path, help='Directory containing PostgreSQL initdb, pg_ctl and psql')
parser.add_argument('--port', type=int, default=54329)
args = parser.parse_args()

def binary(name):
    result = str(args.pg_bin / name) if args.pg_bin else shutil.which(name)
    if not result or not Path(result).is_file():
        raise SystemExit(f'{name} unavailable; install PostgreSQL 16+ and pass --pg-bin')
    return result

local = ROOT / '.local'
env_file = ROOT / '.env.local'
if local.exists() or env_file.exists():
    raise SystemExit('Local setup already exists. Use scripts/dev-local.sh; existing data was left untouched.')
for name in ('initdb', 'pg_ctl', 'psql'):
    binary(name)
local.mkdir(mode=0o700)
password = secrets.token_hex(24)
pwfile = local / 'operator-password'
pwfile.write_text(password + '\n'); pwfile.chmod(0o600)
dbdir = local / 'postgres'
subprocess.run([binary('initdb'), '-D', str(dbdir), '-U', 'plotline_operator', '-A', 'scram-sha-256', '--pwfile', str(pwfile)], check=True, stdout=subprocess.DEVNULL)
options = f'-h 127.0.0.1 -p {args.port} -k {local}'
subprocess.run([binary('pg_ctl'), '-D', str(dbdir), '-l', str(local / 'postgres.log'), '-o', options, '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
env = {**os.environ, 'PGPASSWORD': password}
psql = [binary('psql'), '-h', '127.0.0.1', '-p', str(args.port), '-U', 'plotline_operator', '-v', 'ON_ERROR_STOP=1']
runtime_password = secrets.token_hex(24)
def sql(database, statement):
    subprocess.run([*psql, '-d', database], input=statement, text=True, env=env, check=True, stdout=subprocess.DEVNULL)
try:
    sql('postgres', 'CREATE DATABASE plotline_local;')
    sql('plotline_local', (ROOT / 'migrations/001_portfolio.sql').read_text())
    sql('plotline_local', f"CREATE ROLE plotline_runtime LOGIN PASSWORD '{runtime_password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;\nGRANT CONNECT ON DATABASE plotline_local TO plotline_runtime;\nGRANT USAGE ON SCHEMA public TO plotline_runtime;\nGRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO plotline_runtime;\nGRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO plotline_runtime;")
    values = {
        'DATABASE_URL': f'postgresql://plotline_runtime:{runtime_password}@127.0.0.1:{args.port}/plotline_local',
        'DATABASE_NAME':'plotline_local', 'DATABASE_SSL':'disable',
        'AUTH_SECRET':secrets.token_hex(32), 'PLOTLINE_BRIDGE_SECRET':secrets.token_hex(32),
        'AUTH_URL':'http://127.0.0.1:3100', 'PUBLIC_ORIGIN':'http://127.0.0.1:3100',
        'PORTFOLIO_AUTH_ENABLED':'1', 'PLOTLINE_LOCAL_PREVIEW':'1', 'PLOTLINE_BIND_HOST':'127.0.0.1',
        'MOCK_LLM':'1', 'MOCK_MEDIA':'1', 'PLOTLINE_STORAGE_MODE':'fixture',
        'PLOTLINE_INTERNAL_API_URL':'http://127.0.0.1:8600', 'PLOTLINE_RAG_URL':'http://127.0.0.1:8790',
        'PLOTLINE_AUX_RAG_URL':'http://127.0.0.1:8790', 'PLOTLINE_DATA_DIR':str(local/'data'),
        'PLOTLINE_PG_CTL':binary('pg_ctl'), 'PLOTLINE_PG_PORT':str(args.port),
    }
    import shlex
    env_file.write_text('\n'.join(f'{key}={shlex.quote(value)}' for key,value in values.items()) + '\n')
    env_file.chmod(0o600)
finally:
    subprocess.run([binary('pg_ctl'),'-D',str(dbdir),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('Created .env.local and .local/ with generated credentials. Next: bash scripts/dev-local.sh')
