const integer=(value,label,{positive=false}={})=>{
 if(!Number.isSafeInteger(value)||(positive?value<=0:value<0))throw Error(label+'无效');
 return value;
};
export const paperReviewFingerprint=review=>JSON.stringify([review.code,review.name,review.side,review.quantity,review.priceMinor,review.referenceMinor,review.amountMinor,review.quoteDate,review.revision]);
export const paperExecutionId=requestId=>'paper-execution:'+requestId;

// The host must collect user consent and an independent challenge for this exact
// descriptor. A review/quote, a model message, or a button's boolean is not a permit.
export function paperOperation(state,review,requestId,{scheduledAt}={}){
 if(typeof requestId!=='string'||!/^[-\w]{8,100}$/.test(requestId))throw Error('操作标识无效');
 if(!review||typeof review!=='object'||!/^\d{6}$/.test(review.code)||typeof review.name!=='string'||!review.name.trim()||review.name.length>100)throw Error('证券资料无效');
 if(!['buy','sell'].includes(review.side))throw Error('操作类型无效');
 integer(review.quantity,'数量',{positive:true});integer(review.priceMinor,'价格',{positive:true});
 integer(review.referenceMinor,'参考价格',{positive:true});integer(review.amountMinor,'金额',{positive:true});integer(review.revision,'持仓版本');
 if(!Number.isSafeInteger(review.quantity*review.priceMinor)||review.amountMinor!==review.quantity*review.priceMinor||review.fingerprint!==paperReviewFingerprint(review))throw Error('操作参数已变化，请重新核对');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(review.quoteDate||''))throw Error('参考行情日期缺失，暂不能买卖');
 // Immediate trading is not scheduled for the fixture's future story date.
 // Historical quoteDate remains bound separately; the host may pass an explicit clock time.
 const when=scheduledAt??null;
 if(when!==null&&(typeof when!=='string'||!Number.isFinite(Date.parse(when))))throw Error('执行日期无效');
 const kind=review.side==='buy'?'paper_buy':'paper_sell';
 const binding={code:review.code,name:review.name,side:review.side,quantity:review.quantity,priceMinor:review.priceMinor,
  referenceMinor:review.referenceMinor,amountMinor:review.amountMinor,quoteDate:review.quoteDate,portfolioRevision:review.revision,requestId};
 const parameters=JSON.stringify(binding);
 return Object.freeze({id:'paper:'+requestId,revision:review.revision+1,kind,target:review.name,amountMinor:review.amountMinor,currency:'CNY',
  parameters,parameterKey:parameters,scope:Object.freeze({action:kind,code:review.code,requestId,account:'investment_settlement'}),
  scheduledAt:when,source:Object.freeze({kind:'user'}),writes:true});
}
