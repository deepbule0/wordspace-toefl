// A study redraw must not move the page or reset the independently scrolled
// word list. Keeping the previous content height also prevents the browser from
// clamping scrollY when the next definition/example happens to be shorter.
export function preserveStudyViewport(surface, paint) {
  const document = surface.document;
  const main = document.querySelector('#main');
  const rows = document.querySelector('#word-rows');
  if (!main || !rows) return paint(); // Opening a study page is ordinary navigation.

  const element = document.activeElement;
  const focus = element && main.contains(element) ? {
    id: element.id,
    data: { ...element.dataset },
    selection: typeof element.selectionStart === 'number'
      ? [element.selectionStart, element.selectionEnd, element.selectionDirection] : null,
  } : null;
  const before = {
    x: surface.scrollX, y: surface.scrollY,
    rowsX: rows.scrollLeft, rowsY: rows.scrollTop,
    height: main.getBoundingClientRect().height,
    // On phones the word panel sits below these blocks. Reserve their previous
    // heights as well, so shorter text does not pull the clicked list upward.
    blocks: ['.flashcard', '.learning-card', '.study-focus'].flatMap(selector => {
      const block = document.querySelector(selector);
      return block ? [{ selector, height: block.getBoundingClientRect().height }] : [];
    }),
  };

  try { return paint(); }
  finally {
    const nextMain = document.querySelector('#main');
    const nextRows = document.querySelector('#word-rows');
    // Do not carry study-page spacing/scroll into another view.
    if (nextMain && nextRows) {
      for (const { selector, height } of before.blocks) {
        const block = document.querySelector(selector);
        if (block) block.style.minHeight = `${Math.ceil(height)}px`;
      }
      nextMain.style.minHeight = `${Math.ceil(before.height)}px`;
      nextRows.scrollLeft = before.rowsX;
      nextRows.scrollTop = before.rowsY;
      if (focus) {
        const target = focus.id ? document.getElementById(focus.id)
          : focus.data.action ? [...nextMain.querySelectorAll('[data-action]')].find(node =>
            Object.entries(focus.data).every(([key, value]) => node.dataset[key] === value)) : null;
        if (target && nextMain.contains(target)) {
          // Native button focus must not scroll its ancestors after a redraw.
          target.focus({ preventScroll: true });
          if (focus.selection && typeof target.setSelectionRange === 'function') {
            target.setSelectionRange(...focus.selection);
          }
        }
      }
      surface.scrollTo({ left: before.x, top: before.y, behavior: 'instant' });
    }
  }
}
