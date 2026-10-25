**银行助手口语修复 r1 · 2026-10-19**

本候选新增三类语义修复：本月至今的收入减支出口语查询、付款缺金额时继承对象、有效金额草稿的肯定/否定改口。生产改动仅 banking_tasks.py、bill_facts.py、banking.js；没有修改投资主流程和确认/取消协议。

完整交接、逐文件差异、真实模型原始输出、固定用例边界、测试日志、数据保留及回滚说明：

[实施报告](/home/bld/data/data4/admin/fintechcom/.runtime/finpilot-banking-language-20261019-qv__55za/REPORT.zh-CN.md)

[补丁](/home/bld/data/data4/admin/fintechcom/.runtime/finpilot-banking-language-20261019-qv__55za/changes.patch)

预览：<http://10.120.17.24:51615/#/banking>，READY 补丁标识 banking-language-r1-20261019；版本后缀 banking-language-r1。实时进程身份以预览 READY.json 为准。

100 个不同 Python 用例最终通过、两个 Node 脚本通过；9 组固定真实模型配对、每版本 15 轮/12 次调用。查询结果为 2026-10-01 至 2026-10-19 净流入 830 元；给小林的饭钱仅追问金额，80块补成同一任务草稿；有效80元改口后为同一对象50元。上述不构成泛化、完整44步评测或真人验收结论。

合成账本/资金/操作/任务摘要刷新前后完全保留；共享模型 MainPID 1724622 未变。先前账本标题和窄屏排版修复保留。确认页取消后的任务状态一致性问题留后续；独立 Chrome 复核待完成。历史 CANDIDATE-INFO 验收未改写。
