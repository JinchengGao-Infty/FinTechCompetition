import test from 'node:test';import assert from 'node:assert/strict';
import {chronologicalAudit,renderSafetyAudit} from '../web/companion-ui.mjs';
test('audit is stable chronological evidence across days, equal timestamps and missing time',()=>{
 const rows=[{label:'next',atISO:'2026-11-02T00:00:00Z'},{label:'missing'},{label:'early',at:Date.parse('2026-11-01T23:59:59Z')},{label:'equal',atISO:'2026-11-02T00:00:00Z'},{label:'invalid',atISO:'invalid'}];const snapshot=structuredClone(rows);
 for(let i=0;i<3;i++)assert.deepEqual(chronologicalAudit(rows).map(x=>x.label),['early','next','equal','missing','invalid']);
 assert.deepEqual(rows,snapshot);const html=renderSafetyAudit(rows,{esc:String});assert.ok(html.indexOf('early')<html.indexOf('next'));assert.ok(html.indexOf('next')<html.indexOf('equal'));
});
