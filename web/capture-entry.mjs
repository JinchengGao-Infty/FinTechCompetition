import {categoryBadgeStyle,categoryIconKey} from './baseline/category-icons.js';
// Original 65271 manual-entry markup; host owns candidate creation and draft.
export function entryPage(paint,ctx){
 const {draft,btn,esc,icon,card,segmented,categories}=ctx;
 const entryCategories=()=>categories[draft.type];
 const categoryIcons=Object.fromEntries(entryCategories().map(c=>[c,categoryIconKey(c,draft.type)]));
 paint(`<div class="pc-entry-shortcut">${btn('文字与票据录入','product-capture-open','small')}</div><form id="entry-form" class="stitch-entry-form">${segmented(['支出','收入'],draft.type==='income'?'收入':'支出','entry-type')}
 ${card(`<label class="entry-amount-label" for="entry-amount">${icon('ledger')}<span>输入金额</span></label><div class="entry-amount-line"><span>¥</span><input id="entry-amount" name="amount" type="number" inputmode="decimal" step="0.01" min="0.01" max="999999999" required placeholder="0.00" value="${esc(draft.amount)}" aria-label="账单金额"></div>`,'entry-amount-card')}
 ${card(`<details class="mobile-category-picker entry-category-row"><summary><span class="entry-row-label"><i style="${categoryBadgeStyle(draft.category,draft.type)}">${icon(categoryIconKey(draft.category,draft.type))}</i>分类</span><strong>${esc(draft.category)}</strong>${icon('next')}</summary><div class="category-grid">${entryCategories().map(c=>`<button type="button" class="${draft.category===c?'selected':''}" data-action="entry-category" data-value="${c}" style="${categoryBadgeStyle(c,draft.type)}">${icon(categoryIcons[c])}${c}</button>`).join('')}</div></details>
 <div class="entry-detail-row"><label class="entry-row-label" for="entry-payment"><i>${icon('home')}</i>支付方式</label><select id="entry-payment" name="payment" aria-label="支付方式">${['','微信支付','支付宝','银行卡','信用卡','现金','其他'].map(v=>`<option ${draft.payment===v?'selected':''} value="${v}">${v||'未填写'}</option>`).join('')}</select></div>
 <div class="entry-detail-row"><label class="entry-row-label" for="entry-date"><i>${icon('calendar')}</i>日期</label><input id="entry-date" type="date" name="event_date" value="${esc(draft.event_date)}" required></div>
 <div class="entry-detail-row"><label class="entry-row-label" for="entry-description"><i>${icon('ledger')}</i>备注</label><input id="entry-description" name="description" maxlength="512" placeholder="添加备注" value="${esc(draft.description)}" required></div>`,'entry-details-card')}
 <div id="entry-error" role="alert"></div><button id="save-entry" class="btn primary entry-save" type="submit">核对记录</button>
`);
}