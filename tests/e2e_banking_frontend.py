"""Browser UI contract checks with intercepted API fixtures; no real bank writes."""
import json
import mimetypes
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / 'AI_accounting_agent/frontend/liquid-glass'
OUTPUT = ROOT / '.runtime/banking-frontend'
OUTPUT.mkdir(parents=True, exist_ok=True)
TASK_ID = '49906720-d4a8-4f03-802a-25964d598e38'
task = None
writes = []
errors = []

def route_request(route):
    global task
    request = route.request
    path = urlsplit(request.url).path
    if path.startswith('/api/'):
        if request.method != 'GET':
            writes.append(path)
        if path == '/api/book/finance/session':
            data = {'csrf': 'fixture-csrf'}
        elif path == '/api/book/finance/bank-tasks' and request.method == 'GET':
            data = {'tasks': [task] if task else []}
        elif path == '/api/book/finance/bank-tasks' and request.method == 'POST':
            body = request.post_data_json
            first = task is None
            amount = '50.00' if '50' in body['text'] else '80.00'
            task = {'id': TASK_ID, 'kind': 'transfer', 'version': 1 if first else task['version'] + 1,
                    'status': 'collecting' if first else 'ready', 'slots': {'recipient_id': 'acct-lin'},
                    'draft': None if first else {'kind': 'transfer', 'recipient_id': 'acct-lin', 'amount': amount},
                    'missing_slots': ['amount'] if first else [], 'facts': None,
                    'reply': '请补充转账金额。' if first else f'转给小林 {amount} 元，草稿待核对。',
                    'history': (task['history'] if task else []) + [{'role': 'user', 'content': body['text']}],
                    'steps': [{'label': '理解需求', 'status': 'completed'}, {'label': '补齐并核对参数', 'status': 'current'}, {'label': '单独确认资金操作', 'status': 'pending'}]}
            data = task
        elif path == f'/api/book/finance/bank-tasks/{TASK_ID}/cancel':
            task = {**task, 'version': task['version'] + 1, 'status': 'cancelled', 'draft': None,
                    'reply': '任务已取消。', 'missing_slots': []}
            data = task
        elif path == f'/api/book/finance/bank-tasks/{TASK_ID}':
            data = task
        elif path == '/api/book/finance/overview':
            data = {'recipients': [{'id': 'acct-lin', 'name': '小林', 'remark': '朋友'}], 'products': []}
        else:
            route.fulfill(status=500, json={'detail': f'Unexpected API: {path}'})
            return
        route.fulfill(json=data)
        return
    if path == '/runtime-config.js':
        route.fulfill(content_type='text/javascript', body='window.FINTECH_SAME_ORIGIN=true;')
        return
    file = FRONTEND / (path.lstrip('/') or 'index.html')
    if file.is_file() and FRONTEND in file.resolve().parents:
        route.fulfill(body=file.read_bytes(), content_type=mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
    else:
        route.fulfill(status=404, body='not found')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=os.environ.get('PLAYWRIGHT_EXECUTABLE_PATH'), args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 393, 'height': 852}, locale='zh-CN')
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/*', route_request)
    page.goto('http://finpilot.test/#/banking', wait_until='networkidle')
    expect(page.locator('h1')).to_have_text('银行助手')
    expect(page.locator('.tab-bar [aria-current="page"]')).to_have_attribute('data-nav-tab', 'assistant')
    page.screenshot(path=str(OUTPUT / '01-welcome.png'), full_page=True)
    page.locator('[data-action="banking-example"]').first.click()
    expect(page.locator('#banking-input')).to_have_value('给小林转账')
    page.locator('#banking-form button[type="submit"]').click()
    expect(page.locator('.banking-task-status')).to_contain_text('等待补充')
    page.locator('#banking-input').fill('80元')
    page.locator('#banking-input').press('Enter')
    expect(page.locator('.banking-draft')).to_contain_text('当前尚未执行资金操作')
    page.locator('#banking-input').fill('改成50元')
    page.locator('#banking-form button[type="submit"]').click()
    expect(page.locator('.banking-conversation')).to_contain_text('50.00 元')
    page.reload(wait_until='networkidle')
    expect(page.locator('.banking-conversation')).to_contain_text('50.00 元')
    page.screenshot(path=str(OUTPUT / '02-ready.png'), full_page=True)
    page.locator('[data-action="banking-review"]').click()
    expect(page.locator('#finance-amount')).to_have_value('50.00')
    expect(page.locator('#finance-recipient')).to_have_value('acct-lin')
    assert not any('/operations/' in path for path in writes), writes
    page.locator('#sheet [data-action="close-sheet"]').first.click()
    page.locator('[data-action="banking-cancel"]').click()
    expect(page.locator('.banking-task-status')).to_contain_text('已取消')
    assert page.locator('[data-action="banking-review"]').count() == 0
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'horizontal overflow at 393px'
    page.set_viewport_size({'width': 1440, 'height': 1000})
    assert page.locator('.app-shell').bounding_box()['width'] <= 430
    page.set_viewport_size({'width': 320, 'height': 740})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'horizontal overflow at 320px'
    assert not errors, errors
    report = {'mode': 'intercepted API fixtures; no real model or money execution', 'checks': [
        'assistant-owned direct route', 'collect amount then correct it', 'restore server task after reload',
        'open existing review form with corrected amount', 'no operation write on task draft',
        'cancel removes draft', '393px and 320px no overflow; desktop max430px', 'no browser JS errors'], 'writes': writes, 'errors': errors}
    (OUTPUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    browser.close()
