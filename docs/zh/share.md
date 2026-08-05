# 局域网共享

一台主机跑识别；同一网络上的同伴只需看**最终字幕**，无需安装模型。

![网页共享视图](/screenshots/web-share.png)

## 主机

```bash
baribari --share
# 或在实时 / 回放 TUI 内按 h 切换
```

默认端口 **8787**。可用 `--share-port` 修改：

```bash
baribari --share --share-port 8788
```

主机侧栏会显示可点击的局域网 URL（`主机:端口`）。

## 同伴加入

```bash
baribari join http://<局域网IP>:8787/
```

或在浏览器打开该 URL。同伴只接收片段，不运行 VAD/ASR。

## 说明

- 只共享**最终**片段（不含「识别中…」实时行）。
- 按 `h` 可随时开关共享，无需退出。
- 回放模式浏览已保存会议时也可开启共享。
