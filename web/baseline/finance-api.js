import {book, baseURL} from './api.js';
let sessionPromise, sessionBase;
function sessionFor(base) {
  if(!sessionPromise || sessionBase!==base) {
    sessionBase=base;
    const pending=book('/finance/session').catch(error=>{
      if(sessionPromise===pending)sessionPromise=null;
      throw error;
    });
    sessionPromise=pending;
  }
  return sessionPromise;
}
export async function finance(path, options={}) {
  const pending=sessionFor(baseURL('book'));
  const session=await pending;
  try {return await book('/finance'+path,{...options,headers:{...options.headers,'X-Qingcai-CSRF':session.csrf}});}
  catch(error) {
    if(error.status===401) {
      // A late failure from an older session must not discard an in-flight renewal.
      if(sessionPromise===pending)sessionPromise=null;
      // Refresh only read requests; never replay a potentially committed mutation.
      if(!options._sessionRefreshed&&(options.method||'GET').toUpperCase()==='GET')return finance(path,{...options,_sessionRefreshed:true});
    }
    throw error;
  }
}
