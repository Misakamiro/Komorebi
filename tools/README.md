# tools

这个目录用于放置 Komorebi 打包时需要复制到安装目录的本地命令行工具。

因为 GitHub 不适合保存大型二进制文件，下面这些文件不会提交到 Git：

- `ffmpeg.exe`
- `ffprobe.exe`
- `ncmdump.exe`

开发或构建发布包前，请手动把这些文件放到本目录。

推荐来源：

- FFmpeg Windows build: https://ffmpeg.org/download.html
- ncmdump: https://github.com/taurusxin/ncmdump

随发布包分发时，请同时保留对应许可文件：

- `LICENSE-ffmpeg.txt`
- `README-ffmpeg.txt`
- `LICENSE-ncmdump.txt`
