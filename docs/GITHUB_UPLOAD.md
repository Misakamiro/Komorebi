# 上传到 GitHub 指南

这份指南假设项目目录是：

```text
C:\Users\misakamiro\Documents\Codex\2026-04-25\files-mentioned-by-the-user-gui-2\Komorebi-FFBox
```

## 1. 上传前确认

先确认这些内容不要进入 Git 仓库：

- `node_modules/`
- `app/`
- `release/`
- `source-b64-parts/`
- `Komorebi-FFBox-source-*.zip`
- `Komorebi-FFBox-source-*.zip.b64.txt`
- `tools/*.exe`

这些规则已经写进 `.gitignore`。

`tools/ffmpeg.exe` 和 `tools/ffprobe.exe` 超过 GitHub 单文件 100 MB 限制，不能直接提交。建议发布软件时把它们放到 GitHub Releases 的附件里。

## 2. 创建 GitHub 仓库

1. 打开 https://github.com/new
2. Repository name 填 `Komorebi` 或 `Komorebi-FFBox`
3. Visibility 按需选择 Public 或 Private
4. 不要勾选 `Add a README file`
5. 不要勾选 `.gitignore` 和 License
6. 点击 `Create repository`

## 3. 第一次上传

在 PowerShell 里进入项目目录：

```powershell
cd "C:\Users\misakamiro\Documents\Codex\2026-04-25\files-mentioned-by-the-user-gui-2\Komorebi-FFBox"
```

初始化 Git：

```powershell
git init
git add .
git commit -m "Initial Komorebi source release"
```

把远程仓库地址换成你自己的 GitHub 地址：

```powershell
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

如果你使用 SSH：

```powershell
git remote add origin git@github.com:<你的用户名>/<仓库名>.git
git push -u origin main
```

## 4. 发布安装包

构建安装包：

```powershell
pnpm install
pnpm run build:everything
```

如果你使用 npm：

```powershell
npm install
npm run build:everything
```

构建完成后，安装包在：

```text
release/Komorebi_5.40.1.exe
```

在 GitHub 创建 Release：

1. 进入仓库页面
2. 点击右侧 `Releases`
3. 点击 `Draft a new release`
4. Tag 填 `v5.40.1`
5. Release title 填 `Komorebi 5.40.1`
6. 上传 `release/Komorebi_5.40.1.exe`
7. 如果要分发工具包，也上传 `tools/ffmpeg.exe`、`tools/ffprobe.exe`、`tools/ncmdump.exe` 和相关 LICENSE 文件
8. 点击 `Publish release`

## 5. 后续更新代码

每次修改后：

```powershell
git status
git add .
git commit -m "描述这次修改"
git push
```

## 6. 常见问题

### git 不是可识别的命令

安装 Git for Windows：

https://git-scm.com/download/win

安装后重新打开 PowerShell。

### push 时要求登录

GitHub 现在不支持用账号密码直接推送。你可以选择：

- 使用 GitHub Desktop
- 使用 HTTPS + Personal Access Token
- 配置 SSH Key

最简单的方式是安装 GitHub Desktop，然后选择 `Add local repository`，把本项目目录添加进去，再点击 Publish repository。

### 文件超过 100 MB

不要把大文件提交到 Git。安装包、FFmpeg、FFprobe 这类文件放到 GitHub Releases。

如果不小心提交过大文件，需要从 Git 历史里清理后再 push。
