import {CHAT_PROFILES,modelConnectionState} from './model-connection.mjs';

const drafts=new Map();
export function rememberModelName(provider,value){if(CHAT_PROFILES.some(p=>p.id===provider))drafts.set(provider,value);}

export function renderChatSettings(status,{esc,usage=''}){
 const profiles=Array.isArray(CHAT_PROFILES)?CHAT_PROFILES:Object.values(CHAT_PROFILES);
 const current=profiles.find(p=>p.id===status.provider)||profiles.find(p=>p.id==='minimax-official');
 const readiness=modelConnectionState(status);
 return `<h3>对话模型</h3><form id="model-form" class="form"><label>服务商<select id="chat-provider" ${status.provider_switch?'':'disabled'}>${profiles.map(p=>`<option value="${esc(p.id)}" ${p.id===current.id?'selected':''}>${esc(p.label)}</option>`).join('')}</select></label><label>Base URL<input id="base-url" type="url" value="${esc(current.base_url)}" readonly></label><label>API Key<input id="api-key" type="password" placeholder="${status.configured?'留空保留当前连接':'填写当前服务商的 Key'}" autocomplete="new-password" spellcheck="false" ${readiness.canConfigure?'':'disabled'}></label><label>模型<input id="model-name" value="${esc(drafts.get(current.id)??status.model??current.model)}" maxlength="200" spellcheck="false" autocomplete="off" required></label><p class="notice">当前连接：${esc(current.label)}。各服务商的 Key 分开保存在本次服务内存，切换不会互相使用；下方语音连接保持独立。当前消息与必要任务上下文仅发送给所选服务商。</p><p id="model-error" class="error-text" role="alert"></p><button class="primary full" type="submit" ${readiness.canConfigure?'':'disabled'}>保存本次连接</button><button class="secondary full" type="button" data-action="clear-api">清除当前连接</button></form><div class="spacer"></div><div class="card"><h3>连接状态</h3><p class="muted" id="api-status" style="margin-top:8px">${esc(readiness.message)}</p><p class="muted" id="model-usage" aria-live="polite">${esc(usage)}</p></div>`;
}
