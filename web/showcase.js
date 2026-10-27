// 展示页：手机外框按窗口缩放，演示路线驱动内嵌 App 的路由，并可一键清空演示状态。
const frame = document.getElementById('app-frame');
const steps = [...document.querySelectorAll('.sc-tour [data-route]')];
const SESSION = 'demo';

if (location.hash) frame.src = './?session=' + SESSION + location.hash;

function fit() {
  const scale = Math.min(1, (innerHeight - 48) / 868);
  document.documentElement.style.setProperty('--device-scale', Math.max(scale, 0.6).toFixed(3));
}
addEventListener('resize', fit);
fit();

function markStep() {
  const route = frame.contentWindow.location.hash.replace(/^#/, '') || '/today';
  const top = '/' + route.split('/')[1];
  steps.forEach(b => b.toggleAttribute('aria-current', false));
  const hit = steps.find(b => b.dataset.route === top);
  if (hit) hit.setAttribute('aria-current', 'step');
  history.replaceState(null, '', '#' + route);
}
frame.addEventListener('load', () => {
  frame.contentWindow.addEventListener('hashchange', markStep);
  markStep();
});

steps.forEach(b => b.addEventListener('click', () => {
  frame.contentWindow.location.hash = b.dataset.route;
  frame.focus();
}));

document.getElementById('reset').addEventListener('click', () => {
  for (const key of Object.keys(localStorage)) {
    if (key === 'finpilot-companion-v1-' + SESSION || key.startsWith('finpilot-native-' + SESSION + '-')) localStorage.removeItem(key);
  }
  // 只改 hash 不会重载 iframe，需显式 reload 才能丢掉内存里的旧状态。
  frame.contentWindow.location.hash = '/today';
  frame.contentWindow.location.reload();
});
