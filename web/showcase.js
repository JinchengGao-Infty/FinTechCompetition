import {appURL,demoResetKeys,deviceScale} from './desktop-session.mjs';
const frame=document.getElementById('app-frame');
const steps=[...document.querySelectorAll('.sc-tour [data-route]')];
const initial=appURL(location.href);
const session=initial.searchParams.get('session');
const openApp=document.getElementById('open-app');
function fit(){document.documentElement.style.setProperty('--device-scale',deviceScale(innerWidth,innerHeight).toFixed(3));}
addEventListener('resize',fit);fit();
function markStep(){
 const route=frame.contentWindow.location.hash.replace(/^#/,'')||'/today';
 const top='/'+route.split('/')[1];
 steps.forEach(button=>button.removeAttribute('aria-current'));
 steps.find(button=>button.dataset.route===top)?.setAttribute('aria-current','step');
 const outer=new URL(location.href);outer.hash=route;history.replaceState(null,'',outer);
 openApp.href=appURL(location.href,route).href;
}
frame.addEventListener('load',()=>{frame.contentWindow.addEventListener('hashchange',markStep);markStep();});
steps.forEach(button=>button.addEventListener('click',()=>{frame.contentWindow.location.hash=button.dataset.route;frame.focus();}));
document.getElementById('reset').addEventListener('click',()=>{
 for(const key of demoResetKeys(Object.keys(localStorage),session))localStorage.removeItem(key);
 // Reload only this demo namespace. API cookies and other sessions stay intact.
 frame.src=appURL(location.href,'/today').href;
});
openApp.href=initial.href;frame.src=initial.href;
