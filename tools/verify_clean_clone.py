"""Validate the documented fresh-clone startup on an isolated loopback port."""
from pathlib import Path
import hashlib
import http.client
import json
import re
import socket
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]


def main():
    database = ROOT / '.runtime/positions.sqlite3'
    if database.exists():
        raise SystemExit('Requires a fresh clone without an initialized database; existing data preserved.')
    imports = 0
    for path in (ROOT / 'web').rglob('*'):
        if path.suffix not in {'.js','.mjs'}:
            continue
        for item in re.findall(r'''(?:from\s*|import\s*\(?\s*)["'](\.[^"']+)["']''', path.read_text(encoding='utf-8')):
            target = (path.parent / item.split('?')[0]).resolve()
            assert target.is_relative_to((ROOT / 'web').resolve()) and target.is_file(), 'Missing local module: '+path.relative_to(ROOT).as_posix()
            imports += 1
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0))
        port = sock.getsockname()[1]
    process = subprocess.Popen([sys.executable,'-u','-B','server.py','--port',str(port)],cwd=ROOT,
                               stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    cookie = None
    def get(route):
        nonlocal cookie
        connection = http.client.HTTPConnection('127.0.0.1',port,timeout=5)
        try:
            connection.request('GET',route,headers={'Cookie':cookie} if cookie else {})
            response = connection.getresponse()
            assert response.status == 200, 'Unexpected status for '+route
            if response.getheader('Set-Cookie'):
                cookie = response.getheader('Set-Cookie').split(';')[0]
            return response.read()
        finally:
            connection.close()
    try:
        deadline = time.monotonic()+12
        while True:
            if process.poll() is not None:
                raise AssertionError('Isolated server exited before readiness')
            try:
                health = json.loads(get('/api/health'))
                break
            except OSError:
                if time.monotonic()>deadline:
                    raise AssertionError('Isolated server readiness timeout')
                time.sleep(.1)
        assert health['external_api_enabled'] is False
        session = json.loads(get('/api/session'))
        assert session['configured'] is False and session['enabled'] is False
        positions = json.loads(get('/api/positions'))
        holdings = positions.get('holdings',positions.get('positions',[]))
        assert len(holdings) == 4, 'Expected four synthetic holdings'
        before = hashlib.sha256(database.read_bytes()).hexdigest()
        subprocess.run([sys.executable,'-B','tools/init_demo.py'],cwd=ROOT,check=True,capture_output=True)
        assert hashlib.sha256(database.read_bytes()).hexdigest() == before, 'Repeated initialization changed database'
        watchlist = json.loads(get('/api/reference/watchlist'))
        items = watchlist if isinstance(watchlist,list) else watchlist.get('items',watchlist.get('watchlist',watchlist.get('stocks',[])))
        assert len(items) == 10, 'Expected ten historical reference stocks'
        routes = ['/', '/showcase.html', '/showcase.css', '/showcase.js', '/entry.js', '/desktop-session.mjs',
                  '/app.js', '/agent-tools.mjs','/agent-workspace.mjs','/operation-flow.mjs',
                  '/state-storage.mjs','/bank-cards.css','/bank-cards.mjs','/material/metal-card.mjs',
                  '/assets/dot.png','/assets/radix/slate.css','/assets/company-logos/601857.svg']
        for route in routes:
            assert get(route), 'Empty static resource'
        assert get('/assets/research/600519/research-latest.pdf').startswith(b'%PDF')
        print(json.dumps({'startup':'pass','synthetic_holdings':len(holdings),'reference_stocks':len(items),
                          'static_routes':len(routes)+1,'local_module_references':imports,
                          'automatic_initialization':True,'repeated_initialization_preserved':True,'external_api_called':False,
                          'isolated_port':port,'production_port_untouched':65281},indent=2))
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


if __name__ == '__main__':
    main()
