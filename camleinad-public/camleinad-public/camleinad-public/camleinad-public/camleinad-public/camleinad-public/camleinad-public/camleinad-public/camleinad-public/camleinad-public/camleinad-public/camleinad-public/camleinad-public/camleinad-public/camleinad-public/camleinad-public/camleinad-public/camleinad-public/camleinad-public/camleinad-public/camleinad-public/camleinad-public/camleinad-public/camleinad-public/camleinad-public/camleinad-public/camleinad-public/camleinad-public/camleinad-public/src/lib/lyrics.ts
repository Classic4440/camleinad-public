export interface SyncedLine {
  time: number;
  line: string;
}

/**
 * Parse lyrics that contain [mm:ss], [mm:ss.xx], or [hh:mm:ss] timestamps at line start.
 * Returns null if no line has a valid timestamp.
 */
export function parseTimedLyrics(input: string): SyncedLine[] | null {
  if (!input) return null;
  const lines = input.split(/\r?\n/);
  const out: SyncedLine[] = [];
  let matched = 0;
  const re = /^\[(?:(\d+):)?(\d+):(\d+)(?:\.(\d+))?\]\s*(.*)$/;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const m = raw.match(re);
    if (m) {
      const h = m[1] ? parseInt(m[1], 10) : 0;
      const mm = parseInt(m[2], 10);
      const ss = parseInt(m[3], 10);
      const frac = m[4] ? parseFloat(`0.${m[4]}`) : 0;
      const time = h * 3600 + mm * 60 + ss + frac;
      const line = m[5].trim();
      if (!line) continue;
      out.push({ time, line });
      matched++;
    } else if (!/^\[[a-z]{2,}:[^\]]*\]$/i.test(raw.trim())) {
      out.push({ time: -1, line: raw.trim() });
    }
  }
  return matched > 0 ? out : null;
}

/**
 * Distribute plain lyrics evenly across durationSeconds.
 */
export function distributeLyrics(plain: string, durationSeconds: number): SyncedLine[] {
  const lines = plain.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0 || durationSeconds <= 0) return [];
  const step = durationSeconds / lines.length;
  return lines.map((line, index) => ({ time: Math.round(index * step * 100) / 100, line }));
}

/**
 * Serialize a SyncedLine[] back to plain text for display fallback.
 */
export function syncedToPlain(synced: SyncedLine[] | null | undefined): string {
  if (!synced) return '';
  return synced.map(line => line.line).join('\n');
}

/**
 * Normalize plain lyrics input: trim, drop trailing blank lines.
 */
export function normalizePlainLyrics(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\s+$/g, '').trim();
}