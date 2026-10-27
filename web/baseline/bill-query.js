// Only a single, unambiguous month metric gets a deterministic amount card.
// Other language keeps the existing assistant path instead of guessing a range.
export function billQueryKind(text){
 if(!/花|支出|消费|收入|结余|还剩/.test(text))return null;
 if(/上月|上个?月|下月|下个?月|去年|今年|本年|本周|上周|下周|今天|昨天|前天|最近|近\d|前\d|过去|以来|至|到|对比|比较|为什么|如何|建议|明细|趋势|占比|分别|和|与|年内|季度/.test(text))return null;
 const income=/收入/.test(text),expense=/花|支出|消费/.test(text),net=/结余|还剩/.test(text);
 if(income&&expense&&!net)return null;
 return net?'net':income?'income':'expense';
}
