import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {leafPaths} from '../public/brand-mark.mjs';
const source=name=>readFile(new URL('../'+name,import.meta.url),'utf8');

test('website upper-left leaf, favicon and Android icons share geometry and colors',async()=>{
  const svg=await source('public/wordspace-icon.svg');
  const foreground=await source('android/app/src/main/res/drawable/ic_launcher_foreground.xml');
  const fallback=await source('android/app/src/main/res/mipmap-anydpi/ic_launcher.xml');
  for(const mark of leafPaths){
    assert.ok(svg.includes('d="'+mark+'"'));
    assert.ok(foreground.includes('android:pathData="'+mark+'"'));
    assert.ok(fallback.includes('android:pathData="'+mark+'"'));
  }
  assert.match(await source('public/app.mjs'),/leaf: leafMarkup/);
  assert.match(svg,/stroke="#e1efa9"/);assert.match(foreground,/android:strokeColor="#e1efa9"/);
  assert.match(foreground,/android:strokeWidth="1.65"/);assert.match(foreground,/android:strokeLineCap="round"/);
  assert.match(svg,/fill="#254c3b"/);
  assert.match(await source('public/index.html'),/rel="icon"[^>]+href="wordspace-icon\.svg"/);
});
test('Android launcher uses adaptive color and themed leaf layers',async()=>{
  const base=await source('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
  const themed=await source('android/app/src/main/res/mipmap-anydpi-v33/ic_launcher.xml');
  assert.match(base,/<foreground android:drawable="@drawable\/ic_launcher_foreground"/);
  assert.match(themed,/<monochrome android:drawable="@drawable\/ic_launcher_foreground"/);
  assert.match(await source('android/app/src/main/AndroidManifest.xml'),/android:icon="@mipmap\/ic_launcher"/);
});
