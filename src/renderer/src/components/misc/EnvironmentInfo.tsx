import { Fragment, h } from "vue";
import { version } from "@common/constants";
import { useAppStore } from "@renderer/stores/appStore";
import { ServiceBridgeStatus } from "@renderer/bridges/serviceBridge";
import Msgbox from "../Msgbox/Msgbox";
import nodeBridge from "@renderer/bridges/nodeBridge";

export function showEnvironmentInfo() {
    const appStore = useAppStore();
    const currentServer = appStore.currentServer;
    const backendInfo = [];
    if (currentServer?.entity.status === ServiceBridgeStatus.Connected) {
        const ffmpegInfo = currentServer.data.ffmpegInfo;
        const ffmpegEncoderInfo = ffmpegInfo.version ? (ffmpegInfo.scanning ? '（正在扫描编码器和滤镜）' : `（${ffmpegInfo.videoEncodersCount} 个视频编码器，${ffmpegInfo.audioEncodersCount} 个音频编码器，${ffmpegInfo.demuxersCount} 个解复用器，${ffmpegInfo.muxersCount} 个复用器，${ffmpegInfo.filtersCount} 个滤镜）`) : '';
        backendInfo.push(
            `当前后端连接形式：${currentServer.entity.ip === 'localhost' ? '本地' : '远程'}`,
            h('br'),
            `当前后端版本：${currentServer.data.version}`,
            h('br'),
            `当前后端 OS 环境：${currentServer.data.os}`,
            h('br'),
            `当前后端 ffmpeg：${currentServer.data.ffmpegInfo.version}${ffmpegEncoderInfo}`,
        )
    }
    Msgbox({
        container: document.body,
        title: '版本信息',
        content: h(Fragment, [
            `前端版本：${version}`,
            h('br'),
            `前端 OS 环境：${navigator.platform}`,
            h('br'),
            `前端引擎环境：${nodeBridge.env === 'electron' ? 'electron' : navigator.userAgent}`,
            ...(backendInfo.length ? [h('br'), '·'] : []),
            ...(backendInfo.length ? [h('br'), ...backendInfo] : []),
            ...(appStore.latestVersion && appStore.latestVersion !== version ? [h('br'), '·', h('br'), `Komorebi 最新版本：${appStore.latestVersion}`] : []),
        ]),
        buttons: [
            { text: '关闭', role: 'cancel' },
        ]
    });
}
