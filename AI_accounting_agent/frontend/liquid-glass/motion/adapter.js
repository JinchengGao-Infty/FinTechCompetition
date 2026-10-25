/**
 * Observe an existing, read-only receipt/reconcile callback.
 * No submit, retry, permission, balance, idempotency or persistence behavior lives here.
 * The host must normalize its actual API response into the documented receipt shape.
 */
export function createReceiptAdapter(view,{readReceipt,onError=()=>{}}={}) {
  if(typeof readReceipt!=='function')throw new TypeError('readReceipt callback is required');
  let active=null,disposed=false;
  return {
    async verify(data) {
      if(disposed)throw new Error('Disposed receipt adapter');
      // A repeated click shares the read and its presentation run.
      if(active&&active.requestId===data.requestId&&active.objectId===data.objectId)return active.promise;
      active?.controller.abort();
      const controller=new AbortController(),run=view.begin(data),item={requestId:data.requestId,objectId:data.objectId,controller,promise:null};
      active=item;
      item.promise=Promise.resolve().then(()=>readReceipt({requestId:data.requestId,objectId:data.objectId,signal:controller.signal})).then(receipt=>{
        if(disposed||active!==item||controller.signal.aborted||run.signal.aborted)return false;
        return view.receive(receipt);
      }).catch(error=>{
        if(disposed||active!==item||controller.signal.aborted||run.signal.aborted)return false;
        // A network error is uncertainty. It never means failed payment/failed entry.
        view.receive({requestId:data.requestId,objectId:data.objectId,status:'unknown'});onError(error);return false;
      }).finally(()=>{if(active===item)active=null;});
      return item.promise;
    },
    receive(receipt){return !disposed&&view.receive(receipt);},
    stop(){if(disposed)return;active?.controller.abort();active=null;view.stop();},
    dispose(){if(disposed)return;disposed=true;active?.controller.abort();active=null;view.dispose();}
  };
}
