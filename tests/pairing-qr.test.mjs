import test from 'node:test';
import assert from 'node:assert/strict';
import {pairingMatrix,pairingSvg,pairingPayload} from '../public/pairing-qr.mjs';
import {parseConnectionCode} from '../public/sync-crypto.mjs';
import {renderSyncModal,backgroundSummary} from '../public/sync-ui.mjs';
const code=Buffer.from(JSON.stringify({version:1,address:'http://192.168.1.2:4174',key:Buffer.alloc(32).toString('base64'),hub:'test-hub-aaaaaaaa'})).toString('base64');
test('pairing QR contains a valid app deep link, with an SVG quiet zone and no remote image API',()=>{
  assert.equal(parseConnectionCode(pairingPayload(code)).hub,'test-hub-aaaaaaaa');
  const matrix=pairingMatrix(code);assert.ok(matrix.length>=21&&matrix.length<=177);assert.equal(matrix.length%4,1);assert.equal(matrix[0][0],true);
  const svg=pairingSvg(code);assert.ok(svg.includes(`viewBox="0 0 ${matrix.length+8} ${matrix.length+8}"`));assert.equal(svg.includes(code),false);assert.equal(/<script|<image|https?:/.test(svg.replace('http://www.w3.org/2000/svg','')),false);
});
test('desktop exposes QR and hidden fallback code; native exposes scan and background controls',()=>{
  const status={connected:true,status:'已同步',backgroundEnabled:true};
  const desktop=renderSyncModal(status,false,{codes:[{address:'http://192.168.1.2:4174',code}]});assert.ok(desktop.includes('手机配对二维码'));assert.ok(desktop.includes('<details'));assert.equal(desktop.includes('sync-scan-button'),false);
  const phone=renderSyncModal(status,true);assert.ok(phone.includes('data-action="sync-scan"'));assert.ok(phone.includes('id="background-sync-switch"'));assert.ok(phone.includes('确认'));assert.ok(phone.includes('id="sync-pair-form" novalidate'));assert.equal(phone.includes('常驻通知'),false);
  assert.match(backgroundSummary(status),/15 分钟/);assert.match(backgroundSummary({...status,backgroundEnabled:false}),/已关闭/);assert.match(backgroundSummary({...status,backgroundScheduled:false}),/未能安排/);
});
test('an invalid or external QR cannot become a pairing request',()=>{
  assert.throws(()=>pairingPayload('https://evil.example/pair'));
  assert.throws(()=>pairingSvg(Buffer.from(JSON.stringify({version:1,address:'http://8.8.8.8:4174',key:Buffer.alloc(32).toString('base64'),hub:'test-hub-aaaaaaaa'})).toString('base64')));
});
