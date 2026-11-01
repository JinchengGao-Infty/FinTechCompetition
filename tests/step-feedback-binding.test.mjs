import test from 'node:test';
import assert from 'node:assert/strict';
import {renderStepPlan} from '../web/plan-step-ui.mjs';
test('previous receipt cannot replace next-step controls for any success type or rerender',()=>{
 for(const operation of ['reserve_restaurant','message_contact','send_sms','pay_deposit','schedule_local_task','transfer']){
  const old={id:'old',operation,status:'succeeded',receipt_id:'receipt-old',confirmation_required:true,payload:{}};
  const node={id:'next',operation:'pay_deposit',status:'needs_confirmation',confirmation_required:true,payload:{amount_minor:5000}};
  const plan={id:'plan',kind:'birthday',revision:1,status:'needs_confirmation',steps:[old,node]};
  for(let i=0;i<3;i++){
   const html=renderStepPlan(plan,{esc:String,money:String,node,operation:{target:'cake'},feedback:old,details:'previous receipt retained'});
   assert.doesNotMatch(html,/action-success|data-success-receipt/);assert.match(html,/确认支付定金/);assert.match(html,/previous receipt retained/);
  }
  assert.doesNotMatch(renderStepPlan({...plan,status:'cancelled'},{esc:String,money:String,node:null,feedback:old}),/action-success/);
 }
});
test('only a matching committed receipt can show success on its own step',()=>{
 const node={id:'same',operation:'reserve_restaurant',status:'succeeded',receipt_id:'ok',confirmation_required:true,payload:{}};
 const plan={id:'plan',kind:'birthday',revision:1,status:'succeeded',steps:[node]};
 const render=feedback=>renderStepPlan(plan,{esc:String,money:String,node,feedback});
 assert.match(render(node),/data-success-receipt="ok"/);
 assert.doesNotMatch(render({...node,receipt_id:'stale'}),/action-success/);
 assert.doesNotMatch(render({...node,status:'started',receipt_id:null}),/action-success/);
});
