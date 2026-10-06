import {pairingSvg} from './pairing-qr.mjs';
import {renderNetworkPanel} from './network-ui.mjs';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function backgroundSummary(status){
  if(!status.connected)return '配对后生效；仅在可连接电脑的 Wi‑Fi 下执行。';
  if(!status.backgroundEnabled)return '已关闭后台定时同步；打开 App 时仍会同步。';
  if(status.backgroundScheduled===false)return '系统未能安排后台任务，请重新打开 App 后检查。';
  const recent=status.backgroundLastSync?`最近后台同步：${new Date(status.backgroundLastSync).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'})}。`:'';
  return recent+(status.backgroundStatus||'约每 15 分钟由系统安排；省电模式可能延迟，打开 App 会立即补同步。');
}
export function renderSyncModal(status,native,info=null,hasBackup=false,network={}){
  return `<div class="eyebrow">KEEP YOUR MEMORY TOGETHER</div><h2 id="modal-title">手机与电脑同步</h2><p class="modal-copy">同一局域网内自动同步，断网时继续本地保存。电脑同步服务须保持运行；学习进度、收藏颜色、计划和浏览位置会同步。</p>
    <div class="sync-status"><span class="status-dot"></span><span class="sync-state-label">${escape(status.status)}</span><button class="text-button" data-action="sync-now" ${status.connected?'':'disabled'}>立即同步</button></div>
    <section id="sync-network-panel" class="sync-network-panel" aria-label="同步网络检查">${renderNetworkPanel(native,{target:status.address,...network})}</section>
    ${native?`<button class="button primary sync-scan-button" data-action="sync-scan">扫描电脑二维码</button><p class="settings-note">扫码只在手机本地解码，首次使用需要相机权限。识别后请确认电脑与进度，再连接；以后不用重复扫码。</p><form id="sync-pair-form" novalidate><details class="manual-pairing"><summary>或手动粘贴连接码</summary><label class="sync-code-label">电脑连接码<textarea id="sync-code" name="code" rows="3" placeholder="扫描后自动填入，也可粘贴完整连接码" required autocapitalize="off" spellcheck="false"></textarea></label></details><p class="settings-note">首次连接以电脑进度为起点，并备份手机当前进度；更新同一电脑的连接码会合并手机离线进度。二维码和连接码含配对密钥，请勿公开分享。</p><button class="button primary sync-pair-button" type="submit">${status.connected?'更新连接并合并进度':'确认连接电脑'}</button></form><div class="background-sync"><label><input id="background-sync-switch" type="checkbox" ${status.backgroundEnabled!==false?'checked':''}>后台定时同步</label><p class="background-sync-detail">${escape(backgroundSummary(status))}</p></div>`:
      `<p class="settings-note">先双击项目里的“启动手机同步.cmd”。首次开启会把此浏览器的现有进度存入电脑同步服务。用手机词间 App 扫描下面的二维码，配对一次后自动同步。</p><button class="button primary sync-pair-button" data-action="sync-host">${status.connected?'显示手机配对二维码':'开启同步并显示二维码'}</button>${info?`<div class="sync-connection-codes">${info.codes.length?info.codes.map((item,index)=>`<div><strong>电脑地址：${escape(item.address)}</strong><div class="pairing-qr-wrap">${pairingSvg(item.code)}</div><p class="qr-hint">手机 App → 手机同步 → 扫描电脑二维码</p><details class="manual-pairing"><summary>备用连接码</summary><textarea readonly aria-label="手机连接码 ${index+1}" rows="3">${escape(item.code)}</textarea><button class="button subtle" data-action="sync-copy-code" data-code-index="${index}">复制连接码</button></details></div>`).join(''):'<p>没有找到可用的局域网地址，请检查电脑网络。</p>'}</div>`:''}`}
    <p id="sync-error" class="form-error" role="alert"></p>
    ${hasBackup?'<button class="text-button" data-action="sync-export-before-pair">导出首次连接前的进度备份</button>':''}
    <div class="modal-actions">${status.connected?'<button class="button subtle" data-action="sync-disconnect">停止此设备同步</button>':''}<button class="button primary" data-action="close-modal">完成</button></div>`;
}
