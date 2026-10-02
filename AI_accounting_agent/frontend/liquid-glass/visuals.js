// Dependency-free charts; all values are supplied by the existing APIs.
export const palette = ['#1d4ed8', '#4b8d80', '#8b74b7', '#c18a48', '#7094b8', '#ba7693', '#779568', '#a18974', '#6b7280', '#b06c60', '#458e9d', '#9c85b0'];

export function savingsProgress(goal, net) {
  const target = Number(goal.target);
  const projected = Math.round(Math.max(0, Number(net)) * Number(goal.percent)) / 100;
  const manual = Number(goal.manual) || 0;
  const total = Math.round((projected + manual) * 100) / 100;
  return {projected, manual, total, remaining: Math.max(0, Math.round((target - total) * 100) / 100), percent: target > 0 ? Math.min(100, total / target * 100) : 0};
}

export function maximumDrawdown(history) {
  let peak = 0, drawdown = 0;
  for (const point of [...history].sort((a, b) => a.date.localeCompare(b.date))) {
    const nav = Number(point.nav);
    if (!Number.isFinite(nav) || nav <= 0) continue;
    peak = Math.max(peak, nav);
    drawdown = Math.max(drawdown, (peak - nav) / peak);
  }
  return drawdown * 100;
}

export function normalizeSeries(stocks) {
  if (!stocks.length) return {labels: [], series: []};
  const maps = stocks.map(stock => new Map(stock.rows.filter(r => Number(r.close) > 0).map(r => [r.date, Number(r.close)])));
  const labels = [...maps[0].keys()].filter(date => maps.every(map => map.has(date))).sort();
  return {labels, series: stocks.map((stock, i) => ({name: stock.name, values: labels.map(date => maps[i].get(date) / maps[i].get(labels[0]) * 100)}))};
}

