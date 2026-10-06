const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function highlightTarget(text, target) {
  if (!target) return escape(text);
  const literal = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^A-Za-zÀ-ž])(${literal})(?=$|[^A-Za-zÀ-ž])`, 'gi');
  let output = '', cursor = 0;
  for (const match of text.matchAll(pattern)) {
    output += escape(text.slice(cursor, match.index)) + escape(match[1]) + `<mark>${escape(match[2])}</mark>`;
    cursor = match.index + match[0].length;
  }
  return output + escape(text.slice(cursor));
}

export function attachLearning(vocabulary, learning) {
  if (learning.version !== 1 || learning.total !== vocabulary.total || learning.words?.length !== vocabulary.total) throw new Error('例句与用法词库不完整');
  const rows = new Map(learning.words.map(row => [row.id, row]));
  if (rows.size !== vocabulary.total) throw new Error('例句与用法存在重复词条');
  for (const word of vocabulary.words) {
    const row = rows.get(word.id);
    if (!row?.example?.en || !row.example.zh || !row.example.target || !row.usage?.length || row.usage.some(u => !u.en || !u.zh)) throw new Error(`缺少 ${word.word} 的例句或用法`);
    word.example = row.example;
    word.usage = row.usage;
  }
  vocabulary.learningCounts = learning.counts;
  return vocabulary;
}

export function renderLearning(word, showChinese) {
  const example = word.example;
  const sourceLabel = {dictionary:'词库参考', adapted:'短语扩写', original:'学习编写'}[example.kind] || '学习参考';
  const usageLabel = {dictionary:'词库搭配', curated:'学习用法', 'example-phrase':'例句用法'};
  return `<section class="learning-card" aria-label="${escape(word.word)} 的例句与用法">
    <div class="learning-heading"><div><span class="eyebrow">WORDS IN CONTEXT</span><h3>例句与用法</h3></div><span class="learning-badge">${sourceLabel}</span></div>
    <div class="example-label"><span>练习例句</span><button class="text-button example-audio" data-action="example-audio" data-id="${word.id}" aria-label="朗读 ${escape(word.word)} 的例句" title="使用浏览器英语语音朗读，不是录制音频">▶ 朗读例句</button></div>
    <p class="example-english" lang="en">${highlightTarget(example.en, example.target)}</p>
    ${showChinese ? `<p class="example-chinese">${escape(example.zh)}</p>` : `<button class="learning-reveal text-button" data-action="reveal" data-id="${word.id}">揭晓本词中文与例句翻译</button>`}
    <div class="usage-section"><h4>用法与搭配</h4><ul>${word.usage.map(usage => `<li><div class="usage-english"><span lang="en">${escape(usage.en)}</span><small>${usageLabel[usage.type] || '学习参考'}</small></div>${showChinese ? `<p class="usage-chinese">${escape(usage.zh)}</p>` : ''}</li>`).join('')}</ul></div>
    <p class="learning-note">备考学习参考 · 非托福真题${example.kind === 'adapted' ? ' · 由词库短语扩写' : ''}</p>
  </section>`;
}

export function learningSourceNotes(counts) {
  return `<h3>例句与用法</h3><p>每个词附一条英文练习例句、中文翻译和用法。${counts.dictionary.toLocaleString()} 条来自开放词库，${counts.adapted.toLocaleString()} 条由词库短语扩写，${counts.original.toLocaleString()} 条为学习编写。词库搭配、学习用法和例句片段分别标注；不是官方高频排名，也不是托福真题。例句朗读使用浏览器语音，译文与用法中文随中文开关隐藏。</p><a href="https://github.com/KyleBing/english-vocabulary" target="_blank" rel="noopener">开放例句词库（BSD-3-Clause）</a>`;
}
