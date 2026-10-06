import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const { stdout } = await promisify(execFile)('git', ['ls-files', '-z'], { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
const files = stdout.split('\0').filter(Boolean);
if (!files.length) throw new Error('没有已跟踪的源码文件；请先暂存待发布文件再审计。');
const forbidden = /(?:^|\/)(?:\.signing|\.wordspace-sync|\.sources|\.build-tools|\.gradle|node_modules|outputs|build)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|(?:^|\/)local\.properties$|\.(?:keystore|jks|pem|p12|pfx|apk|aab|etl|pcap|pcapng|log)$/i;
const suspicious = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/;
for (const name of files) {
  if (forbidden.test(name) || /(?:progress-backup|进度备份)/i.test(name)) throw new Error('不允许提交私人状态或构建输出：' + name);
  const file = path.join(root, name), info = await stat(file);
  if (info.size >= 95 * 1024 * 1024) throw new Error('文件过大：' + name);
  if (/\.(?:mp3|ogg|wav|jar)$/i.test(name)) continue;
  if (suspicious.test(await readFile(file, 'utf8'))) throw new Error('疑似凭据；停止发布：' + name);
}
const audio = files.filter(name => /^public\/audio\/\d{4}\.mp3$/.test(name));
if (audio.length !== 4108) throw new Error(`完整个人版应有 4108 个录音，实际为 ${audio.length}。`);
for (const required of ['README.md', 'SOURCES.md', 'THIRD_PARTY_NOTICES.md', 'public/vocabulary.json', 'public/learning.json', 'android/gradlew', 'android/gradlew.bat', 'android/gradle/wrapper/gradle-wrapper.jar']) {
  if (!files.includes(required)) throw new Error('缺少源码发布文件：' + required);
}
console.log(`PASS: ${files.length} 个已跟踪文件；4108 个录音；未跟踪私人状态、签名、原始下载、APK、日志或检测输出。`);
console.log('这是定向规则检查，不代替完整安全审计；第三方素材的公开发布按发布者授权确认进行，保留原许可声明。');
