import {transition} from '../web/engine.mjs';
import {DEMO_VERIFICATION_CODE} from '../web/safety-policy.mjs';
export const userConsent={kind:'user',method:'click'};
export function verifyForTest(state,id){const task=state.tasks.find(t=>t.id===id);return transition(state,id,'verify',{challengeId:task?.safetyChallengeId,code:DEMO_VERIFICATION_CODE,source:userConsent});}
