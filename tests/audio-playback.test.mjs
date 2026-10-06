import test from 'node:test';
import assert from 'node:assert/strict';
import {playLocalOrFallback} from '../public/audio-playback.mjs';

test('a working recording plays without speech fallback',async()=>{
  let fallback=0;
  assert.equal(await playLocalOrFallback({play:async()=>{}},()=>true,()=>fallback++),'recording');
  assert.equal(fallback,0);
});
test('a rejected recording switches to speech without reporting an audio failure',async()=>{
  const events=[];
  assert.equal(await playLocalOrFallback({play:async()=>{throw new Error('codec unavailable');}},()=>true,()=>events.push('speech')),'speech');
  assert.deepEqual(events,['speech']);
});
test('a canceled or superseded recording cannot start stale speech',async()=>{
  let fallback=0;
  assert.equal(await playLocalOrFallback({play:async()=>{throw new Error('interrupted');}},()=>false,()=>fallback++),'canceled');
  assert.equal(fallback,0);
});
