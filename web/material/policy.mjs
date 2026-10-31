// Rendering policy only. No account, message, permission or API state enters here.
export const MAX_SURFACES = 8;
export const TEXTURE_LIMIT = 16 * 1024 * 1024;
export function rasterScale(width, height, deviceDpr = 1, cap = 1.5) {
  if (![width, height, deviceDpr, cap].every(Number.isFinite) || width <= 0 || height <= 0) return 1;
  return Math.min(deviceDpr, cap, Math.sqrt(TEXTURE_LIMIT / (width * height * 4 * (1 + 4 / 3))));
}
export function visibleSurfaces(shapes, height, max = MAX_SURFACES, out = []) {
  out.length=0;
  for(const s of shapes) if(s.rect[2]>0&&s.rect[3]>0&&s.rect[1]<height+24&&s.rect[1]+s.rect[3]>-24) out.push(s);
  out.sort((a,b)=>Number(b.nav)-Number(a.nav)||a.order-b.order);
  out.length=Math.min(out.length,max);
  return out.sort((a,b)=>Number(a.nav)-Number(b.nav)||a.order-b.order);
}
export function qualityDecision({gpuSamples = 0, gpuP95 = 0, cpuSamples = 0, cpuP95 = 0, cap = 1.5}) {
  // RAF cadence is deliberately not an input: background throttling is not GPU cost.
  const overBudget = (gpuSamples >= 20 && gpuP95 > 4) || (cpuSamples >= 120 && cpuP95 > 8);
  return overBudget ? (cap > 1 ? 'lower-resolution' : 'readable-fallback') : 'keep';
}
// Closed disclosure content can retain layout rectangles in Chromium. Those
// rectangles are not visible surfaces and must never create a glass backplate.
export function canPaintSurface(element){
  return !element.closest('details:not([open])') || !!element.closest('summary');
}
