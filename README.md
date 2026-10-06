# 词间 · Wordspace TOEFL

个人托福背词系统：本机网页版、独立 Android App，以及电脑和手机之间的局域网加密同步。当前应用版本 **1.1.3**。

本仓库是**私有的完整个人版本备份**，含 48 个 List、4,264 个词、练习例句与用法，以及 4,108 个本地发音文件。不是新东方或 ETS 官方应用。第三方词库与录音的公开再分发授权尚未确认：不要直接改为公开仓库，或把原始数据、录音及含这些资源的 APK 当作已授权素材分发。来源与许可见 [SOURCES.md](SOURCES.md) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 功能

- 自定每日新学、复习 List 数量；默认每天新学 2 个、复习 3 个，已学完 24、已复习 10。
- 单词、音标、词性、中文、发音、例句与用法共用界面；中文和音标独立隐藏。
- 收藏星按浅色、深色、最深色、取消循环，可按 List 和等级组合筛选。
- 切词保持页面和词表上下位置；首次进入 List 与离开练习页正常导航。
- 本地保存、导入导出备份，扫码配对后用 AES-256-GCM 加密同步，不上传云端进度服务。
- Android 本地扫码、系统英语备用朗读和系统调度的后台补同步，不承诺后台实时运行。

## 网页版快速开始

准备 [Node.js](https://nodejs.org/) 22 或 24。无 npm 外部依赖，不需要 `npm install`。

```sh
git clone https://github.com/deepbule0/wordspace-toefl.git
cd wordspace-toefl
npm start
```

打开 <http://127.0.0.1:4173/>。Windows 也可双击 `启动背词系统.cmd`。进度保存于当前浏览器；下载源码不会自动恢复旧进度，换电脑或浏览器前请导出备份。

```sh
npm test
npm run audit
```

快捷键：左右方向键切词，空格隐藏／揭晓释义，P 发音，S 循环收藏等级。输入框、按钮获得焦点时保留控件自身的键盘行为。

## 电脑与手机同步

保持网页运行，另开终端：

```sh
npm run sync
```

Windows 可双击 `启动手机同步.cmd` 同时启动两项服务。在电脑网页显示配对二维码，手机 App 扫码并确认。配对码含密钥，只交给自己的设备。

网页仅监听本机 `127.0.0.1:4173`；同步服务使用局域网 TCP 4174。两端须可互访，校园网、访客 Wi-Fi 可能隔离设备；同一个 Wi-Fi 名称不代表能互访。可用自己可控的手机热点，不要关闭全局防火墙或绕过网络策略。详见 [手机安装与同步说明.md](手机安装与同步说明.md)。

## Android 构建

最低 Android 8 / API 26，compileSdk 和 targetSdk 均为 36，不依赖 Google Play 服务。需较新的系统 WebView；未宣称在所有一加、华为设备上完成实机测试。

1. 安装 JDK 17 或 21、Android SDK Platform 36、Build Tools 35.0.0、Android command-line tools，并自行阅读和接受 SDK 许可。
2. 设置 `JAVA_HOME` 与 `ANDROID_HOME`，也可用 `WORDSPACE_JAVA_HOME` 与 `WORDSPACE_ANDROID_SDK`。
3. 执行以下构建命令，或在 Android Studio 打开 `android/`。

附带 Gradle 8.13 Wrapper，下载地址和 SHA-256 固定。首次运行从 Gradle 官方来源下载工具；首次构建还从 Google Maven / Maven Central 解析依赖。

```sh
# 调试签名的 APK
npm run android:debug

# 私人签名 release APK、lint、JVM 测试与扫码运行类核验
npm run android:build
```

结果位于 `outputs/`，输出版本读取 `package.json`。工具、缓存、签名和 APK 都不提交到 Git。

**签名注意：**仓库不含原 APK 的私人签名。新环境首次 release 构建会在 `.signing/` 生成新签名；新签名不能覆盖旧签名的 App。覆盖升级须由拥有者在本机安全恢复原 `.signing/`，不能提交密钥。不要为换签名直接卸载旧版；卸载会清除手机进度，先导出备份。

构建后可运行 `npm run test:native` 验证 JS / Java 加密、合并互通与 ZXing 解码配对二维码。脚本从 Gradle 缓存查找已固定版本的依赖 JAR，需先完成安卓依赖解析。

## 目录

```text
public/                 共用网页界面、生成词库、例句和 audio/ 录音
android/                原生扫码/TTS/网络/后台同步、JVM 测试与 Gradle Wrapper
server.mjs              本机网页服务
sync-server.mjs         局域网加密同步服务
network-info.mjs        电脑网络信息
scripts/                数据维护、安卓构建、发布审计与诊断工具
tests/                  Node、跨语言与 Windows 检测测试
SOURCES.md              学习资料来源与限制
THIRD_PARTY_NOTICES.md   第三方代码许可索引
```

已生成的数据可直接使用。重新抽取须自行准备 `.sources/` 来源文件与有权使用的 Anki 卡组，原始下载不提交。`python scripts/build_data.py --deck /path/to/TOEFL.apkg` 指定自己的输入，不依赖某个用户的下载目录。

## 安全与维护

- 不提交签名、配对密钥、同步副本、个人进度备份、日志或抓包报告。
- GitHub 用于源码和静态资料备份，不用于手机进度自动同步。
- 保留第三方许可，不额外授予整个代码仓库或学习素材的开源再分发许可。
- GitHub Actions 检查 Node 测试、敏感文件规则与 Windows 检测安全逻辑，不使用私人签名或自动上传 APK。
- Windows 限时检测须提供两端当前 IP，由用户手动以管理员身份执行；测试只验证判断逻辑，不启动抓包。

完整操作见 [使用说明.md](使用说明.md)。
