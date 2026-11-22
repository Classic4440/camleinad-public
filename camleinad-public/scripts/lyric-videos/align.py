#!/usr/bin/env python3
"""Forced alignment of lyrics text to a song, so lyric lines can be timed.

Usage: align.py <audio> <lyrics.txt> <out.json>

Uses stable-ts (a Whisper-based aligner) only to find WHEN each lyric line is sung.
It does not generate video or change the words.
Output: [{"line": str, "time": seconds, "conf": 0-1}]. "conf" is how well the line matches the
audio (average word probability); low values point at lyrics that may not be what is sung.
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



def line_conf(seg):
    """Average word probability for a line, or None if the aligner did not provide it."""
    try:
        probs = [float(w.probability) for w in seg.words if getattr(w, "probability", None) is not None]
        return round(sum(probs) / len(probs), 3) if probs else None
    except Exception:
        return None


timed = []
for i, s in enumerate(segments):
    item = {"line": lines[i], "time": round(float(s.start), 2)}
    conf = line_conf(s)
    if conf is not None:
        item["conf"] = conf
    timed.append(item)
# keep times strictly increasing so subtitles never overlap
for i in range(1, len(timed)):
    if timed[i]["time"] <= timed[i - 1]["time"]:
        timed[i]["time"] = round(timed[i - 1]["time"] + 0.5, 2)

json.dump(timed, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
