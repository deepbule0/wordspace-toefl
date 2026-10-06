const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderPhonetic(word, showPhonetic, className = '') {
  return showPhonetic ? `<span class="phonetic ${className}">/${escape(word.phonetic)}/</span>` : '';
}

export function renderPhoneticToggle(showPhonetic) {
  return `<button class="phonetic-toggle" data-action="toggle-phonetic" title="${showPhonetic ? '同时隐藏卡片和词表中的音标，仍可听发音' : '重新显示卡片和词表中的音标'}"><span aria-hidden="true">/ə/</span>${showPhonetic ? '隐藏音标' : '显示音标'}</button>`;
}
