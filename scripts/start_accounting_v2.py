"""Restart only this project's verified launcher after a passed model evaluation.

Usage: .venv/bin/python scripts/start_accounting_v2.py
Backs up .env; leaves the old ledger and original weights untouched.
"""
import json
import os
from pathlib import Path
import signal
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]


def main():
    artifact = ROOT / 'artifacts/accounting-v2'
    metadata = json.loads((artifact / 'adapter/training-metadata.json').read_text())
    if metadata.get('passed_release_gate') is not True or metadata.get('full_test_passed') is not True:
        raise SystemExit('Evaluation gate did not pass; current services left unchanged.')
    ledger = artifact / 'ledger/bills.db'
    if not ledger.is_file(): raise SystemExit('Rebuilt ledger is missing')
    runtime = ROOT / '.runtime'
    env_file = ROOT / '.env'
    backup = runtime / 'before-accounting-v2.env'
    if not backup.exists():
        backup.write_bytes(env_file.read_bytes())
        backup.chmod(0o600)
    pidfile = runtime / 'launcher.pid'
    if pidfile.exists():
        pid = int(pidfile.read_text().strip())
        proc = Path(f'/proc/{pid}')
        if proc.exists():
            command = (proc / 'cmdline').read_bytes().split(b'\0')
            cwd = (proc / 'cwd').resolve()
            if cwd != ROOT or not any(arg in {b'run.py', str(ROOT / 'run.py').encode()} for arg in command):
                raise SystemExit(f'PID {pid} is not this project launcher; refusing to stop it')
            os.kill(pid, signal.SIGINT)
            for _ in range(60):
                if not proc.exists(): break
                time.sleep(.25)
            else:
                # A reaped parent may remain as a zombie briefly; reject a live process.
                if 'State:\tZ' not in (proc / 'status').read_text():
                    raise SystemExit('Old launcher has not exited')
    updates = {
        'LLM_PROVIDER':'api', 'LLM_BASE_URL':'http://127.0.0.1:28030/v1',
        'LLM_MODEL':'qingcai-qwen3-4b-accounting-v2', 'LLM_HEALTH_URL':'http://127.0.0.1:28030/health',
        'ACCOUNTING_MODEL_SERVER':'true', 'ACCOUNTING_MODEL_PORT':'28030', 'ACCOUNTING_MODEL_GPU':'2',
        'ACCOUNTING_MODEL_PYTHON':str(ROOT / 'AI_accounting_agent/backend/.venv/bin/python'),
        'ACCOUNTING_BASE_MODEL':str(ROOT / 'Qwen3-4B'), 'ACCOUNTING_ADAPTER':str(artifact / 'adapter'),
        'AI_BOOKKEEPER_DATA_DIR':str(artifact / 'ledger'), 'AI_BOOKKEEPER_IMPORT_JSONL':'false',
        'ACCOUNTING_DATASET_VERSION':'accounting-v2',
    }
    existing = env_file.read_text().splitlines()
    kept = [line for line in existing if line.split('=',1)[0].strip() not in updates]
    env_file.write_text('\n'.join(kept + [f'{key}={value}' for key,value in updates.items()])+'\n')
    with (runtime/'launcher.log').open('w') as log:
        process = subprocess.Popen([str(ROOT/'.venv/bin/python'), '-u', str(ROOT/'run.py'), '--no-install', '--no-browser'],
                                   cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    pidfile.write_text(str(process.pid))
    print(json.dumps({'pid':process.pid, 'website':'http://127.0.0.1:25500', 'previous_env':str(backup)}))


if __name__ == '__main__': main()
