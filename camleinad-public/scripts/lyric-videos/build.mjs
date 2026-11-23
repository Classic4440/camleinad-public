#!/usr/bin/env node
/**
 * Lyric video builder for camleinad.pages.dev
 *
 * For every RELEASED track in Supabase it takes the existing audio file and the track's
 * lyrics, renders an MP4 with ffmpeg (blurred cover art, waveform, synced lyric lines),
 * uploads it to the public `video-files` bucket and upserts a row in `videos`
 * (category "lyric"). The site's Videos page reads that table at runtime, so new videos
 * appear without redeploying. No generative video models are used.
 *
 * Timing: uses tracks.lyrics_synced when present, otherwise aligns the lyrics text to the
 * audio with scripts/lyric-videos/align.py (forced alignment, not video generation).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *      ONLY=<track id,track id>  render just these tracks
 *      FORCE=1                   re-render even if the video is up to date
 *      DRY_RUN=1                 list what would be rendered and stop
 *      CHECK=1                   align lyrics to the audio and report how well they match; renders nothing
 *      LYRIC_FONT                font family for the lyrics (default "DejaVu Sans")
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const W = 1280;
const H = 720;
const FPS = 25;
const FONT = process.env.LYRIC_FONT || 'DejaVu Sans';
const ARTIST = 'Cam Leinad';
const BUCKET = 'video-files';
const FOLDER = 'lyric-videos';
// Tracks that already have an official lyric video on the site (YouTube), so none is generated.
const SKIP_TRACK_IDS = new Set(['e353330b-32c4-4dd5-bf5e-c0a7d64511a7']); // How It Starts
const MIN_LYRIC_LINES = 4; // fewer sung lines than this means placeholder text (credits only)
const LOW_CONF = 0.25; // aligned lines below this match the audio poorly and are listed for review

/* ---------- lyrics + subtitles ---------- */

const CREDIT_RE = /\(\s*feat\.?[^)]*\)\.?\s*$/i; // "Title (feat. X & Y)." credit line, not sung
const DIRECTION_RE = /^\(\s*(?:final |last |repeat )?(?:chorus|verse|bridge|hook|intro|outro|instrumental|interlude|refrain)[^)]*\)$/i;
const TRANSLATION_HEAD_RE = /^\[[^\]]*translation[^\]]*\]$/i;
const TITLE_RE = /^.{1,80}\s[\u2014\u2013-]\s*Cam Leinad\s*$/i; // "SONG TITLE \u2014 Cam Leinad" header line, not sung
const isNonLyric = (l) => /^\[[^\]]*\]$/.test(l) || CREDIT_RE.test(l) || DIRECTION_RE.test(l) || TITLE_RE.test(l);

/**
 * Turns the lyrics text into the lines that are actually sung: [{ line, sub? }].
 * Drops [Section] headers, credit lines, title headers and stage directions. A "[... Translation ...]" block
 * is not sung, so it is removed from the sung lines and, when it has the same number of lines
 * as the block it translates, shown as a small subtitle under each sung line (`sub`).
 */
export function parseLyrics(text) {
  const blocks = [];
  let cur = [];
  const flush = () => { if (cur.length) blocks.push(cur); cur = []; };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) { flush(); continue; }
    cur.push(l);
  }
  flush();

  const out = [];
  let lastSung = null;
  for (const block of blocks) {
    const sung = [];
    const trans = [];
    let inTrans = false;
    for (const l of block) {
      if (TRANSLATION_HEAD_RE.test(l)) { inTrans = true; continue; }
      if (isNonLyric(l)) continue;
      (inTrans ? trans : sung).push(l);
    }
    const entries = sung.map((line) => ({ line }));
    const target = entries.length ? entries : lastSung; // a translation-only paragraph belongs to the block before it
    if (trans.length && target && target.length === trans.length) target.forEach((e, i) => { e.sub = trans[i]; });
    out.push(...entries);
    if (entries.length) lastSung = entries;
  }
  return out;
}

