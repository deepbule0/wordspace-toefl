import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { configuredPaths, toolExecutable } from '../scripts/android-tools.mjs';

test('Android build paths do not depend on a specific workstation or user', () => {
  const tools = configuredPaths('/workspace/wordspace', {});
  assert.equal(tools.java, undefined);
  assert.equal(tools.sdk, path.join('/workspace/wordspace', '.build-tools/android-sdk'));
  assert.equal(tools.cache, path.join('/workspace/wordspace', '.build-tools/gradle-cache'));
});
test('project-specific JDK and SDK override system configuration', () => {
  const tools = configuredPaths('/repo', { WORDSPACE_JAVA_HOME: '/project/jdk', JAVA_HOME: '/system/jdk', WORDSPACE_ANDROID_SDK: '/project/sdk', ANDROID_HOME: '/system/sdk', WORDSPACE_GRADLE_HOME: '/gradle', GRADLE_USER_HOME: '/cache' });
  assert.deepEqual(tools, { java: '/project/jdk', sdk: '/project/sdk', gradleHome: '/gradle', cache: '/cache' });
});
test('standard Java and Android environment variables are supported', () => {
  assert.equal(configuredPaths('/repo', { JAVA_HOME: '/jdk', ANDROID_HOME: '/sdk' }).java, '/jdk');
  assert.equal(configuredPaths('/repo', { ANDROID_SDK_ROOT: '/sdk' }).sdk, '/sdk');
});
test('JDK executable suffix depends on the build platform', () => {
  assert.equal(toolExecutable('/jdk', 'javac', 'win32'), path.join('/jdk', 'bin', 'javac.exe'));
  assert.equal(toolExecutable('/jdk', 'java', 'linux'), path.join('/jdk', 'bin', 'java'));
});
