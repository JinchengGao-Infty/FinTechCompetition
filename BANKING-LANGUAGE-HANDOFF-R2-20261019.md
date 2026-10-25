**银行助手口语修复 r2 · 2026-10-19**

本轮接续独立Chrome反馈，修复NFKC标准化英文逗号导致的改额漏识别，补净额卡片兼容逻辑，并给页面入口/银行模块增加明确资源版本。此前r1纯函数重放未覆盖内容标准化，不能当成真实路由验收；其交接作为历史保留。

重新打开：[51615 r2预览](http://10.120.17.24:51615/?preview=banking-language-r2-20261019#/banking)。READY补丁标识 banking-language-r2-20261019；实时进程以READY为准。

[完整交接与回滚说明](/home/bld/data/data4/admin/fintechcom/.runtime/finpilot-banking-language-r2-20261019-73bmmwmb/REPORT.zh-CN.md)

[相对r1差异](/home/bld/data/data4/admin/fintechcom/.runtime/finpilot-banking-language-r2-20261019-73bmmwmb/changes-r1-to-r2.patch)

107项Python回归、两个前端脚本通过；9组完整路由真实模型配对（每版15轮/11调用），真实路由JSON交给生产卡片渲染通过。饭钱→80块→修改需求→是50不是80得到同一任务小林50元；四种净额问法主卡片830元，期间10月1日至19日。真实Chrome r2验收仍待完成。

刷新前后10笔账单、50000元模拟资金、3条已取消操作与12个任务摘要完全保留；共享模型MainPID1724622未变，实际金融执行0。投资主流程和取消状态协议未改，确认取消后的任务状态一致性问题留后续。既有标题/窄屏改动和历史验收记录保留。
