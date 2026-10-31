// TTS-only text projection. Never use this output for UI, authorization or money math.
export const SPEECH_NUMBER_VERSION='zh-numbers-1';
const digits='零一二三四五六七八九';
const perDigit=value=>String(value).replace(/\d/g,n=>digits[Number(n)]);
function section(n){
 let out='',zero=false;
 for(let place=1000,i=3;place>=1;place/=10,i--){const d=Math.floor(n/place)%10;
  if(d){if(zero&&out)out+='零';out+=digits[d]+['','十','百','千'][i];zero=false;}else if(out)zero=true;
 }return out;
}
export function chineseNumber(value){
 const raw=String(value).replace(/,/g,'');
 if(!/^[+-]?\d{1,12}(?:\.\d{1,6})?$/.test(raw))return null;
 const sign=raw[0]==='-'?'负':raw[0]==='+'?'正':'',absolute=raw.replace(/^[+-]/,'');
 const [whole,fraction]=absolute.split('.');let n=Number(whole),out='';
 for(const [unit,label] of [[100000000,'亿'],[10000,'万'],[1,'']]){
  const part=Math.floor(n/unit);n%=unit;
  if(part){if(out&&part<1000)out+='零';out+=section(part)+label;}
 }
 out=(out||'零').replace(/^一十/,'十');
 return sign+out+(fraction&&!/^0+$/.test(fraction)?'点'+perDigit(fraction):'');
}
function dateReading(raw){
 const m=/^(?:(\d{4})[年/.-])?(\d{1,2})[月/.-](\d{1,2})(?:日|号)?$/.exec(raw);
 if(!m)return null;const y=Number(m[1]||2000),month=Number(m[2]),day=Number(m[3]);
 const d=new Date(Date.UTC(y,month-1,day));if(d.getUTCFullYear()!==y||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return null;
 return (m[1]?perDigit(m[1])+'年':'')+chineseNumber(month)+'月'+chineseNumber(day)+'日';
}
function timeReading(raw){
 const m=/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw);if(!m)return null;
 const h=Number(m[1]),minute=Number(m[2]),second=Number(m[3]||0);if(h>23||minute>59||second>59)return null;
 const period=h<6?'凌晨':h<12?'上午':h===12?'中午':h<18?'下午':'晚上';
 return period+chineseNumber(h%12||12)+'点'+(minute?chineseNumber(minute)+'分':'')+(second?chineseNumber(second)+'秒':'');
}
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Each recognized span is protected from later rules, including invalid/ambiguous tokens.
export function normalizeSpeechNumbers(input,{fields=[]}={}){
 if(typeof input!=='string')return '';
 let parts=[{text:input.normalize('NFKC'),done:false}];
 const apply=(pattern,convert)=>{parts=parts.flatMap(part=>{
  if(part.done)return [part];const result=[];let offset=0;
  for(const match of part.text.matchAll(pattern)){result.push({text:part.text.slice(offset,match.index),done:false});result.push({text:convert(match)??match[0],done:true});offset=match.index+match[0].length;}
  result.push({text:part.text.slice(offset),done:false});return result;
 });};
 // Host-owned hints only select spans already present in speak; no field value is appended.
 for(const field of fields.slice(0,24)){
  if(!field||typeof field.text!=='string'||!field.text||field.text.length>80)continue;
  const text=field.text.normalize('NFKC');let spoken=null;
  if(field.kind==='identifier'&&/\d{2,8}$/.test(text)&&!/\d{9}/.test(text))spoken=perDigit(text);
  if(field.kind==='date')spoken=dateReading(text);
  if(field.kind==='time')spoken=timeReading(text);
  if(spoken)apply(new RegExp('(?<![A-Za-z0-9_.])'+escape(text)+'(?![A-Za-z0-9_.]|\\s*(?:元|万元|%))','gu'),()=>spoken);
 }
 apply(/(?<![A-Za-z0-9_.])(?:\d{4}年)?\d{1,2}月\d{1,2}(?:日|号)/gu,m=>dateReading(m[0]));
 apply(/(?<![A-Za-z0-9_.])\d{4}[/.-]\d{1,2}[/.-]\d{1,2}(?![A-Za-z0-9_.])/gu,m=>dateReading(m[0]));
 apply(/(?<![A-Za-z0-9_.:])(?:凌晨|上午|中午|下午|晚上)?\s*\d{1,2}:\d{2}(?::\d{2})?(?![A-Za-z0-9_.:])/gu,m=>{
  const raw=m[0].trim(),prefix=/^(凌晨|上午|中午|下午|晚上)/.exec(raw)?.[0],clock=raw.replace(/^(凌晨|上午|中午|下午|晚上)/,'').trim();
  if(!prefix)return (m[0].startsWith(' ')?' ':'')+ (timeReading(clock)||raw);
  const h=Number(clock.split(':')[0]);if(h>12){const full=timeReading(clock);return full?.startsWith(prefix)?full:null;}
  const reading=timeReading(clock);return reading?prefix+reading.replace(/^(凌晨|上午|中午|下午|晚上)/,''):null;
 });
 // Unknown IDs, versions, ISO timestamps/timezones and malformed numeric tokens stay conservative.
 apply(/[A-Za-z][A-Za-z0-9_.:-]*|\d+(?:[._:/-]\d+){2,}(?:[A-Za-z][A-Za-z0-9:Z+-]*)?/gu,()=>null);
 apply(/(?:银行卡|信用卡|工资卡|生活卡|卡号|账户|账号|尾号|手机号|手机|电话)(?:是|为)?\s*[:：]?\s*\d(?:[ -]?\d){1,23}(?!\d|\.\d|\s*(?:元|万元|%))/gu,m=>perDigit(m[0]));
 const number='[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
 apply(new RegExp('(?<![A-Za-z0-9_.])(?:[¥￥]'+number+'(?:元)?|'+number+'\\s*元)(?![A-Za-z0-9_.])','gu'),m=>{
  const n=m[0].replace(/[¥￥元\s]/g,'');return chineseNumber(n)?.concat('元');
 });
 apply(new RegExp('(?<![A-Za-z0-9_.])'+number+'[%％](?![A-Za-z0-9_.])','gu'),m=>{
  const n=m[0].replace(/[%％]/g,''),spoken=chineseNumber(n);return spoken?(spoken.startsWith('负')?'负百分之'+spoken.slice(1):spoken.startsWith('正')?'正百分之'+spoken.slice(1):'百分之'+spoken):null;
 });
 return parts.map(p=>p.text).join('');
}
