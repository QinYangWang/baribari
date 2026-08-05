# LAN sharing

One host runs ASR; peers on the same network follow **finalized** captions without installing models.

![Web share view](/screenshots/web-share.png)

## Host

```bash
baribari --share
# or toggle with h inside the live / resume TUI
```

Default port is **8787**. Override with `--share-port`:

```bash
baribari --share --share-port 8788
```

The host side panel shows a clickable LAN URL (`host:port`).

## Join as a peer

```bash
baribari join http://<lan-ip>:8787/
```

Or open the URL in a browser. Peers receive live segments only — they do not run VAD/ASR.

## Notes

- Only **final** segments are shared (not the live “Recognizing…” row).
- Share can be toggled with `h` without quitting the session.
- Resume mode also supports share while browsing a saved meeting.
