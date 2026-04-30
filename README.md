# Komorebi

Komorebi 是一个面向 Windows 桌面的媒体转换工具，基于 [FFBox](https://github.com/ttqftech/FFBox) 5.x 改造，使用 Electron、Vue 3、Pinia 和 TypeScript 构建。它保留了 FFBox 的任务队列、进度、日志和参数系统，并加入了更适合普通用户的引导式转换入口。

## 功能

- 视频压缩
  - 动画、录屏、真人视频等场景预设
  - MP4、MKV、WebM、MOV、M4V、FLV、TS、AVI 等封装格式
  - 根据封装格式自动修正兼容编码器
  - 根据已选文件自动判断可用格式
- 音频转换
  - MP3、FLAC、WAV、AAC、M4A、OGG、WMA、OPUS、AC3、MP2
  - 多档质量选择
- 转换格式/转封装
  - 默认尽量流复制，保留字幕和元数据
  - 容器不兼容时自动使用高保真转码兜底
  - 支持外部音轨
- NCM 转换
  - 支持文件和文件夹
  - 支持递归目录
  - 可选转换成功后删除源文件
- 本地开箱即用
  - 发布包可携带 FFmpeg、FFprobe 和 ncmdump
  - 无需用户手动配置 FFmpeg 环境变量

## 技术栈

- Electron 24
- Vue 3
- Pinia
- TypeScript
- Vite
- Koa
- electron-builder
- pkg

## 目录结构

```text
.
├─ config/                 # Vite、pkg、Electron Builder 配置
├─ scripts/                # 开发和构建脚本
├─ src/
│  ├─ backend/             # 本地转换服务
│  ├─ common/              # 前后端共享类型、参数、预设
│  ├─ main/                # Electron 主进程
│  ├─ preload/             # Electron preload
│  └─ renderer/            # Vue 前端
├─ tools/                  # 本地工具占位目录，exe 不提交到 Git
├─ LICENSE                 # 上游 FFBox 许可条款
├─ NOTICE-Komorebi.md      # 第三方项目和二进制分发说明
├─ package.json
└─ pnpm-lock.yaml
```

## 开发环境

建议环境：

- Windows 10/11
- Node.js 18+
- pnpm 8+

安装依赖：

```powershell
pnpm install
```

启动前端开发环境：

```powershell
pnpm run dev:frontend
```

## 本地工具

为了避免超过 GitHub 的单文件 100 MB 限制，仓库不会提交下面这些二进制文件：

- `tools/ffmpeg.exe`
- `tools/ffprobe.exe`
- `tools/ncmdump.exe`

开发或打包前，请把它们放到 `tools/` 目录。发布时建议把这些文件和安装包一起放到 GitHub Releases。

需要保留并随发布包分发的许可文件：

- `tools/LICENSE-ffmpeg.txt`
- `tools/README-ffmpeg.txt`
- `tools/LICENSE-ncmdump.txt`

## 构建

完整构建 Windows 安装包：

```powershell
pnpm run build:everything
```

如果使用 npm，也可以执行：

```powershell
npm run build:everything
```

构建完成后，安装包会输出到：

```text
release/Komorebi_5.3.0-alpha.exe
```

如果只想分步构建：

```powershell
node scripts/build-frontend.mjs
node scripts/build-backend.mjs
pkg --config ./config/pkg.win.config.json ./app/backend/index.cjs
electron-builder
```

## GitHub 上传前检查

不要提交这些目录或文件：

- `node_modules/`
- `app/`
- `release/`
- `source-b64-parts/`
- `Komorebi-FFBox-source-*.zip`
- `Komorebi-FFBox-source-*.zip.b64.txt`
- `tools/*.exe`

这些内容已经写入 `.gitignore`。

## 上游和许可

Komorebi 基于 FFBox 改造，并保留上游项目的许可和来源声明。

- FFBox: https://github.com/ttqftech/FFBox
- FFmpeg: https://ffmpeg.org/
- ncmdump: https://github.com/taurusxin/ncmdump

请阅读：

- `LICENSE`
- `NOTICE-Komorebi.md`
- `tools/LICENSE-ffmpeg.txt`
- `tools/LICENSE-ncmdump.txt`

## 状态

当前项目主要面向 Windows 桌面端。Linux、macOS 和 Web 端不是当前发布目标。
