# README demo video

`assets/demo-desktop.mp4` centers on VINTAGE's Monitor and Sessions:

- Real Claude Code activity, model/context information and host CPU/memory in Monitor.
- The Monitor action returning to the session's terminal.
- Real saved conversations in Sessions, followed by Resume in a new Space.
- Graphite dark switching to Ocean light.

Board is omitted from this tour. The agent's demonstration project contains an
expired-session fix and three passing regression tests. Those are real Claude
results, independently checked by the recorder. There are no fabricated agent
statuses, quota readings or conversation transcripts. Collector and history
results are scoped to the filming project to exclude unrelated private sessions;
the host label is anonymized, while CPU/memory measurements remain real.

The short headlines and pacing take inspiration from
[NodeTerm's hero tour](https://github.com/eneskirca/nodeterm/blob/main/docs/assets/hero-tour.mp4).
Idle waits are trimmed. The desktop framing is fixed, with no zoom or pan. The
wallpaper and Mac-inspired chrome surround a real Linux Electron capture; they
are presentation artwork, not macOS device validation.

Each filming shell runs `source ~/.zshrc` before setting PS1 to `sample-app ❯` and
starting Claude. Color is enabled with `FORCE_COLOR=1`, `COLORTERM=truecolor` and
`NO_COLOR` unset. Personal shell files are not edited.

## Re-recording

Requires a built app, Linux display, Node 24, project dependencies, a working
Claude Code configuration, Python 3, ffmpeg and ffprobe. Recording runs real model
tasks and may take several minutes. A disposable project and app profile are used.
If no previous real conversation exists, the recorder first asks Claude to prepare
one so the Sessions/Resume sequence has genuine history.

```sh
VINTAGE_DEMO_OUTPUT=/tmp/vintage-demo-capture node scripts/record-readme-demo.mjs
python3 scripts/style-readme-demo.py /tmp/vintage-demo-capture/capture.json
```

`VINTAGE_DEMO_PROJECT` can point to an existing filming project to reuse its real
work and conversation history. Use a disposable project; the agent executes tasks
there. A magenta marker, excluded from the final output, synchronizes cuts with
the raw frames. Raw footage and app profiles stay under the OS temporary directory.

The editor writes the H.264 MP4, poster and scene metadata under `assets/` using the
existing wallpaper. Output is 1920 × 1080 at 25 fps, with English headlines and no
audio. Both READMEs link the poster to the MP4. No upload, commit or push is performed.
Do not publish raw footage or disposable profiles.
