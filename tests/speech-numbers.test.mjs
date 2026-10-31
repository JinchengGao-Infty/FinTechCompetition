import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSpeechNumbers as say,chineseNumber} from '../web/speech-numbers.mjs';
import {extractSpeech,createVoiceDemo} from '../web/voice-demo.mjs';

test('account suffixes are digits while amounts retain numeric meaning',()=>{
 assert.equal(say('生活账户1608,尾号0826;1608元,¥520.00。'),'生活账户一六零八,尾号零八二六;一千六百零八元,五百二十元。');
 assert.equal(say('账户1608元不能按编号读。'),'账户一千六百零八元不能按编号读。');
 assert.equal(say('信用卡0921,工资卡0826。'),'信用卡零九二一,工资卡零八二六。');
});
test('time, date and local timestamp preserve the exact calendar and clock',()=>{
 assert.equal(say('11月9日16:00,13:14,2026/11/9 13:14:00。'),'十一月九日下午四点,下午一点十四分,二零二六年十一月九日 下午一点十四分。');
 assert.equal(say('00:05:09,12:00,23:59,下午4:00。'),'凌晨十二点五分九秒,中午十二点,晚上十一点五十九分,下午四点。');
 assert.equal(say('2026-02-29,25:70,2026-11-09T05:14:00Z。'),'2026-02-29,25:70,2026-11-09T05:14:00Z。');
 assert.equal(say('上午16:00,下午16:00。'),'上午16:00,下午四点。');
});
test('money, sign, decimal and percentage values survive mixed speech',()=>{
 assert.equal(say('¥1,600.50,-12.25元,收益率-0.5%,比例3.00%。'),'一千六百点五零元,负十二点二五元,收益率负百分之零点五,比例百分之三。');
 assert.equal(chineseNumber('10001'),'一万零一');assert.equal(chineseNumber('100000001'),'一亿零一');
 assert.equal(chineseNumber('1234567890123'),null);
});
test('unknown bare numbers, versions, codes and IDs are not guessed as quantities',()=>{
 assert.equal(say('版本1.2.3,编号1608,订单A1608,MiniMax-M3.1-Flash,2.5,11/9。'),'版本1.2.3,编号1608,订单A1608,MiniMax-M3.1-Flash,2.5,11/9。');
});
test('host typed fields take priority without appending or changing unrelated numbers',()=>{
 const fields=[{kind:'identifier',text:'1608'},{kind:'date',text:'11月9日'},{kind:'identifier',text:'0826'}];
 assert.equal(say('核对1608,付款1608元,11月9日。',{fields}),'核对一六零八,付款一千六百零八元,十一月九日。');
 assert.equal(say('没有这个字段',{fields}),'没有这个字段');
});
test('only speak changes; full identifiers and secrets remain redacted after normalization',()=>{
 const envelope={reply:'生活账户1608,520元',speak:'生活账户1608,¥520.00,手机号13800000001,卡号6222123456781234,验证码123456。',cards:[{amountMinor:52000}]};
 const before=structuredClone(envelope),result=extractSpeech(envelope);
 assert.deepEqual(envelope,before);assert.match(result.speak,/生活账户一六零八,五百二十元/);
 assert.doesNotMatch(result.speak,/138000|一三八零|六二二二|123456|一二三四五六/);
 assert.match(result.speak,/号码已隐藏/);assert.match(result.speak,/验证信息已隐藏/);
});
test('phone digits use zero, not quantity or yao, before existing privacy masking',()=>{
 assert.equal(say('电话13800000001。'),'电话一三八零零零零零零零一。');
 assert.equal(extractSpeech({speak:'电话13800000001。'}).speak,'电话号码已隐藏。');
});
test('normalization is idempotent across voice core and streaming adapter',()=>{
 const input='11月9日16:00从生活账户1608支付¥520.00,比例1.25%。';
 assert.equal(say(say(input)),say(input));
 assert.equal(extractSpeech({speak:extractSpeech({speak:input}).speak}).speak,extractSpeech({speak:input}).speak);
});
test('expansion exceeding the speech limit fails closed rather than cutting numeric meaning',()=>{
 assert.equal(extractSpeech({speak:'520元,'.repeat(110)}).reason,'normalized-speak-too-long');
});
test('voice receives normalized whole sentences and replay keeps the same reading',async()=>{
 const calls=[],voice=createVoiceDemo({tts:{kind:'test',supported:true,cancel(){},async speak(text){calls.push(text);}},input:{supported:false},getSpeechFields:()=>[{kind:'identifier',text:'账户1608'}]});
 voice.enable({userGesture:true});const envelope={reply:'屏幕仍为16:00',speak:'账户1608,11月9日16:00,¥520.00。'};
 await voice.speak(envelope,{messageId:'n1'});await voice.replay();
 assert.deepEqual(calls,['账户一六零八,十一月九日下午四点,五百二十元。','账户一六零八,十一月九日下午四点,五百二十元。']);
 assert.equal(envelope.reply,'屏幕仍为16:00');voice.dispose();
});
