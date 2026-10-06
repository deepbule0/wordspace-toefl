import path from 'node:path';
import { access, readdir } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const exists = async file => { try { await access(file); return true; } catch { return false; } };
export const toolExecutable = (java, name, platform = process.platform) => path.join(java, 'bin', name + (platform === 'win32' ? '.exe' : ''));
export function configuredPaths(root, env = process.env) {
  return {
    java: env.WORDSPACE_JAVA_HOME || env.JAVA_HOME,
    sdk: env.WORDSPACE_ANDROID_SDK || env.ANDROID_HOME || env.ANDROID_SDK_ROOT || path.join(root, '.build-tools/android-sdk'),
    gradleHome: env.WORDSPACE_GRADLE_HOME || path.join(root, '.build-tools/gradle-8.13'),
    cache: env.GRADLE_USER_HOME || path.join(root, '.build-tools/gradle-cache'),
  };
}
export async function resolveAndroidTools(root) {
  const tools = configuredPaths(root);
  if (!tools.java) {
    try {
      const { stderr } = await execute('java', ['-XshowSettings:properties', '-version'], { windowsHide: true });
      tools.java = stderr.match(/^\s*java\.home\s*=\s*(.+)$/m)?.[1].trim();
    } catch {}
  }
  if (!tools.java || !await exists(toolExecutable(tools.java, 'java')) || !await exists(toolExecutable(tools.java, 'javac'))) {
    throw new Error('找不到 JDK。请安装 JDK 17 或 21，并设置 JAVA_HOME / WORDSPACE_JAVA_HOME。');
  }
  if (!await exists(path.join(tools.sdk, 'platforms/android-36/android.jar'))) {
    throw new Error('找不到 Android SDK Platform 36。请安装官方 SDK 并设置 ANDROID_HOME / WORDSPACE_ANDROID_SDK。');
  }
  return tools;
}
export function run(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: 'inherit', windowsHide: true, ...options });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`构建步骤退出：${code}`)));
  });
}
export async function runGradle(root, tools, tasks, env = process.env) {
  const launcher = path.join(tools.gradleHome, 'lib/gradle-gradle-cli-main-8.13.jar');
  const options = { cwd: path.join(root, 'android'), env: { ...env, JAVA_HOME: tools.java, ANDROID_HOME: tools.sdk, GRADLE_USER_HOME: tools.cache } };
  if (await exists(launcher)) {
    return run(toolExecutable(tools.java, 'java'), ['-classpath', launcher, 'org.gradle.launcher.GradleMain', '--no-daemon', ...tasks], options);
  }
  if (process.platform === 'win32') return run('cmd.exe', ['/d', '/c', 'gradlew.bat', '--no-daemon', ...tasks], options);
  return run('sh', [path.join(root, 'android/gradlew'), '--no-daemon', ...tasks], options);
}
export async function findCachedJar(cache, filename) {
  const walk = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isFile() && entry.name === filename) return file;
      if (entry.isDirectory()) { const found = await walk(file); if (found) return found; }
    }
  };
  let found;
  try { found = await walk(path.join(cache, 'caches/modules-2/files-2.1')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!found) throw new Error(`未找到 ${filename}；请先构建安卓项目以解析依赖。`);
  return found;
}
