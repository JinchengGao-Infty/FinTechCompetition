"""Rebuild the 65271 preview's synthetic fixtures in a NEW local directory."""
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / 'AI_accounting_agent' / 'backend'
sys.path.insert(0, str(BACKEND))
from synthetic_ledger import export
from personal_positions import PersonalPositionStore

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--instance', choices=['candidate', 'test'], default='candidate')
    args = parser.parse_args()
    target = ROOT / 'local-state' / ('night-' + args.instance)
    if target.exists():
        parser.error(f'{target} already exists; initialization never overwrites existing state. Stop the preview and rename that directory to keep a backup before initializing again.')
    manifest = export(target, BACKEND / 'data.py')
    # Fictional holdings from the current preview, never personal account data.
    store = PersonalPositionStore(target / 'positions.sqlite3')
    fixtures = [
        ('600036', '招商银行', '200', '8019.84'),
        ('600519', '贵州茅台', '100', '128160.00'),
        ('600900', '长江电力', '300', '8481.60'),
        ('601088', '中国神华', '100', '4819.20'),
    ]
    for revision, (code, name, quantity, cost) in enumerate(fixtures):
        store.save(dict(code=code, name=name, asset_class='stock', quantity=quantity,
                        total_cost=cost, currency='CNY', as_of='2026-10-23'), revision)
    print(f"Initialized {manifest['count']} synthetic bills and {len(fixtures)} fictional holdings.")
    print(f"Dataset SHA256: {manifest['row_sha256']}")

if __name__ == '__main__':
    main()
