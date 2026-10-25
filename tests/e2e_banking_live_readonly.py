"""Live read-only finance check; creates a bill-analysis task but no money operation."""
import json
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / '.runtime/banking-frontend-live'
OUTPUT.mkdir(parents=True, exist_ok=True)
FRONT = os.environ.get('FINPILOT_TEST_FRONT', 'http://10.120.17.24:5503')
errors, writes = [], []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=os.environ.get('PLAYWRIGHT_EXECUTABLE_PATH'), args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 393, 'height': 852}, locale='zh-CN')
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda req: writes.append(req.url) if '/api/' in req.url and req.method not in {'GET', 'HEAD', 'OPTIONS'} else None)
    page.goto(FRONT + '/#/home', wait_until='networkidle')
    expect(page.locator('[data-action="banking-open"]')).to_be_visible()
    assert page.locator('main .error').count() == 0, page.locator('main').inner_text()
    page.screenshot(path=str(OUTPUT / '01-home-393.png'), full_page=True)
    page.locator('[data-action="banking-open"]').click()
    expect(page.locator('h1')).to_have_text('银行助手')
    page.locator('#banking-input').fill('9月餐饮支出和8月比较')
    with page.expect_response(lambda response: response.url.endswith('/finance/bank-tasks') and response.request.method == 'POST') as response:
        page.locator('#banking-form button[type="submit"]').click()
    result = response.value.json()
    assert response.value.status == 200, result
    assert result['kind'] == 'bills' and result['status'] == 'completed', result
    expect(page.locator('.banking-fact-card')).to_be_visible()
    page.locator('.banking-evidence summary').click()
    expect(page.locator('.banking-evidence article').first).to_be_visible()
    assert page.locator('.banking-evidence article').count() == len(result['facts']['evidence'])
    assert '演示数据' in page.locator('.banking-fact-card').inner_text()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path=str(OUTPUT / '02-bill-evidence-393.png'), full_page=True)
    page.reload(wait_until='networkidle')
    expect(page.locator('.banking-task-status')).to_contain_text('分析已完成')
    page.set_viewport_size({'width': 1440, 'height': 1000})
    assert page.locator('.app-shell').bounding_box()['width'] <= 430
    page.screenshot(path=str(OUTPUT / '03-desktop.png'), full_page=True)
    page.set_viewport_size({'width': 320, 'height': 740})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert all(url.endswith('/finance/bank-tasks') for url in writes), writes
    assert not errors, errors
    report = {'mode': 'live service; bill-analysis task only, no funds writes', 'front': FRONT,
              'checks': ['homepage entry', 'bill periods and real evidence display', 'demo-data label',
                         'same-session reload recovery', '393/320px no overflow', '430px desktop width', 'no browser JS errors'],
              'facts': {key: result['facts'][key] for key in ['period', 'comparison_period', 'record_count', 'totals']},
              'writes': writes, 'errors': errors}
    (OUTPUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    browser.close()
