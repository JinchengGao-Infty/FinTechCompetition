"""Initialize synthetic positions in this clone only; never overwrite a database."""
from pathlib import Path
import argparse
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from baseline_backend.personal_positions import PersonalPositionStore

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, help='Optional new database path for isolated validation')
    args = parser.parse_args()
    target = (args.output or ROOT / '.runtime' / 'positions.sqlite3').resolve()
    if target.exists():
        print('Database already exists; preserved without modification.')
        return
    fixture = json.loads((ROOT / 'demo' / 'positions.synthetic.json').read_text(encoding='utf-8'))
    if fixture.get('kind') != 'synthetic-demo':
        raise SystemExit('Expected explicit synthetic fixture')
    store = PersonalPositionStore(target)
    revision = store.list()['revision']
    for position in fixture['positions']:
        revision = store.save(position, revision)['revision']
    print(json.dumps({'synthetic_positions':len(store.list()['holdings']),'database_created':True}, ensure_ascii=False))

if __name__ == '__main__':
    main()
