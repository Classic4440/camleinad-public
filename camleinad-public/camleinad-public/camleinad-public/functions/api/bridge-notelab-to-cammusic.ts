import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  NOTELAB_SUPABASE_URL?: string;
  NOTELAB_SUPABASE_SERVICE_ROLE_KEY?: string;
}

export function createCamMusicAdminClient(env: Env): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Cam Music SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createNoteLabAdminClient(env: Env): SupabaseClient {
  if (!env.NOTELAB_SUPABASE_URL || !env.NOTELAB_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing NOTELAB_SUPABASE_URL or NOTELAB_SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(env.NOTELAB_SUPABASE_URL, env.NOTELAB_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface NoteLabBeatRecord {
  id: string;
  user_id?: string | null;
  beat_name?: string | null;
  notes_data?: unknown;
  bpm?: number | null;
  created_at?: string | null;
}

interface BridgeRequestBody {
  beatId?: string;
  beat_id?: string;
  releaseId?: string | null;
  release_id?: string | null;
  trackNumber?: number;
  track_number?: number;
}

const CORS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

function slugifyTitle(title: string, id: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'notelab-beat'}-${id.slice(0, 8)}`;
}

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const noteLabClient = createNoteLabAdminClient(env);
    const { data, error } = await noteLabClient
      .from('notelab_user_beats')
      .select('id, beat_name, notes_data, bpm, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return jsonResponse({ error: `Failed to fetch NoteLab beats: ${error.message}` }, 502);
    }

    return jsonResponse({ beats: (data ?? []) as NoteLabBeatRecord[] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected NoteLab bridge error';
    return jsonResponse({ error: message }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = (await request.json().catch(() => null)) as BridgeRequestBody | null;
    const beatId = (body?.beatId ?? body?.beat_id ?? '').trim();

    if (!beatId) {
      return jsonResponse({ error: 'beatId is required' }, 400);
    }

    const noteLabClient = createNoteLabAdminClient(env);
    const camMusicClient = createCamMusicAdminClient(env);

    const { data: beat, error: beatError } = await noteLabClient
      .from('notelab_user_beats')
      .select('id, user_id, beat_name, notes_data, bpm, created_at')
      .eq('id', beatId)
      .single();

    if (beatError || !beat) {
      return jsonResponse(
        { error: beatError ? `NoteLab beat lookup failed: ${beatError.message}` : 'NoteLab beat not found' },
        404,
      );
    }

    const record = beat as NoteLabBeatRecord;
    const title = (record.beat_name && record.beat_name.trim()) || `NoteLab Beat ${record.id.slice(0, 8)}`;
    const slug = slugifyTitle(title, record.id);
    const releaseId = body?.releaseId ?? body?.release_id ?? null;
    const trackNumber = Number.isFinite(Number(body?.trackNumber ?? body?.track_number))
      ? Math.max(1, Math.round(Number(body?.trackNumber ?? body?.track_number)))
      : 1;

    const midiPayload = record.notes_data ?? null;
    const stemsPayload =
      midiPayload && typeof midiPayload === 'object' && !Array.isArray(midiPayload)
        ? ((midiPayload as Record<string, unknown>).stems ?? midiPayload)
        : midiPayload;

    const trackInsertPayload: Record<string, unknown> = {
      title,
      slug,
      release_id: releaseId,
      track_number: trackNumber,
      bpm: record.bpm ?? null,
      midi_data: midiPayload,
      stems_data: stemsPayload,
      source_beat_id: record.id,
      source_platform: 'notelab',
    };

    const { data: insertedTrack, error: insertError } = await camMusicClient
      .from('tracks')
      .insert(trackInsertPayload)
      .select('*')
      .single();

    if (insertError) {
      return jsonResponse(
        { error: `Failed to insert track into Cam Music tracks table: ${insertError.message}` },
        502,
      );
    }

    return jsonResponse(
      {
        track: insertedTrack,
        sourceBeat: {
          id: record.id,
          beat_name: title,
          bpm: record.bpm ?? null,
        },
      },
      201,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected bridge error';
    return jsonResponse({ error: message }, 500);
  }
};
