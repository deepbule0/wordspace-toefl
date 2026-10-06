import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {addressLabel,subnetHint,renderNetworkPanel} from '../public/network-ui.mjs';
import {renderSyncModal} from '../public/sync-ui.mjs';
import {lanInterfaces} from '../network-info.mjs';
const target='http://10.42.1.20:4174',phone={type:'wifi',ip:'10.42.0.10',prefix:16,gateway:'10.42.255.254'};

test('subnet checks use actual CIDR, never assume first three octets match',()=>{
  assert.match(subnetHint(phone,target),/同一网段.*不代表/);
  assert.match(subnetHint({...phone,prefix:24},target),/不在同一网段/);
  assert.match(subnetHint({...phone,prefix:32},'http://10.42.0.10:4174'),/同一网段/);
  assert.equal(subnetHint({...phone,prefix:null},target),'');
  assert.equal(subnetHint({...phone,ip:'256.1.2.3'},target),'');
  assert.equal(addressLabel('http://evil.example:4174'),null);
  assert.equal(addressLabel(target),'10.42.1.20:4174');
});
test('unpaired phones show Wi-Fi IP and candidate target without claiming successful pairing',()=>{
  const html=renderSyncModal({connected:false,status:'未连接'},true,null,false,{info:{interfaces:[phone]},target});
  assert.match(html,/手机 Wi‑Fi IP/);assert.match(html,/10\.42\.0\.10/);assert.match(html,/10\.42\.1\.20:4174/);
  assert.match(html,/data-action="sync-check-network"/);assert.match(html,/连接码.*不是自动发现/);
  assert.equal(html.includes('已连通电脑'),false);
  const blank=renderNetworkPanel(true,{info:{interfaces:[phone]}});
  assert.match(blank,/尚无目标/);assert.match(blank,/sync-check-network" disabled/);assert.match(blank,/10\.42\.0\.10/);
});
test('network results escape text, distinguish reachability from pairing, and retain failure details',()=>{
  const html=renderNetworkPanel(false,{info:{interfaces:[{ip:'10.42.1.20',name:'<img onerror=x>',prefix:16}],lastPeer:{ip:'10.42.0.10'},vpn:true},probe:{ok:false,message:'连接超时 <script>bad</script>'}});
  assert.equal(html.includes('<script>'),false);assert.match(html,/&lt;img/);assert.match(html,/最近连接设备/);assert.match(html,/不是实时在线/);assert.match(html,/VPN/);assert.match(html,/failure/);
  const ok=renderNetworkPanel(true,{info:{interfaces:[phone]},target,probe:{ok:true,message:'手机已连通电脑同步服务；若配对仍失败，请重新扫描。'}});
  assert.match(ok,/success/);assert.match(ok,/配对仍失败/);
  const pending=renderNetworkPanel(true,{info:{interfaces:[phone]},target,pairedTarget:'http://10.42.1.2:4174'});
  assert.match(pending,/待确认电脑/);assert.match(pending,/原配对电脑地址/);assert.match(pending,/确认连接后才更新/);
});
test('PC interface metadata is private IPv4 only, excludes secrets/MAC, and labels virtual interfaces',()=>{
  const rows=lanInterfaces({Clash:[{family:'IPv4',address:'10.0.0.1',cidr:'10.0.0.1/24',mac:'secret-mac'}],WLAN:[{family:'IPv4',address:'10.42.1.20',cidr:'10.42.1.20/16'},{family:'IPv6',address:'::1'},{family:'IPv4',address:'169.254.1.2'}],Loop:[{family:'IPv4',address:'127.0.0.1',internal:true}]});
  assert.deepEqual(rows.map(row=>row.ip),['10.42.1.20','10.0.0.1']);assert.equal(rows[0].prefix,16);assert.equal(rows[1].virtual,true);assert.equal(JSON.stringify(rows).includes('secret-mac'),false);
});
test('connection-code changes update candidate IP; separate refresh never replaces entered code',async()=>{
  const source=await readFile(new URL('../public/app.mjs',import.meta.url),'utf8');
  assert.match(source,/if\(event.target.id==='sync-code'\)setPendingAddress/);
  assert.match(source,/function receivePairCode\(code\)[\s\S]*?setPendingAddress\(code\)/);
  assert.match(source,/panel.innerHTML=markup/);
  assert.match(source,/if\(panel.wordspaceMarkup!==markup\)/); // Auto sync must not replace focused check controls.
  assert.match(source,/pendingSyncAddress\|\|syncStatus.address/);
});
