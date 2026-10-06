import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPhonetic, renderPhoneticToggle } from '../public/pronunciation-ui.mjs';

test('hidden phonetic does not render an IPA or leave an empty pronunciation placeholder', () => {
  const word = {phonetic:'ˈpæŋkriəs'};
  assert.equal(renderPhonetic(word, false), '');
  assert.ok(renderPhonetic(word, true, 'row-phonetic').includes('/ˈpæŋkriəs/'));
  assert.ok(renderPhonetic(word, true, 'row-phonetic').includes('row-phonetic'));
});
test('button offers the opposite action to the current phonetic state', () => {
  assert.ok(renderPhoneticToggle(true).includes('隐藏音标'));
  assert.ok(renderPhoneticToggle(false).includes('显示音标'));
  assert.ok(renderPhoneticToggle(false).includes('data-action="toggle-phonetic"'));
});
