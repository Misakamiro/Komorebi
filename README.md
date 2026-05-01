# Komorebi

Komorebi 是一个面向 Windows 桌面的媒体转换工具，理念是简单、高效、自动化。

它基于 [FFBox](https://github.com/ttqftech/FFBox) 5.x 改造，底层调用 FFmpeg / FFprobe 处理音视频，并加入了更适合日常使用的 Komorebi 引导界面：你不需要先理解一长串 FFmpeg 参数，只要选择场景、格式和质量，软件会自动生成更稳妥的转换方案。

## 适合做什么

- 把视频压小，方便收藏、发送、上传或长期保存。
- 把常见音频转换成 MP3、FLAC、AAC、OPUS 等格式。
- 只更换视频封装，比如从 MKV 转成 MP4，尽量不重新编码。
- 批量处理 NCM 音乐文件。
- 批量转换大量媒体文件，并查看进度、日志、速度和输出大小。

## 主要功能

### 视频压缩

Komorebi 提供面向普通用户的压缩入口，不需要手写编码参数。

- 支持动画 / 二次元、录屏 / 游戏、真人 / 电影三类场景预设。
- 支持 H.264、H.265 / HEVC、AV1、VP9、MPEG-4 等视频编码。
- 支持 MP4、MKV、WebM、MOV、M4V、FLV、TS、AVI 等封装格式。
- 会根据封装格式自动修正不兼容的编码组合，减少失败概率。
- 支持保留源音轨、静音视频、添加外部音轨。
- 支持自定义输出目录和输出文件名模板。
- 转换前显示预计输出大小和压缩率。
- 转换完成后读取真实输出文件大小，显示实际压缩率或实际增大比例。

### 音频转换

适合把音乐、录音、视频中的音轨转换成常用音频格式。

- 支持 MP3、FLAC、WAV、AAC、M4A、OGG、WMA、OPUS、AC3、MP2。
- 提供无损 / 高质量、标准、小体积、极小体积等质量档位。
- 支持批量转换和统一输出命名。

### 转封装

当你只是想把容器换成另一个格式时，Komorebi 会优先使用流复制。

- 默认尽量不重新编码，速度更快，画质不二次损失。
- 保留字幕和元数据。
- 支持添加外部音轨。
- 当目标容器不兼容源编码时，会自动切换到高保真转码兜底。

### NCM 转换

Komorebi 内置 ncmdump 调用能力，方便批量处理 NCM 文件。

- 支持选择单个 `.ncm` 文件。
- 支持选择文件夹并递归扫描。
- 支持按源音乐自动输出格式。
- 可选择转换成功后删除源文件。

## 批量任务和进度

Komorebi 保留了 FFBox 强大的任务系统，并做了更直观的界面整合。

- 支持拖入文件、文件夹或文本路径创建任务。
- 支持单任务和多输入任务。
- 支持队列开始、暂停、停止、重置和删除。
- 支持任务列表多选操作。
- 显示转码进度、速度、码率、输出大小、剩余时间和日志。
- 进度图表对异常数据做了保护，避免压缩后变大或数据缺失时界面卡住。

## 界面体验

- 内置简体中文、English、日本語三种界面语言。
- 安装包安装时可选择语言。
- 设置页可以随时切换语言。
- 参数切换、预设选择、面板切换都有过渡动画。
- 使用 Komorebi 动漫角色图标和引导图片，让引导、拖拽、退出确认等界面风格统一。
- 设置中提供“关于”页面，介绍 Komorebi 的理念和引用项目。

## 下载

请到 GitHub Releases 下载最新版本：

[https://github.com/Misakamiro/Komorebi/releases/latest](https://github.com/Misakamiro/Komorebi/releases/latest)

推荐普通用户下载：

- `Komorebi_*.exe`：安装版
- `Komorebi_*_portable.zip`：免安装版

## 引用项目

Komorebi 基于这些优秀项目构建：

- FFBox: [https://github.com/ttqftech/FFBox](https://github.com/ttqftech/FFBox)
- FFmpeg: [https://ffmpeg.org/](https://ffmpeg.org/)
- ncmdump: [https://github.com/taurusxin/ncmdump](https://github.com/taurusxin/ncmdump)

相关许可和来源声明请阅读：

- `LICENSE`
- `NOTICE-Komorebi.md`
- `licenses/FFBox-LICENSE.txt`
- `tools/LICENSE-ffmpeg.txt`
- `tools/LICENSE-ncmdump.txt`

## 开发说明

本项目主要面向 Windows 桌面端，使用 Electron、Vue 3、Pinia、TypeScript、Vite 和 Koa 构建。

常用命令：

```powershell
pnpm install
pnpm run dev:frontend
pnpm run typecheck
pnpm run build:everything
```

仓库不会提交这些本地构建产物或大型二进制文件：

- `node_modules/`
- `app/`
- `release/`
- `tools/*.exe`

如果需要本地构建，请自行准备 `tools/ffmpeg.exe`、`tools/ffprobe.exe` 和 `tools/ncmdump.exe`。
