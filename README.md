# Komorebi

<p align="center">
  <a href="#zh-cn">简体中文</a> |
  <a href="#en">English</a> |
  <a href="#ja">日本語</a>
</p>

<a id="zh-cn"></a>

## 简体中文

[English](#en) | [日本語](#ja)

Komorebi 是一个面向 Windows 桌面的媒体转换工具，理念是简单、高效、自动化。

它基于 [FFBox](https://github.com/ttqftech/FFBox) 5.x 改造，底层调用 FFmpeg / FFprobe 处理音视频，并加入了更适合日常使用的 Komorebi 引导界面。你不需要先理解一长串 FFmpeg 参数，只要选择场景、格式和质量，软件会自动生成更稳妥的转换方案。

### 适合做什么

- 把视频压小，方便收藏、发送、上传或长期保存。
- 把常见音频转换成 MP3、FLAC、AAC、OPUS 等格式。
- 只更换视频封装，比如从 MKV 转成 MP4，尽量不重新编码。
- 批量处理 NCM 音乐文件。
- 批量转换大量媒体文件，并查看进度、日志、速度和输出大小。

### 主要功能

**视频压缩**

- 支持动画 / 二次元、录屏 / 游戏、摄影等场景预设。
- 支持 H.264、H.265 / HEVC、AV1、VP9、MPEG-4 等视频编码。
- 支持 MP4、MKV、WebM、MOV、M4V、FLV、TS、AVI、GIF 等封装格式。
- 会根据封装格式自动修正不兼容的编码组合，减少失败概率。
- 支持保留源音轨、静音视频、添加外部音轨。
- 支持输出分辨率、画面比例、帧率和速度档位调节。
- 支持自定义输出目录和输出文件名模板。
- 转换前显示预计输出大小和压缩率。
- 转换完成后读取真实输出文件大小，显示实际压缩率或实际增大比例。

**音频转换**

- 支持 MP3、FLAC、WAV、AAC、M4A、OGG、WMA、OPUS、AC3、MP2。
- 提供无损 / 高质量、标准、小体积、极小体积等质量档位。
- 支持批量转换和统一输出命名。

**转封装**

- 默认尽量使用流复制，速度更快，画质不二次损失。
- 支持 MP4、MKV、MOV、WebM、FLV、TS 等常用容器。
- 支持调整分辨率、画面比例和帧率。
- 支持保留字幕、元数据和添加外部音轨。
- 当目标容器不兼容源编码时，会自动切换到高保真转码兜底。

**NCM 转换**

- 支持选择单个 `.ncm` 文件。
- 支持选择文件夹并递归扫描。
- 支持按源音乐自动输出格式。
- 可选择转换成功后删除源文件。

### 批量任务和进度

- 支持拖入文件、文件夹或文本路径创建任务。
- 支持任意支持格式拖入，并自动切换到适合的处理模式。
- 支持单任务和多输入任务。
- 支持队列开始、暂停、停止、重置和删除。
- 支持任务列表多选操作。
- 显示转码进度、速度、码率、输出大小、剩余时间和日志。
- 进度图表对异常数据做了保护，避免压缩后变大或数据缺失时界面卡住。

### 界面和语言

- 内置简体中文、English、日本語三种界面语言。
- 安装包安装时可选择语言。
- 设置页可以随时切换语言。
- 参数切换、预设选择、面板切换都有过渡动画。
- 支持默认、快速、慢速等动画速率选项。
- 使用 Komorebi 动漫角色图标和引导图片，让引导、拖拽、退出确认等界面风格统一。
- 设置中提供“关于”页面，介绍 Komorebi 的理念和引用项目。

### 下载

请到 GitHub Releases 下载最新版本：

[https://github.com/Misakamiro/Komorebi/releases/latest](https://github.com/Misakamiro/Komorebi/releases/latest)

推荐普通用户下载：

- `Komorebi_*.exe`：安装版
- `Komorebi_*_portable.zip`：免安装版

### 引用项目

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

### 开发说明

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

<a id="en"></a>

## English

[简体中文](#zh-cn) | [日本語](#ja)

Komorebi is a media conversion tool for Windows desktops. Its design philosophy is simple, efficient, and automated.

It is rebuilt on top of [FFBox](https://github.com/ttqftech/FFBox) 5.x and uses FFmpeg / FFprobe for media processing. Komorebi adds a friendlier guided workflow for everyday use: instead of writing long FFmpeg commands, you choose a scene, format, and quality level, and the app generates a safer conversion plan for you.

### What It Is For

- Compress videos for storage, sharing, uploading, or long-term archiving.
- Convert common audio files to MP3, FLAC, AAC, OPUS, and other formats.
- Change the container, such as MKV to MP4, with stream copy whenever possible.
- Batch-convert NCM music files.
- Process large batches of media while watching progress, logs, speed, and output size.

### Core Features

**Video Compression**

- Scene presets for animation / anime, screen recording / games, and photography.
- Video codec support for H.264, H.265 / HEVC, AV1, VP9, MPEG-4, and more.
- Container support for MP4, MKV, WebM, MOV, M4V, FLV, TS, AVI, GIF, and more.
- Automatically corrects incompatible codec and container combinations to reduce failures.
- Supports keeping source audio, creating silent videos, or adding external audio tracks.
- Adjustable output resolution, aspect ratio, frame rate, and speed profile.
- Custom output folder and output filename templates.
- Estimated output size and compression ratio before conversion.
- Actual output size and real compression ratio after conversion, including cases where the file becomes larger.

**Audio Conversion**

- Supports MP3, FLAC, WAV, AAC, M4A, OGG, WMA, OPUS, AC3, and MP2.
- Provides lossless / high quality, standard, small size, and tiny size quality profiles.
- Supports batch conversion and consistent output naming.

**Remux**

- Uses stream copy by default whenever possible, making conversion faster and avoiding quality loss.
- Supports common containers such as MP4, MKV, MOV, WebM, FLV, and TS.
- Supports resolution, aspect ratio, and frame-rate adjustments.
- Supports subtitles, metadata, and external audio tracks.
- Falls back to high-fidelity transcoding when the target container cannot hold the source streams.

**NCM Conversion**

- Supports single `.ncm` files.
- Supports folder selection and recursive scanning.
- Outputs according to the source music format when possible.
- Can delete the source file after successful conversion.

### Batch Tasks and Progress

- Create tasks by dragging files, folders, or text paths into the app.
- Accepts supported formats in any mode and automatically switches to a suitable workflow.
- Supports single-task and multi-input task modes.
- Supports queue start, pause, stop, reset, and delete.
- Supports multi-select operations in the task list.
- Shows conversion progress, speed, bitrate, output size, remaining time, and logs.
- Protects progress charts from abnormal data, such as larger-than-source output or missing metrics.

### Interface and Language

- Built-in UI languages: Simplified Chinese, English, and Japanese.
- The installer lets users choose a language.
- The Settings page lets users switch languages at any time.
- Parameter changes, preset selection, and panel transitions include smooth animations.
- Animation speed can be set to default, fast, or slow.
- Komorebi uses a unified anime character icon and guide images across onboarding, drag-and-drop, exit confirmation, and related screens.
- The Settings page includes an About section explaining Komorebi's philosophy and referenced projects.

### Download

Download the latest version from GitHub Releases:

[https://github.com/Misakamiro/Komorebi/releases/latest](https://github.com/Misakamiro/Komorebi/releases/latest)

Recommended downloads:

- `Komorebi_*.exe`: installer version
- `Komorebi_*_portable.zip`: portable version

### Credits

Komorebi is built with these excellent projects:

- FFBox: [https://github.com/ttqftech/FFBox](https://github.com/ttqftech/FFBox)
- FFmpeg: [https://ffmpeg.org/](https://ffmpeg.org/)
- ncmdump: [https://github.com/taurusxin/ncmdump](https://github.com/taurusxin/ncmdump)

For license and source notices, read:

- `LICENSE`
- `NOTICE-Komorebi.md`
- `licenses/FFBox-LICENSE.txt`
- `tools/LICENSE-ffmpeg.txt`
- `tools/LICENSE-ncmdump.txt`

### Development

Komorebi is mainly a Windows desktop app built with Electron, Vue 3, Pinia, TypeScript, Vite, and Koa.

Common commands:

```powershell
pnpm install
pnpm run dev:frontend
pnpm run typecheck
pnpm run build:everything
```

The repository does not commit local build outputs or large binary files:

- `node_modules/`
- `app/`
- `release/`
- `tools/*.exe`

For local builds, prepare `tools/ffmpeg.exe`, `tools/ffprobe.exe`, and `tools/ncmdump.exe` yourself.

<a id="ja"></a>

## 日本語

[简体中文](#zh-cn) | [English](#en)

Komorebi は Windows デスクトップ向けのメディア変換ツールです。目指しているものは、シンプルで、高速で、自動化された変換体験です。

[FFBox](https://github.com/ttqftech/FFBox) 5.x をベースに再構成されており、内部では FFmpeg / FFprobe を使って音声と映像を処理します。Komorebi では日常利用に向いたガイド式の画面を追加しているため、長い FFmpeg コマンドを理解しなくても、シーン、形式、品質を選ぶだけで、より安全な変換設定を作成できます。

### できること

- 動画を圧縮して、保存、共有、アップロード、長期保管をしやすくする。
- 一般的な音声ファイルを MP3、FLAC、AAC、OPUS などへ変換する。
- MKV から MP4 への変換のように、可能な限り再エンコードせずにコンテナだけを変更する。
- NCM 音楽ファイルをまとめて変換する。
- 多数のメディアファイルを一括処理し、進捗、ログ、速度、出力サイズを確認する。

### 主な機能

**動画圧縮**

- アニメ / 二次元、画面録画 / ゲーム、写真 / 実写向けのシーンプリセット。
- H.264、H.265 / HEVC、AV1、VP9、MPEG-4 などの動画コーデックに対応。
- MP4、MKV、WebM、MOV、M4V、FLV、TS、AVI、GIF などのコンテナに対応。
- 非対応のコーデックとコンテナの組み合わせを自動補正し、失敗を減らします。
- 元音声の保持、無音動画、外部音声トラックの追加に対応。
- 出力解像度、アスペクト比、フレームレート、変換速度プロファイルを調整可能。
- 出力先フォルダーと出力ファイル名テンプレートを設定可能。
- 変換前に予測出力サイズと圧縮率を表示。
- 変換後に実際の出力サイズを読み取り、実際の圧縮率やサイズ増加率を表示。

**音声変換**

- MP3、FLAC、WAV、AAC、M4A、OGG、WMA、OPUS、AC3、MP2 に対応。
- ロスレス / 高品質、標準、小容量、極小容量などの品質プリセットを提供。
- 一括変換と統一された出力名に対応。

**コンテナ変換**

- 可能な場合はストリームコピーを優先し、高速で画質劣化のない変換を行います。
- MP4、MKV、MOV、WebM、FLV、TS などの一般的なコンテナに対応。
- 解像度、アスペクト比、フレームレートの調整に対応。
- 字幕、メタデータ、外部音声トラックに対応。
- 目標コンテナが元のストリームに対応していない場合は、高品質な再エンコードへ自動的に切り替えます。

**NCM 変換**

- 単体の `.ncm` ファイルを選択可能。
- フォルダー選択と再帰スキャンに対応。
- 可能な場合は元の音楽形式に合わせて出力。
- 変換成功後に元ファイルを削除する設定に対応。

### 一括タスクと進捗

- ファイル、フォルダー、テキストパスをドラッグしてタスクを作成できます。
- 対応形式であればどのモードでも受け取り、適切な処理モードへ自動的に切り替えます。
- 単一タスクと複数入力タスクに対応。
- キューの開始、一時停止、停止、リセット、削除に対応。
- タスクリストで複数選択操作が可能。
- 変換進捗、速度、ビットレート、出力サイズ、残り時間、ログを表示。
- 圧縮後にサイズが大きくなる場合やデータが欠落する場合でも、進捗グラフが固まらないよう保護しています。

### 画面と多言語

- UI 言語は簡体字中国語、英語、日本語に対応。
- インストーラーで言語を選択可能。
- 設定画面からいつでも言語を切り替え可能。
- パラメーター変更、プリセット選択、パネル切り替えに滑らかなアニメーションを追加。
- アニメーション速度は標準、高速、低速から選択可能。
- Komorebi のアニメキャラクターアイコンとガイド画像を使い、案内、ドラッグ操作、終了確認などの画面スタイルを統一。
- 設定画面には、Komorebi の理念と参照プロジェクトを紹介する About セクションがあります。

### ダウンロード

最新版は GitHub Releases からダウンロードできます：

[https://github.com/Misakamiro/Komorebi/releases/latest](https://github.com/Misakamiro/Komorebi/releases/latest)

通常は以下を選択してください：

- `Komorebi_*.exe`: インストーラー版
- `Komorebi_*_portable.zip`: ポータブル版

### クレジット

Komorebi は以下の優れたプロジェクトを利用しています：

- FFBox: [https://github.com/ttqftech/FFBox](https://github.com/ttqftech/FFBox)
- FFmpeg: [https://ffmpeg.org/](https://ffmpeg.org/)
- ncmdump: [https://github.com/taurusxin/ncmdump](https://github.com/taurusxin/ncmdump)

ライセンスとソースに関する表記は以下を確認してください：

- `LICENSE`
- `NOTICE-Komorebi.md`
- `licenses/FFBox-LICENSE.txt`
- `tools/LICENSE-ffmpeg.txt`
- `tools/LICENSE-ncmdump.txt`

### 開発

Komorebi は主に Windows デスクトップ向けのアプリで、Electron、Vue 3、Pinia、TypeScript、Vite、Koa を使用しています。

よく使うコマンド：

```powershell
pnpm install
pnpm run dev:frontend
pnpm run typecheck
pnpm run build:everything
```

このリポジトリには、ローカルのビルド成果物や大きなバイナリファイルはコミットしません：

- `node_modules/`
- `app/`
- `release/`
- `tools/*.exe`

ローカルでビルドする場合は、`tools/ffmpeg.exe`、`tools/ffprobe.exe`、`tools/ncmdump.exe` を自分で用意してください。
