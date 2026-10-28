// Keep immutable bundled history out of each browser-session copy. User edits,
// deletions, manual bills, tasks and receipts are always stored in full.
import {HISTORY_ROWS,HISTORY_VERSION} from './history-ledger.mjs';
const fixtureKeys=new Set(['id','date','title','category','amountMinor','direction','movement','payment_method','accountLabel','source','icon','order','taskId','receipt']);
const fixture=(r,i,baseOrder)=>{const [id,date,title,category,amountMinor,direction,movement,payment_method,accountLabel]=r;return {id,date,title,category,amountMinor,direction,movement,payment_method,accountLabel,source:'synthetic',icon:'receipt',order:baseOrder+i,taskId:null,receipt:null};};
const canonical=new Map(HISTORY_ROWS.map((r,i)=>[r[0],{r,i}]));
export function encodeAppState(state){
 if(!Array.isArray(state.ledger)||state.ledgerHistoryVersion!==HISTORY_VERSION)return JSON.stringify(state);
 const present=new Set(state.ledger.map(r=>r.id));let baseOrder=null;
 const ledger=state.ledger.filter(row=>{
  const c=canonical.get(row.id);if(!c)return true;
  const offset=row.order-c.i;if(!Number.isSafeInteger(offset))return true;
  const expected=fixture(c.r,c.i,offset);
  if(Object.keys(row).some(k=>!fixtureKeys.has(k))||Object.keys(expected).some(k=>row[k]!==expected[k]))return true;
  if(baseOrder===null)baseOrder=offset;
  return offset!==baseOrder;
 });
 const excluded=HISTORY_ROWS.filter(r=>!present.has(r[0])).map(r=>r[0]);
 return JSON.stringify({...state,ledger,historyCompact:{version:HISTORY_VERSION,baseOrder:baseOrder??0,excluded}});
}
export function decodeAppState(raw){
 const state=JSON.parse(raw);if(!state?.historyCompact)return state;
 const compact=state.historyCompact;
 if(compact.version!==HISTORY_VERSION||!Array.isArray(state.ledger)||!Number.isSafeInteger(compact.baseOrder)||!Array.isArray(compact.excluded))throw Error('历史账本存储格式不兼容');
 const ids=new Set(state.ledger.map(r=>r.id)),excluded=new Set(compact.excluded);
 for(let i=0;i<HISTORY_ROWS.length;i++){const r=HISTORY_ROWS[i];if(!ids.has(r[0])&&!excluded.has(r[0]))state.ledger.push(fixture(r,i,compact.baseOrder));}
 state.ledger.sort((a,b)=>a.order-b.order);delete state.historyCompact;return state;
}
