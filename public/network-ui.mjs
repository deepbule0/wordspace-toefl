import {privateAddress} from './sync-crypto.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function addressLabel(address){
  if(!privateAddress(address))return null;
  const url=new URL(address);return `${url.hostname}:${url.port}`;
}
const ipv4=address=>/^\d{1,3}(\.\d{1,3}){3}$/.test(address||'')&&address.split('.').every(n=>Number(n)<=255);
const number=address=>address.split('.').reduce((value,n)=>(value*256+Number(n))>>>0,0);
export function subnetHint(phone,target){
  if(!ipv4(phone?.ip)||!Number.isInteger(phone?.prefix)||phone.prefix<1||phone.prefix>32||!addressLabel(target))return '';
  const host=new URL(target).hostname,mask=(0xffffffff<<(32-phone.prefix))>>>0;
  return (number(host)&mask)===(number(phone.ip)&mask)
    ?`按手机 /${phone.prefix} 掩码，两者在同一网段；仍不代表校园网允许互访。`
    :'按手机当前掩码，两者不在同一网段；是否可连接取决于网络路由和访问限制。';
}
export function renderNetworkPanel(native,{info=null,target=null,pairedTarget=null,probe=null,loading=false}={}){
  const rows=Array.isArray(info?.interfaces)?info.interfaces:[];
  const wifi=rows.filter(item=>item.type==='wifi'&&ipv4(item.ip));
  const label=addressLabel(target);
  const previous=addressLabel(pairedTarget),candidate=Boolean(native&&previous&&label&&previous!==label);
  const own=native
    ?(wifi.length?wifi.map(item=>`<div><dt>手机 Wi‑Fi IP</dt><dd>${escape(item.ip)}${Number.isInteger(item.prefix)?` /${item.prefix}`:''}${item.gateway?`<small>网关 ${escape(item.gateway)}</small>`:''}</dd></div>`).join(''):`<div><dt>手机 Wi‑Fi IP</dt><dd>${escape(info?.error||'暂未读到；请连接 Wi‑Fi，或在系统 Wi‑Fi 详情中查看。')}</dd></div>`)
    :(rows.length?rows.map(item=>`<div><dt>电脑 ${escape(item.name||'局域网')}${item.virtual?'（虚拟网卡）':''}</dt><dd>${escape(item.ip)}${Number.isInteger(item.prefix)?` /${item.prefix}`:''}</dd></div>`).join(''):`<div><dt>电脑局域网 IP</dt><dd>${escape(info?.error||'正在读取；电脑同步服务须保持运行。')}</dd></div>`);
  const hint=native?subnetHint(wifi[0],target):'';
  return `<div class="network-heading"><strong>连接信息</strong><button class="text-button" data-action="sync-check-network" ${loading||(native&&!label)?'disabled':''}>${loading?'检查中…':'检查连接'}</button></div>
    <dl class="network-addresses">${own}<div><dt>${native?(candidate?'待确认电脑 IP / 端口':'电脑目标 IP / 端口'):'电脑同步端口'}</dt><dd>${native?escape(label||'尚无目标，请先扫描电脑二维码。'):'4174'}</dd></div>${candidate?`<div><dt>原配对电脑地址</dt><dd>${escape(previous)}<small>点击确认连接后才更新；检查的是上面的待确认地址。</small></dd></div>`:''}${!native&&info?.lastPeer?`<div><dt>最近连接设备 IP</dt><dd>${escape(info.lastPeer.ip)}<small>仅显示成功验证过的设备；不是实时在线状态。</small></dd></div>`:''}</dl>
    ${native?'<p class="network-note">电脑目标来自连接码，不是自动发现的当前 IP；请与电脑页面核对，电脑 IP 改变后需重新扫码。</p>':'<p class="network-note">手机首次连接前，电脑无法获知它的 IP；请在手机同步页查看。</p>'}
    ${hint?`<p class="network-note">${escape(hint)}</p>`:''}${info?.vpn?'<p class="network-note">检测到 VPN 网络：同步使用系统当前路由，VPN 的局域网设置可能影响连接。</p>':''}
    ${probe?`<p class="network-result ${probe.ok?'success':'failure'}" role="status">${escape(probe.message)}${probe.checkedAt?`<small>检查于 ${escape(new Date(probe.checkedAt).toLocaleTimeString('zh-CN'))}</small>`:''}</p>`:''}
    <p class="network-note">同一个 Wi‑Fi 不一定能互访。校园网的设备隔离、电脑入站规则或 VPN 都可能影响连接；检查只测试服务连通性，不改学习进度。</p>`;
}
