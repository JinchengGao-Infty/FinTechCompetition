// URL and reset rules shared by the showcase and regression tests.
export function appStateKey(session=''){
 const namespace=String(session).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,30);
 return 'finpilot-companion-v1'+(session?'-'+namespace:'');
}
export function appURL(href,route){
 const source=new URL(href),url=new URL('./',source);
 url.search=source.search;url.searchParams.set('app','1');
 if(!url.searchParams.get('session'))url.searchParams.set('session','demo');
 url.hash=route||source.hash||'#/today';return url;
}
export function demoResetKeys(keys,session){
 const state=appStateKey(session),namespace=String(session).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,30);
 const exact=new Set([state,state+'-before-history-v1']);
 const prefixes=['finpilot-native-'+state+'-','finpilot-native-'+namespace+'-'];
 return keys.filter(key=>exact.has(key)||prefixes.some(prefix=>key.startsWith(prefix)&&/^[A-Z][A-Z0-9_]*$/.test(key.slice(prefix.length))));
}
export function deviceScale(width,height){return Math.max(.2,Math.min(1,(height-48)/868,(width-48)/414));}
