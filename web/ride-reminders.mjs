// In-app reminders only. The confirmed ride receipt is the scheduling authority.
export function reconcileRideReminders(state,plans,{now,epoch=state.safety?.epoch}={}){
 const at=Number(now);state.rideReminders??={};const seen=new Set();
 for(const plan of plans)for(const step of plan.steps||[]){
  if(step.operation!=='reserve_ride'||!step.payload.reminder_before_minutes)continue;
  const id=plan.id+':'+step.id,old=state.rideReminders[id],binding=JSON.stringify([plan.revision,step.payload]);seen.add(id);
  if(plan.status==='cancelled'||step.status!=='succeeded'||!step.receipt_id){if(old)old.status='cancelled';continue;}
  if(old?.binding===binding)continue;
  const departure=Date.parse(step.payload.date+'T'+step.payload.departure_time+':00+08:00'),due=departure-3600000;
  state.rideReminders[id]={id,planId:plan.id,binding,epoch,departure,due,origin:step.payload.origin,destination:step.payload.destination,status:due>at?'scheduled':'missed',receipt:step.receipt_id};
 }
 for(const row of Object.values(state.rideReminders))if(!seen.has(row.id)&&row.status==='scheduled')row.status='cancelled';
 return state.rideReminders;
}
export function tickRideReminders(state,{now}={}){
 const delivered=[];
 for(const row of Object.values(state.rideReminders||{})){
  if(row.status!=='scheduled')continue;
  if(row.epoch!==state.safety?.epoch||state.safety?.locked||state.paused){row.status='paused';continue;}
  if(now<row.due)continue;
  if(now-row.due>60000){row.status='missed';continue;}
  row.status='delivered';row.deliveredAt=now;delivered.push({...row});
 }
 return delivered;
}
export function cancelRideReminder(state,id){const r=state.rideReminders?.[id];if(r&&r.status==='scheduled')r.status='cancelled';}
