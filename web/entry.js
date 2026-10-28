// Only a top-level wide viewport enters the showcase; preserve every query flag.
if(window.top===window&&matchMedia('(min-width: 900px)').matches&&!new URLSearchParams(location.search).has('app')){
 const target=new URL('showcase.html',location.href);
 target.search=location.search;target.hash=location.hash;location.replace(target.href);
}
