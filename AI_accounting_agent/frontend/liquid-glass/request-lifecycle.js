// A stopped request can never publish a late response into a newer conversation.
export function createRequestLifecycle(){
 let sequence=0,current=null;
 return {
  get current(){return current;},
  start(){current?.controller.abort();const controller=new AbortController();current={id:++sequence,controller,signal:controller.signal};return current;},
  isCurrent(run){return current===run&&!run.signal.aborted;},
  stop(){if(!current)return false;const run=current;current=null;run.controller.abort();return true;},
  finish(run){if(current!==run)return false;current=null;return true;}
 };
}
