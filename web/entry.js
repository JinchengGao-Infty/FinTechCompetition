// 宽屏直接打开时进入展示页；内嵌在展示页里或带 ?app=1 时保持原 App。
if (window.top === window && matchMedia('(min-width: 900px)').matches && !new URLSearchParams(location.search).has('app')) {
  location.replace('showcase.html' + location.hash);
}