export function createVisuals({esc, money, number, prefs, empty}) {
  const hidden = () => '<div class="chart-hidden">金额已隐藏</div>';
  function bars(report) {
    if (prefs.mask) return hidden();
    const {labels, income, expense} = report.bars;
    if (!labels.length || ![...income, ...expense].some(Number)) return empty('本期暂无收支数据');
    const width = Math.max(320, labels.length * 29 + 40);
    const max = Math.max(...income, ...expense, 1), step = (width - 50) / labels.length;
    const y = v => 155 - Number(v) / max * 125;
    return `<div class="chart-container"><div class="chart-scroll" tabindex="0" aria-label="收支柱状图，可横向滚动"><svg class="bars-chart" viewBox="0 0 ${width} 185" style="min-width:${width}px" role="img" aria-label="收入和支出柱状图"><path d="M35 30H${width} M35 92H${width} M35 155H${width}" stroke="#dce3ea" stroke-dasharray="3 4"/><text x="0" y="22" class="svg-label">${esc(number(max, 0))}</text><text x="15" y="158" class="svg-label">0</text>${labels.map((label, i) => {
      const x = 38 + step * i;
      const detail = `${label}：收入 ${money(income[i])}；支出 ${money(expense[i])}`;
      return `<g class="chart-point" tabindex="0" role="button" data-action="chart-point" data-value="${esc(detail)}" aria-label="${esc(detail)}"><title>${esc(detail)}</title><rect x="${x}" y="20" width="${step}" height="140" fill="transparent"/><rect x="${x + 2}" y="${y(income[i])}" width="${Math.max(3, step / 2 - 3)}" height="${155-y(income[i])}" rx="2" fill="#4b8d80"/><rect x="${x + step / 2}" y="${y(expense[i])}" width="${Math.max(3, step / 2 - 3)}" height="${155-y(expense[i])}" rx="2" fill="#1d4ed8"/><text x="${x + step / 2}" y="175" text-anchor="middle" class="svg-label">${esc(label.slice(-5))}</text></g>`;
    }).join('')}</svg></div><p class="chart-value" aria-live="polite"></p></div>`;
  }
  function donut(items, {title = '分类占比', action = '', center = '合计', percent = false} = {}) {
    if (prefs.mask) return hidden();
    const data = items.filter(x => Number(x.value) > 0), total = data.reduce((s,x) => s + Number(x.value), 0);
    if (!total) return empty('暂无分布数据');
    let offset = 0;
    const arcs = data.map((item, i) => {
      const share = Number(item.value) / total * 100;
      const detail = `${item.name}：${percent ? number(item.value, 1)+'%' : money(item.value)}，占比 ${share.toFixed(1)}%`;
      const arc = `<circle class="${action?'chart-point':''}" cx="100" cy="100" r="74" fill="none" stroke="${palette[i%palette.length]}" stroke-width="27" pathLength="100" stroke-dasharray="${share} ${100-share}" stroke-dashoffset="${-offset}" transform="rotate(-90 100 100)" ${action?`tabindex="0" role="button" data-action="${action}" data-value="${esc(item.name)}"`:''} aria-label="${esc(detail)}"><title>${esc(detail)}</title></circle>`;
      offset += share;
      return arc;
    }).join('');
    return `<div class="donut-layout"><svg class="donut-chart" viewBox="0 0 200 200" role="img" aria-label="${esc(title)}">${arcs}<text x="100" y="95" text-anchor="middle" class="donut-caption">${esc(center)}</text><text x="100" y="117" text-anchor="middle" class="donut-total">${esc(percent ? number(total,1)+'%' : money(total))}</text></svg><div class="donut-legend">${data.map((item,i) => `<${action?'button':'div'} class="donut-legend-row" ${action?`data-action="${action}" data-value="${esc(item.name)}"`:''}><span class="legend-name"><i style="background:${palette[i%palette.length]}"></i>${esc(item.name)}</span><span>${esc(percent?number(item.value,1)+'%':money(item.value))}<small>${percent?'':(item.value/total*100).toFixed(1)+'%'}</small></span></${action?'button':'div'}>`).join('')}</div></div>`;
  }
  function comparison(report) {
    if (prefs.mask) return hidden();
    const rows = report.categories.filter(c => c.current || c.previous).sort((a,b) => b.current-a.current);
    if (!rows.length) return empty('本期和上一周期均暂无支出');
    const max = Math.max(...rows.flatMap(r => [r.current,r.previous]), 1);
    return `<div class="legend mb"><span><b></b>本期</span><span><b class="previous"></b>上一周期</span></div>${rows.map(row => `<button class="comparison-row" data-action="visual-category" data-value="${esc(row.name)}"><span class="row between"><strong>${esc(row.name)}</strong><small>${row.previous ? `${row.current>=row.previous?'+':''}${((row.current-row.previous)/row.previous*100).toFixed(1)}%` : '上期无支出'}</small></span><span class="comparison-track"><i style="width:${row.current/max*100}%"></i><span>${money(row.current)}</span></span><span class="comparison-track previous"><i style="width:${row.previous/max*100}%"></i><span>${money(row.previous)}</span></span></button>`).join('')}`;
  }
  function lines({labels, series}) {
    if (prefs.mask) return hidden();
    if (labels.length < 2) return empty('所选证券缺少共同日期的数据，无法比较');
    const values = series.flatMap(s => s.values), high = Math.max(...values), low = Math.min(...values), diff = high-low || 1;
    const x = i => 30+i*278/(labels.length-1), y = value => 140-(value-low)/diff*105;
    return `<div class="chart-container"><svg class="chart" viewBox="0 0 320 172" role="img" aria-label="自选股归一化历史走势"><path d="M30 35H308 M30 140H308" stroke="#dce3ea" stroke-dasharray="3 4"/><text x="0" y="28" class="svg-label">${number(high,1)}</text><text x="0" y="153" class="svg-label">${number(low,1)}</text>${series.map((s,index) => `<polyline points="${s.values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="${palette[index]}" stroke-width="2"/>`).join('')}${labels.map((label,i) => { const detail=label+' · '+series.map(s=>`${s.name} ${number(s.values[i],2)}`).join('；'); return `<rect class="chart-point" tabindex="0" role="button" x="${x(i)-6}" y="28" width="12" height="118" fill="transparent" data-action="chart-point" data-value="${esc(detail)}" aria-label="${esc(detail)}"><title>${esc(detail)}</title></rect>`; }).join('')}</svg><div class="chart-labels"><span>${esc(labels[0])}</span><span>${esc(labels.at(-1))}</span></div><div class="chart-value" aria-live="polite"></div><div class="series-legend">${series.map((s,i)=>`<span><i style="background:${palette[i]}"></i>${esc(s.name)}</span>`).join('')}</div></div>`;
  }
  return {bars, donut, comparison, lines};
}
