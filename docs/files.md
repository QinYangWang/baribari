# Files & paths

## Config root

Default: `~/.config/baribari/`  
Override: `BARIBARI_CONFIG_DIR`

```text
~/.config/baribari/
├── config.json
├── replace.json
├── models/
├── sessions/<session-id>/
├── speakers/roster.json
└── recordings/
```

Print resolved paths:

```bash
baribari paths
# alias: baribari config
```

## Session layout

```text
~/.config/baribari/sessions/<session-id>/
  meta.json           # id, name, duration, counts
  transcript.jsonl    # segments (text + translation)
  speakers.json
  audio.wav           # only if you enable recording (r)
  audio-part-*.wav    # additional clips when formats differ
```

Session IDs look like `ses_…`. Display names are separate and can be renamed with `e` in resume mode.

## Global speakers

```text
~/.config/baribari/speakers/roster.json
```

Voiceprints are stored **per embedding model**. Details: [Speakers](./speakers).

## Local dictionary

```text
~/.config/baribari/replace.json
```

Non-AI replacements applied after ASR. See [Configuration](./configuration).

## Publishing this site

Design docs live in `docs/` and build with VitePress:

```bash
npm run docs:dev
npm run docs:build    # → docs/.vitepress/dist
```

GitHub Pages workflow: enable **Settings → Pages → Source: GitHub Actions** after `.github/workflows/docs.yml` is present.

Site: `https://qinyangwang.github.io/baribari/`
