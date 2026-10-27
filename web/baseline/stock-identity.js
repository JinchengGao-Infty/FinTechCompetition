// Company artwork is stored locally; original sources and exact-pixel crops accompany it.
export const STOCK_LOGOS = Object.freeze({
 "600036": [
  "招商银行",
  "600036.png"
 ],
 "600519": [
  "贵州茅台",
  "600519.png"
 ],
 "600900": [
  "长江电力",
  "600900.png"
 ],
 "601088": [
  "中国神华",
  "601088.png"
 ],
 "601138": [
  "工业富联",
  "601138.png"
 ],
 "601288": [
  "农业银行",
  "601288.png"
 ],
 "601398": [
  "工商银行",
  "601398.png"
 ],
 "601628": [
  "中国人寿",
  "601628.png"
 ],
 "601857": [
  "中国石油",
  "601857.svg"
 ],
 "601988": [
  "中国银行",
  "601988.png"
 ]
});
export const STOCK_IDENTITIES = STOCK_LOGOS;
export function stockIdentity(code){
 const normalized=String(code).replace(/\D/g,'').slice(-6),logo=STOCK_LOGOS[normalized];
 if(!logo)return '';
 return `<img class="fp-stock-company-logo" data-company-logo="${normalized}" src="./assets/company-logos/${logo[1]}" alt="" aria-hidden="true" title="${logo[0]}标志" draggable="false" decoding="async" loading="lazy">`;
}