function assTime(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s - h * 3600 - m * 60;
  const whole = Math.floor(rest);
  let cs = Math.round((rest - whole) * 100);
  let ss = whole;
  if (cs === 100) { cs = 0; ss += 1; }
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

const esc = (s) => String(s).replace(/\\/g, '').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N');

export function buildAss({ title, release, lines, duration }) {
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cur,${FONT},58,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,3,2,5,110,110,0,1
Style: Side,${FONT},34,&H78FFFFFF,&H78FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2,1,5,110,110,0,1
Style: Sub,${FONT},30,&H00D2D2D2,&H00D2D2D2,&H00000000,&H64000000,0,-1,0,0,100,100,0,0,1,2,1,5,110,110,0,1
Style: Meta,${FONT},30,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2,1,7,56,56,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const ev = [];
  const meta = `{\\an7\\pos(56,40)}{\\fs32}${esc(title)}\\N{\\fs22\\b0\\alpha&H60&}${esc(`${ARTIST}${release ? ' · ' + release : ''}`)}`;
  ev.push(`Dialogue: 0,${assTime(0)},${assTime(duration)},Meta,,0,0,0,,${meta}`);

  lines.forEach((l, i) => {
    const start = l.time;
    if (start >= duration) return;
    const next = lines[i + 1];
    let end = next ? next.time : start + 8;
    end = Math.min(end, start + 10, duration); // do not let one line linger through long gaps
    if (end <= start) return;
    const at = `${assTime(start)},${assTime(end)}`;
    const curY = l.sub ? 325 : H / 2;
    ev.push(`Dialogue: 1,${at},Cur,,0,0,0,,{\\an5\\pos(${W / 2},${curY})\\fad(180,180)}${esc(l.line)}`);
    if (l.sub) ev.push(`Dialogue: 1,${at},Sub,,0,0,0,,{\\an5\\pos(${W / 2},400)\\fad(180,180)}${esc(l.sub)}`);
    if (i > 0) ev.push(`Dialogue: 0,${at},Side,,0,0,0,,{\\an5\\pos(${W / 2},235)}${esc(lines[i - 1].line)}`);
    if (next) ev.push(`Dialogue: 0,${at},Side,,0,0,0,,{\\an5\\pos(${W / 2},485)}${esc(next.line)}`);
  });
  return head + ev.join('\n') + '\n';
}

/* ---------- ffmpeg ---------- */

export function probeDuration(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim();
  const d = parseFloat(out);
  if (!Number.isFinite(d) || d <= 0) throw new Error('could not read audio duration');
  return d;
}

export function renderVideo({ audio, art, ass, out, duration }) {
  const bgInput = art
    ? ['-loop', '1', '-framerate', String(FPS), '-i', art]
    : ['-f', 'lavfi', '-i', `color=c=0x0d0d14:s=${W}x${H}:r=${FPS}`];
  const assArg = ass.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  const filter = [
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=40,eq=brightness=-0.4:saturation=1.1[bg]`,
    `[1:a]showwaves=s=${W}x140:mode=cline:rate=${FPS}:colors=white@0.55:scale=sqrt[wv]`,
    `[bg][wv]overlay=0:H-h-30:format=auto[v1]`,
    `[v1]subtitles='${assArg}'[v]`,
  ].join(';');
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    ...bgInput, '-i', audio,
    '-filter_complex', filter,
    '-map', '[v]', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-maxrate', '400k', '-bufsize', '800k', '-r', String(FPS), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k',
    '-t', duration.toFixed(2),
    '-movflags', '+faststart',
    out,
  ];
  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error('ffmpeg failed');
}

export function extractPoster(video, out, at) {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', at.toFixed(2), '-i', video, '-frames:v', '1', '-q:v', '3', out], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('poster extraction failed');
}

/* ---------- timing ---------- */

function syncedLines(raw) {
  if (!Array.isArray(raw)) return null;
  const lines = raw
    .filter((x) => x && typeof x.line === 'string' && x.line.trim() && Number.isFinite(Number(x.time)))
    .map((x) => ({ line: x.line.trim(), time: Number(x.time), sub: x.sub, conf: x.conf }))
    .sort((a, b) => a.time - b.time);
  return lines.length >= 3 ? lines : null;
}

const norm = (str) => String(str).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

/**
 * Timestamps from tracks.lyrics_synced, but only when they can be trusted: every line has a
 * real time (-1 means "never synced"), and they still match the current lyrics. Otherwise null,
 * and the lyrics are aligned to the audio instead.
 */
export function usableSynced(raw, entries) {
  if (!Array.isArray(raw) || !raw.length) return null;
  if (raw.some((x) => !x || !Number.isFinite(Number(x.time)) || Number(x.time) < 0)) return null;
  const lines = raw
    .filter((x) => typeof x.line === 'string' && x.line.trim() && !isNonLyric(x.line.trim()))
    .map((x) => ({ line: x.line.trim(), time: Number(x.time), sub: x.sub, conf: x.conf }))
    .sort((a, b) => a.time - b.time);
  if (lines.length < 3) return null;
  const have = new Set(lines.map((l) => norm(l.line)));
  const hits = entries.filter((e) => have.has(norm(e.line))).length;
  if (entries.length && hits / entries.length < 0.9) return null; // lyrics were edited after syncing
  return lines;
}

let alignerReady = false;
let alignerError = null;
function ensureAligner() {
  if (alignerReady) return;
  if (alignerError) throw alignerError; // do not retry the install for every song
  try {
    const importable = () => spawnSync('python3', ['-c', 'import stable_whisper'], { stdio: 'ignore' }).status === 0;
    if (!importable()) {
      console.log('Installing the lyric aligner (CPU PyTorch + stable-ts)...');
      // torch and torchaudio must come from the same CPU index, otherwise pip fetches a CUDA torchaudio that cannot load.
      execFileSync('python3', ['-m', 'pip', 'install', '--quiet', 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cpu'], { stdio: 'inherit' });
      execFileSync('python3', ['-m', 'pip', 'install', '--quiet', 'stable-ts'], { stdio: 'inherit' });
      execFileSync('python3', ['-c', 'import stable_whisper'], { stdio: 'inherit' });
    }
    alignerReady = true;
  } catch (e) {
    alignerError = new Error(`the lyric aligner could not be installed: ${e.message}`);
    throw alignerError;
  }
}

function alignLyrics(audio, entries, dir) {
  ensureAligner();
  const txt = join(dir, 'lyrics.txt');
  const json = join(dir, 'aligned.json');
  writeFileSync(txt, entries.map((e) => e.line).join('\n'));
  execFileSync('python3', [join(HERE, 'align.py'), audio, txt, json], { stdio: 'inherit' });
  const aligned = JSON.parse(readFileSync(json, 'utf8'));
  return aligned.map((a, i) => ({ ...a, sub: entries[i]?.sub }));
}

/** Prints how well the aligned lyrics match the audio. Returns the average match (0-1) or null. */
function reportConfidence(title, timed) {
  const scored = timed.filter((x) => typeof x.conf === 'number');
  if (!scored.length) return null;
  const avg = scored.reduce((sum, x) => sum + x.conf, 0) / scored.length;
  const bad = scored.filter((x) => x.conf < LOW_CONF);
  console.log(`LYRICS CHECK ${title}: average match ${(avg * 100).toFixed(0)}%, ${bad.length}/${scored.length} doubtful lines`);
  bad.slice(0, 12).forEach((x) => console.log(`   ? ${x.time.toFixed(1)}s  ${x.line}  (${(x.conf * 100).toFixed(0)}%)`));
  return avg;
}

/* ---------- supabase ---------- */

const CHECK = process.env.CHECK === '1' || process.env.CHECK === 'true';
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sbHeaders = (extra = {}) => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, ...extra });

async function rest(path, init = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: sbHeaders({ 'Content-Type': 'application/json', ...(init.headers || {}) }) });
  if (!r.ok) throw new Error(`REST ${path.split('?')[0]} ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

async function upload(path, buf, type) {
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': type, 'x-upsert': 'true', 'cache-control': 'max-age=3600' }),
    body: buf,
  });
  if (!r.ok) throw new Error(`upload ${path} ${r.status}: ${await r.text()}`);
  return `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}: ${url}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

/* ---------- main ---------- */

async function buildOne(track, release, index, existing) {
  const dir = mkdtempSync(join(tmpdir(), 'lyricvid-'));
  try {
    const entries = parseLyrics(track.lyrics);
    const audio = join(dir, 'audio' + (track.audio_url.match(/\.(mp3|wav|m4a|flac|ogg)(\?|$)/i)?.[0].replace(/\?$/, '') || '.mp3'));
    await download(track.audio_url, audio);
    const duration = probeDuration(audio);

    let timed = usableSynced(track.lyrics_synced, entries);
    let timing = 'synced';
    let match = null;
    if (!timed) {
      timing = 'aligned';
      const aligned = alignLyrics(audio, entries, dir);
      match = reportConfidence(track.title, aligned);
      timed = syncedLines(aligned);
      if (!timed) throw new Error('alignment produced no usable timings');
    }
    if (CHECK) return { timing: 'checked', seconds: Math.round(duration), match };

    let art = null;
    if (release?.artwork_url && /^https?:\/\//.test(release.artwork_url)) {
      try { art = join(dir, 'art.jpg'); await download(release.artwork_url, art); } catch { art = null; }
    }

    const ass = join(dir, 'lyrics.ass');
    writeFileSync(ass, buildAss({ title: track.title, release: release?.title, lines: timed, duration }));
    const out = join(dir, 'out.mp4');
    renderVideo({ audio, art, ass, out, duration });
    const poster = join(dir, 'poster.jpg');
    extractPoster(out, poster, Math.min(duration * 0.2, 25));

    const stamp = Date.parse(track.updated_at) || Date.now();
    const videoUrl = (await upload(`${FOLDER}/${track.id}.mp4`, readFileSync(out), 'video/mp4')) + `?v=${stamp}`;
    const posterUrl = (await upload(`${FOLDER}/${track.id}.jpg`, readFileSync(poster), 'image/jpeg')) + `?v=${stamp}`;

    const row = {
      track_id: track.id,
      title: `${track.title} (Lyric Video)`,
      description: `Lyric video for "${track.title}"${release?.title ? ` from ${release.title}` : ''}.`,
      category: 'lyric',
      url: videoUrl,
      thumbnail_url: posterUrl,
      related_release_id: track.release_id,
      source_updated_at: track.updated_at,
      is_published: true,
      sort_order: 100 + index,
      updated_at: new Date().toISOString(),
    };
    if (!existing) row.published_at = new Date().toISOString().slice(0, 10);
    await rest('videos?on_conflict=track_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
    return { timing, seconds: Math.round(duration), match };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  if (!SB_URL || !SB_KEY) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  const only = new Set((process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean));
  const force = process.env.FORCE === '1' || process.env.FORCE === 'true';
  const dry = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

  const [tracks, releases, videos] = await Promise.all([
    rest('tracks?select=id,title,track_number,audio_url,lyrics,lyrics_synced,status,updated_at,release_id&status=eq.RELEASED&order=track_number'),
    rest('releases?select=id,title,artwork_url,sort_order&order=sort_order'),
    rest('videos?select=id,track_id,source_updated_at&track_id=not.is.null'),
  ]);
  const relById = new Map(releases.map((r) => [r.id, r]));
  const vidByTrack = new Map(videos.map((v) => [v.track_id, v]));
  const ordered = [...tracks].sort((a, b) => ((relById.get(a.release_id)?.sort_order ?? 999) - (relById.get(b.release_id)?.sort_order ?? 999)) || (a.track_number - b.track_number));

  const summary = { built: [], skipped: [], failed: [] };
  for (const [i, t] of ordered.entries()) {
    const name = t.title;
    if (only.size && !only.has(t.id)) continue;
    if (SKIP_TRACK_IDS.has(t.id) && !only.has(t.id)) { summary.skipped.push(`${name}: already has an official lyric video`); continue; }
    if (!t.audio_url) { summary.skipped.push(`${name}: no audio file`); continue; }
    if (parseLyrics(t.lyrics).length < MIN_LYRIC_LINES) { summary.skipped.push(`${name}: no lyrics yet`); continue; }
    if (CHECK && usableSynced(t.lyrics_synced, parseLyrics(t.lyrics))) { summary.skipped.push(`${name}: has timestamps (trusted, not checked)`); continue; }
    const ex = vidByTrack.get(t.id);
    if (!CHECK && !force && ex && ex.source_updated_at && Date.parse(ex.source_updated_at) >= Date.parse(t.updated_at)) { summary.skipped.push(`${name}: up to date`); continue; }
    if (dry) { summary.built.push(`${name}: would render (${usableSynced(t.lyrics_synced, parseLyrics(t.lyrics)) ? 'synced' : 'needs alignment'})`); continue; }
    console.log(`\n=== ${name} ===`);
    try {
      const r = await buildOne(t, relById.get(t.release_id), i, ex);
      summary.built.push(`${name}: ${r.seconds}s, ${r.timing} timing${r.match != null ? `, lyrics match ${(r.match * 100).toFixed(0)}%` : ''}`);
    } catch (e) {
      console.error(`FAILED ${name}: ${e.message}`);
      summary.failed.push(`${name}: ${e.message}`);
    }
  }
  console.log('\n--- summary ---');
  for (const k of ['built', 'skipped', 'failed']) { console.log(`${k} (${summary[k].length})`); summary[k].forEach((s) => console.log('  ' + s)); }
  if (summary.failed.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
