"""Cut the real Claude workflow into a concise, fixed-frame desktop tour."""

import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("capture", type=Path, help="capture.json printed by the recorder")
parser.add_argument("--output", type=Path, default=ROOT / "assets/demo-desktop.mp4")
args = parser.parse_args()
META = json.loads(args.capture.read_text())
RAW = Path(META["rawPath"])
OUT = args.output.resolve()
OUT.parent.mkdir(parents=True, exist_ok=True)
WORK = args.capture.parent / "edit"
WORK.mkdir(exist_ok=True)
WALLPAPER = ROOT / "assets/demo-desktop-wallpaper.png"
# Find the last magenta sync frame instead of estimating the recording offset.
frames = subprocess.check_output(
    [
        "ffmpeg",
        "-v",
        "error",
        "-i",
        str(RAW),
        "-vf",
        "scale=32:18",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "pipe:1",
    ]
)
stride = 32 * 18 * 3
marker = []
for i in range(len(frames) // stride):
    chunk = frames[i * stride : (i + 1) * stride]
    count = sum(
        chunk[j] > 200 and chunk[j + 1] < 45 and chunk[j + 2] > 200
        for j in range(0, stride, 3)
    )
    if count > 300:
        marker.append(i)
if not marker:
    raise RuntimeError("No recording sync marker found")
offset = (marker[-1] + 1) / 25
viewport = META["viewport"]
ratio = min(1920 / viewport["width"], 1080 / viewport["height"])
content_width = round(viewport["width"] * ratio / 2) * 2
content_height = round(viewport["height"] * ratio / 2) * 2
app_width = round(content_width * 900 / content_height / 2) * 2
app_left = (1920 - app_width) // 2
app_filter = f"crop={content_width}:{content_height}:0:0,scale={app_width}:900"
shots = []
position = 0.0
for i, shot in enumerate(META["shots"]):
    start, end = shot["start"], shot["end"]
    limit = shot.get("maxDuration", 4.0)
    if end - start > limit:
        if shot["title"] in ("Ask Claude.", "Resume. With context."):
            end = start + limit
        else:
            start = end - limit
    if end <= start:
        continue
    shots.append(
        {
            "title": shot["title"],
            "sourceStart": start + offset,
            "sourceEnd": end + offset,
            "start": position,
            "duration": end - start,
        }
    )
    position += end - start
DURATION = position


def stamp(t):
    n = round(t * 100)
    return f"{n // 360000}:{n // 6000 % 60:02}:{n // 100 % 60:02}.{n % 100:02}"


header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Note,DejaVu Sans,16,&H00DDDDDD,&H00FFFFFF,&H00151515,&H00151515,0,0,0,0,100,100,0,0,1,1,0,9,160,160,43,1
Style: Headline,DejaVu Sans,64,&H00FFFFFF,&H00FFFFFF,&H00151515,&H00151515,-1,0,0,0,100,100,0,0,1,2,2,2,90,90,78,1
Style: Title,DejaVu Sans,100,&H00FFFFFF,&H00FFFFFF,&H00151515,&H00151515,-1,0,0,0,100,100,4,0,1,0,0,5,0,0,0,1
Style: Tag,DejaVu Sans,32,&H00CFDCD5,&H00FFFFFF,&H00151515,&H00151515,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
lines = []


def event(start, end, style, text):
    lines.append(f"Dialogue: 0,{stamp(start)},{stamp(end)},{style},,0,0,0,,{text}")


for i, shot in enumerate(shots):
    a = max(1.0, shot["start"])
    b = min(shot["start"] + shot["duration"], DURATION - 1.6)
    if b > a:
        prefix, last = shot["title"].rsplit(" ", 1)
        event(a, b, "Headline", r"{\\fad(90,90)}" + prefix + r" {\\c&H54A8E4&}" + last)
event(1, DURATION - 1.6, "Note", "ACTUAL CLAUDE CODE WORK  /  IDLE WAITS TRIMMED")
event(0, 1.0, "Title", r"{\\pos(960,460)\\fad(120,120)}VINTAGE")
event(0, 1.0, "Tag", r"{\\pos(960,580)\\fad(120,120)}Run. Monitor. Resume.")
event(DURATION - 1.6, DURATION, "Title", r"{\\pos(960,455)\\fad(180,280)}VINTAGE")
event(
    DURATION - 1.6,
    DURATION,
    "Tag",
    r"{\\pos(960,570)\\fad(180,280)}Keep your agents in view.",
)
ass = WORK / "titles.ass"
ass.write_text(header + "\n".join(lines).replace("\\\\", "\\") + "\n")
desktop_lines = []


def desktop(text, style="Note", layer=0):
    desktop_lines.append(
        f"Dialogue: {layer},0:00:00.00,{stamp(DURATION)},{style},,0,0,0,,{text}"
    )


def rectangle(x, y, w, h, color, alpha="00", layer=0):
    desktop(
        r"{\\an7\\pos("
        + f"{x},{y}"
        + r")\\p1\\bord0\\shad0\\1c&H"
        + color
        + r"&\\alpha&H"
        + alpha
        + r"&}m 0 0 l "
        + f"{w} 0 {w} {h} 0 {h}",
        layer=layer,
    )


# The rectangle helper uses ASS vector drawing for crisp, lightweight overlays.
rectangle(0, 0, 1920, 30, "17151B", "45")
desktop(
    r"{\\an7\\pos(28,5)\\fs18\\b1\\1c&HFFFFFF&}VINTAGE     File     Edit     View     Window     Help",
    layer=1,
)
desktop(r"{\\an9\\pos(1885,5)\\fs17\\1c&HFFFFFF&}Wi-Fi     100%     Wed  9:41", layer=1)
rectangle(app_left - 13, 86, app_width + 26, 927, "000000", "B5")
rectangle(app_left - 7, 78, app_width + 14, 930, "000000", "95")
rectangle(app_left, 70, app_width, 30, "292929")
desktop(r"{\\an8\\pos(960,74)\\fs16\\1c&HCCCCCC&}VINTAGE — Sample app", layer=1)
for x, color in [
    (app_left + 18, "605FFF"),
    (app_left + 40, "4EBBFF"),
    (app_left + 62, "56C735"),
]:
    desktop(
        r"{\\an7\\pos("
        + f"{x},79"
        + r")\\p1\\bord0\\1c&H"
        + color
        + r"&}m 5 0 b 12 0 12 12 5 12 b -2 12 -2 0 5 0",
        layer=1,
    )
rectangle(715, 1019, 490, 52, "38323B", "60")
for x, color, text in [
    (737, "D49B55", "F"),
    (800, "946DBE", "S"),
    (863, "252525", ">_"),
    (926, "509BD7", "V"),
    (989, "C28D69", "N"),
    (1052, "8891A4", "⚙"),
    (1115, "BABABA", "▤"),
]:
    rectangle(x, 1026, 40, 36, color)
    desktop(
        r"{\\an5\\pos(" + f"{x + 20},1044" + r")\\fs20\\b1\\1c&HFFFFFF&}" + text,
        layer=1,
    )
desk = WORK / "desktop.ass"
# Normalize Python string escapes to one ASS command backslash.
desk.write_text(header + "\n".join(desktop_lines).replace("\\\\", "\\") + "\n")

trims = []
for i, shot in enumerate(shots):
    trims.append(
        f"[0:v]trim=start={shot['sourceStart']}:end={shot['sourceEnd']},setpts=PTS-STARTPTS[s{i}]"
    )
concat = (
    "".join(f"[s{i}]" for i in range(len(shots)))
    + f"concat=n={len(shots)}:v=1:a=0,{app_filter},setsar=1[app]"
)
filters = ";".join(
    trims
    + [
        concat,
        f"[1:v]scale=1920:1080,setsar=1,ass={desk}[desktop]",
        f"[desktop][app]overlay={app_left}:100:shortest=1,drawbox=x=0:y=0:w=iw:h=ih:color=0x101715:t=fill:enable='lt(t,1)+gte(t,{DURATION - 1.6})',ass={ass},fade=t=out:st={DURATION - 0.3}:d=0.3[out]",
    ]
)
subprocess.run(
    [
        "ffmpeg",
        "-y",
        "-v",
        "warning",
        "-i",
        str(RAW),
        "-loop",
        "1",
        "-framerate",
        "25",
        "-i",
        str(WALLPAPER),
        "-filter_complex",
        filters,
        "-map",
        "[out]",
        "-t",
        str(DURATION),
        "-an",
        "-c:v",
        "libx264",
        "-crf",
        "19",
        "-preset",
        "fast",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(OUT),
    ],
    check=True,
)
poster_at = next(
    (
        shot["start"] + shot["duration"] * 0.7
        for shot in shots
        if shot["title"] == "One click back to work."
    ),
    1.4,
)
subprocess.run(
    [
        "ffmpeg",
        "-y",
        "-v",
        "error",
        "-ss",
        str(poster_at),
        "-i",
        str(OUT),
        "-frames:v",
        "1",
        str(OUT.with_name(OUT.stem + "-poster.png")),
    ],
    check=True,
)
actual_duration = float(
    subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            str(OUT),
        ],
        text=True,
    )
)
final = {
    "duration": actual_duration,
    "width": 1920,
    "height": 1080,
    "fps": 25,
    "zoomBehavior": "none; fixed framing",
    "initialTheme": META["initialTheme"],
    "finalTheme": META["finalTheme"],
    "realModelTasks": True,
    "shellStartup": META.get("shellStartup"),
    "terminalColor": META.get("terminalColor"),
    "features": META.get("features", []),
    "testCount": META.get("testCount"),
    "sampleTelemetry": False,
    "prompt": "sample-app ❯ ",
    "reference": META["reference"],
    "shots": [
        {k: v for k, v in shot.items() if not k.startswith("source")} for shot in shots
    ],
}
OUT.with_name(OUT.stem + "-scenes.json").write_text(json.dumps(final, indent=2) + "\n")
print(f"Saved {OUT}: {DURATION:.1f}s, real Claude workflow, no zoom")
