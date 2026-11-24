import { createAdminSupabaseClient, jsonResponse, SupabaseConfigError, type SupabaseEnv } from './_supabase';

export interface Env extends SupabaseEnv {}
interface PagesFunctionContext<E = Record<string, unknown>> { request: Request; env: E; }

const TEASER_BUCKET = 'teaser-audio';
const ALLOWED_AUDIO_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/flac']);

function sanitizeAudioFilename(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 140);
}
function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function verifyAdminCaller(request: Request, supabase: ReturnType<typeof createAdminSupabaseClient>): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Missing or invalid Authorization bearer token' };
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return { ok: false, status: 401, error: 'Empty bearer token' };

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return { ok: false, status: 401, error: 'Invalid or expired authentication session' };

  const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
  if (profileError) return { ok: false, status: 500, error: `Failed to verify caller role: ${profileError.message}` };
  if (profile?.role !== 'admin') return { ok: false, status: 403, error: 'Admin privileges required for teaser uploads' };

  return { ok: true, userId: userData.user.id };
}

export const onRequestPost = async (context: PagesFunctionContext<Env>): Promise<Response> => {
  let supabase: ReturnType<typeof createAdminSupabaseClient>;
  try { supabase = createAdminSupabaseClient(context.env); } catch (err) {
    if (err instanceof SupabaseConfigError) return jsonResponse({ error: err.message }, err.status);
    return jsonResponse({ error: 'Unexpected Supabase initialization error' }, 500);
  }

  const auth = await verifyAdminCaller(context.request, supabase);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

  let formData: FormData;
  try { formData = await context.request.formData(); } catch { return jsonResponse({ error: 'Request body must be multipart/form-data' }, 400); }

  const rawFile = formData.get('file') ?? formData.get('teaser');
  if (!(rawFile instanceof File)) return jsonResponse({ error: 'Missing required "file" (or "teaser") audio file in form data' }, 400);
  if (rawFile.size === 0) return jsonResponse({ error: 'Teaser audio file is empty' }, 400);

  const contentType = rawFile.type || 'audio/mpeg';
  if (!ALLOWED_AUDIO_MIME_TYPES.has(contentType) && !contentType.startsWith('audio/')) return jsonResponse({ error: `Unsupported teaser audio MIME type: ${contentType}` }, 400);

  const trackId = typeof formData.get('trackId') === 'string' ? formData.get('trackId')!.trim() : '';
  const safeName = sanitizeAudioFilename(rawFile.name || 'teaser.mp3');
  const storagePath = trackId ? `tracks/${trackId}/${Date.now()}-${safeName}` : `${Date.now()}-${crypto.randomUUID()}-${safeName}`;

  const arrayBuffer = await rawFile.arrayBuffer();
  const { data: uploadData, error: uploadError } = await supabase.storage.from(TEASER_BUCKET).upload(storagePath, arrayBuffer, { contentType, upsert: false });
  if (uploadError || !uploadData) return jsonResponse({ error: `Failed to upload teaser audio: ${uploadError?.message ?? 'Unknown storage error'}` }, 500);

  const { data: publicUrlData } = supabase.storage.from(TEASER_BUCKET).getPublicUrl(uploadData.path);
  const teaserAudioUrl = publicUrlData.publicUrl;

  if (trackId) {
    const startSec = parseOptionalInt(formData.get('teaserStartSeconds'));
    const endSec = parseOptionalInt(formData.get('teaserEndSeconds'));
    const label = typeof formData.get('teaserLabel') === 'string' && formData.get('teaserLabel')!.trim() ? formData.get('teaserLabel')!.trim() : null;

    const updatePayload: Record<string, unknown> = { teaser_audio_url: teaserAudioUrl, teaser_enabled: true, updated_at: new Date().toISOString() };
    if (startSec !== null) updatePayload.teaser_start_seconds = startSec;
    if (endSec !== null) updatePayload.teaser_end_seconds = endSec;
    if (label !== null) updatePayload.teaser_label = label;

    const { error: trackUpdateError } = await supabase.from('tracks').update(updatePayload).eq('id', trackId);
    if (trackUpdateError) return jsonResponse({ error: `Teaser uploaded, but failed to update track metadata: ${trackUpdateError.message}`, bucket: TEASER_BUCKET, path: uploadData.path, url: teaserAudioUrl }, 500);
  }

  return jsonResponse({ bucket: TEASER_BUCKET, path: uploadData.path, url: teaserAudioUrl, trackId: trackId || null, uploadedBy: auth.userId }, 201);
};
