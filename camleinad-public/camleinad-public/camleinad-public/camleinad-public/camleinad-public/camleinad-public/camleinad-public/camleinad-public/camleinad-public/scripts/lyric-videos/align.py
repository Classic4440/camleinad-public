#!/usr/bin/env python3
"""Forced alignment of lyrics text to a song, so lyric lines can be timed.

Usage: align.py <audio> <lyrics.txt> <out.json>

Uses stable-ts (a Whisper-based aligner) only to find WHEN each lyric line is sung.
It does not generate video or change the words. Output: [{"line": str, "time": seconds}].
"""
import json
import sys

import stable_whisper

audio, lyrics_path, out_path = sys.argv[1:4]
lines = [l.strip() for l in open(lyrics_path, encoding="utf-8").read().splitlines() if l.strip()]

model = stable_whisper.load_model("small")
result = model.align(audio, "\n".join(lines), language="en", original_split=True)

segments = [s for s in result.segments if s.text.strip()]
if len(segments) != len(lines):
    sys.exit(f"alignment returned {len(segments)} segments for {len(lines)} lines")

timed = [{"line": lines[i], "time": round(float(s.start), 2)} for i, s in enumerate(segments)]
# keep times strictly increasing so subtitles never overlap
for i in range(1, len(timed)):
    if timed[i]["time"] <= timed[i - 1]["time"]:
        timed[i]["time"] = round(timed[i - 1]["time"] + 0.5, 2)

json.dump(timed, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
