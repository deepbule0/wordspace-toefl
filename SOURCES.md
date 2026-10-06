# 公开词库来源记录

本项目供个人词汇学习使用，不是新东方官方应用。整理的是基础词汇事实，不包含源书例句、记忆法和其他教学文章。

## 分组及词序

- [公开 48 List 词表](https://www.scribd.com/document/915116798/)：用于主要分组和顺序。
- [Dr-Quan/maimemo-v3.4](https://github.com/Dr-Quan/maimemo-v3.4)：`wordbook.7z` 中托福乱序版 4,264 词集合，用于独立核对。
- [公开 Anki 托福乱序卡组](https://ankiweb.net/shared/info/657511105)：用于交叉核对，并按邻接词补齐 diversity、roost、curl 三个词。
- [另一卡组公开信息](https://file.ankichinas.cn/card/60e7ba364c4eaqnC)：只使用公开的组数和数量信息作比较，没有下载或访问付费内容。

可核实的参考词表共 4,264 词。与标称 4,268 卡的另一词库在 List 13、34、43 分别相差 2、1、1 词；可能有版本差异，不保证严格匹配用户手头印次。

## 词义、音标和音频

- 上述 Anki 公开卡组包含 4,127 条词条、4,108 个对应音频。仅抽取 headword、基础词义、音标和音频，不抽取例句、记忆法、搭配等教学内容。
- 缺失的基础词义或音标由 [KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary) 的 `full_line_jsonl/sentence/正序/托福.jsonl` 补齐。该项目声明 BSD-3-Clause 许可，许可全文保存在 [public/dictionary_LICENSE.txt](public/dictionary_LICENSE.txt)。
- 没有本地音频的 156 个词通过设备的浏览器语音合成朗读，未冒充原书或专业录音。

派生词条为公开基础语言事实的整理，不能据此推定整个源书、源卡组或音频均具有商业再分发许可。如需公开发布或商业使用，请另行确认来源权利，使用获得授权的数据与音频。

基础校对包括：去除公开文本中误识别的单字母噪声；修正 marvel、shovel、angiosperm 的拼写；补回 divorce 和 stun；统一 `a.` 为 `adj.`、`ad.` 为 `adv.` 并合并共用释义的词性。释义保持源词库的基础解释，不作全书逐词权威审校。

## 练习例句与用法

全部 4,264 个词有一条英文练习例句、中文翻译和至少一条用法，保存为 `public/learning.json`，与基础词库分开维护。

- 开放例句与短语来源：[KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary)，使用同一 BSD-3-Clause 项目的 `full_line_jsonl/sentence/正序/托福.jsonl`、`SAT.jsonl`、`六级.jsonl` 三个文件。保留许可声明，未复制新东方原书或 Anki 卡组的例句。
- 3,484 条开放词库句子标记为“词库参考”；625 条从词库短语扩写的句子标记为“短语扩写”；155 条独立学习编写句子标记为“学习编写”。优先筛选学术或校园语境；词库也包含日常英语，不能声称全部是托福真实题目或官方高频例句。
- 用法分别标为“词库搭配”“学习用法”“例句用法”。没有词库搭配时，提取该句的实际语境片段，明确提示结合整句译文理解，不冒充频率排名或权威搭配词典。
- 少见词或变体提示有针对性校对，例如 [Merriam-Webster: chronical / chronic](https://www.merriam-webster.com/dictionary/chronical)、[patriarchic](https://www.merriam-webster.com/dictionary/patriarchic)、[focalize](https://www.merriam-webster.com/dictionary/focalize)。词义事实核对不等于复制词典例句。
- 例句朗读为浏览器语音合成，不是录制音频；是否可用取决于设备英语语音。关闭中文后，句子译文和用法中文同时隐藏。

构建脚本为 `scripts/build_learning.mjs`，原创例句补充在 `scripts/learning_overrides.tsv`，针对性用法说明在 `scripts/usage_overrides.mjs`。自动校验覆盖、目标词及其变形、双语字段与重复词条；另有抽样语言校对，尚未进行全部例句的逐句专业审校。
