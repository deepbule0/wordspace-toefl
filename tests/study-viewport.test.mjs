import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {preserveStudyViewport} from '../public/study-viewport.mjs';

const control=(data={},id='')=>({id,dataset:data,
  focus(options){this.focusOptions=options;},
  setSelectionRange(...range){this.selection=range;},
});
function fixture({height=1700,rowsY=480,focus=null}={}) {
  const calls=[];
  let current={height,rows:{scrollTop:rowsY,scrollLeft:7},controls:[]};
  const document={
    activeElement:focus,
    querySelector(selector){return selector==='#main'?current.main:selector==='#word-rows'?current.rows:null;},
    getElementById(id){return current.controls.find(node=>node.id===id)||null;},
  };
  function replace({height=1200,rows=true,controls=[]}={}) {
    current={height,rows:rows?{scrollTop:0,scrollLeft:0}:null,controls};
    current.main={style:{},getBoundingClientRect:()=>({height:current.height}),
      contains:node=>Boolean(node)&&(node===focus||current.controls.includes(node)),
      querySelectorAll:()=>current.controls};
  }
  replace({height,controls:focus?[focus]:[]});
  if(current.rows){current.rows.scrollTop=rowsY;current.rows.scrollLeft=7;}
  const surface={document,scrollX:12,scrollY:860,
    scrollTo(options){calls.push(options);this.scrollX=options.left;this.scrollY=options.top;}};
  return {surface,replace,calls,get current(){return current;}};
}

test('word redraw restores the page and independent word-list scroll without an animation',()=>{
  const page=fixture();
  const result=preserveStudyViewport(page.surface,()=>{page.replace();page.surface.scrollY=0;return 42;});
  assert.equal(result,42);
  assert.equal(page.surface.scrollY,860);assert.equal(page.surface.scrollX,12);
  assert.equal(page.current.rows.scrollTop,480);assert.equal(page.current.rows.scrollLeft,7);
  assert.deepEqual(page.calls,[{left:12,top:860,behavior:'instant'}]);
});
test('shorter examples keep sufficient page height before the old scroll position is restored',()=>{
  const page=fixture({height:1900.25});
  preserveStudyViewport(page.surface,()=>page.replace({height:1500}));
  assert.equal(page.current.main.style.minHeight,'1901px');
});
test('longer content stays naturally sized rather than acquiring a fixed height or clipping',()=>{
  const page=fixture({height:1600});
  preserveStudyViewport(page.surface,()=>page.replace({height:2100}));
  assert.equal(page.current.main.style.minHeight,'1600px');
  assert.equal(page.current.main.style.height,undefined);
});
test('shorter card/context blocks cannot pull the phone word panel upwards',()=>{
  const page=fixture(),query=page.surface.document.querySelector;
  const makeBlock=height=>({style:{},getBoundingClientRect:()=>({height})});
  let blocks={'.flashcard':makeBlock(420),'.learning-card':makeBlock(490),'.study-focus':makeBlock(1200)};
  page.surface.document.querySelector=selector=>blocks[selector]||query(selector);
  preserveStudyViewport(page.surface,()=>{
    page.replace();
    blocks={'.flashcard':makeBlock(380),'.learning-card':makeBlock(390),'.study-focus':makeBlock(1060)};
  });
  assert.equal(blocks['.flashcard'].style.minHeight,'420px');
  assert.equal(blocks['.learning-card'].style.minHeight,'490px');
  assert.equal(blocks['.study-focus'].style.minHeight,'1200px');
  assert.equal(blocks['.learning-card'].style.height,undefined);
});
test('the next button keeps keyboard focus without asking the browser to scroll to it',()=>{
  const before=control({action:'next'}),after=control({action:'next'}),page=fixture({focus:before});
  preserveStudyViewport(page.surface,()=>page.replace({controls:[after]}));
  assert.deepEqual(after.focusOptions,{preventScroll:true});
  assert.equal(page.surface.scrollY,860);
});
test('word-row focus is matched by action and word index, not a different first word button',()=>{
  const before=control({action:'word',index:'30'}),other=control({action:'word',index:'0'}),after=control({action:'word',index:'30'});
  const page=fixture({focus:before});
  preserveStudyViewport(page.surface,()=>page.replace({controls:[other,after]}));
  assert.equal(other.focusOptions,undefined);assert.deepEqual(after.focusOptions,{preventScroll:true});
});
test('search focus and selection survive same-study-page rerenders',()=>{
  const before=control({},'word-search');Object.assign(before,{selectionStart:1,selectionEnd:4,selectionDirection:'backward'});
  const after=control({},'word-search'),page=fixture({focus:before});
  preserveStudyViewport(page.surface,()=>page.replace({controls:[after]}));
  assert.deepEqual(after.selection,[1,4,'backward']);assert.deepEqual(after.focusOptions,{preventScroll:true});
});
test('opening a List for the first time does not restore old scrolling or reserve study height',()=>{
  const page=fixture();page.replace({rows:false});
  preserveStudyViewport(page.surface,()=>page.replace());
  assert.equal(page.current.main.style.minHeight,undefined);assert.deepEqual(page.calls,[]);
});
test('leaving study does not transfer old List height and scroll to the destination page',()=>{
  const page=fixture();
  preserveStudyViewport(page.surface,()=>page.replace({rows:false}));
  assert.equal(page.current.main.style.minHeight,undefined);assert.deepEqual(page.calls,[]);
});
test('a focused sync dialog outside the study content does not lose focus to a word control',()=>{
  const external=control({action:'sync-now'}),page=fixture();page.surface.document.activeElement=external;
  const next=control({action:'next'});
  preserveStudyViewport(page.surface,()=>page.replace({controls:[next]}));
  assert.equal(next.focusOptions,undefined);
});
test('a render error is propagated without silently discarding the original scroll position',()=>{
  const page=fixture();
  assert.throws(()=>preserveStudyViewport(page.surface,()=>{page.surface.scrollY=0;throw new Error('render failed');}),/render failed/);
  assert.equal(page.surface.scrollY,860);
});
test('all study redraw paths share preservation and never call selected.scrollIntoView',async()=>{
  const source=await readFile(new URL('../public/app.mjs',import.meta.url),'utf8');
  assert.match(source,/view === 'study' \? preserveStudyViewport\(window, paint\)/);
  assert.match(source,/function renderStudy\(\)\s*\{\s*return preserveStudyViewport\(window, paintStudy\)/);
  assert.equal(source.includes('scrollIntoView'),false);
  assert.match(source,/if \(action === 'word'\) changeWord/);
  assert.match(source,/if \(action === 'next'\) changeWord/);
  assert.match(source,/window\.addEventListener\('resize'.*\.flashcard, \.learning-card, \.study-focus.*removeProperty\('min-height'\)/);
  const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
  assert.match(css,/body\.study-view,body\.study-view \.word-rows\{overflow-anchor:none\}/);
});
