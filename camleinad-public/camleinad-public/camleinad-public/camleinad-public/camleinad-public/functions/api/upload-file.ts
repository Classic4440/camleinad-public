import { createAdminSupabaseClient, jsonResponse, SupabaseConfigError, type SupabaseEnv } from './_supabase';

export interface Env extends SupabaseEnv {}
interface PagesFunctionContext<E = Record<string, unknown>> { request: Request; env: E; }

const ALLOWED_BUCKETS = new Set(['album-art', 'audio-files', 'avatars', 'documents', 'gallery', 'producer-files', 'stems', 'video-files']);
const PRIVATE_BUCKETS = new Set(['documents', 'stems']);

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 140);
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
  if (profile?.role !== 'admin') return { ok: false, status: 403, error: 'Admin privileges required for file uploads' };

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

  const rawFile = formData.get('file');
  if (!(rawFile instanceof File)) return jsonResponse({ error: 'Missing required "file" field in form data' }, 400);
  if (rawFile.size === 0) return jsonResponse({ error: 'Uploaded file is empty' }, 400);

  const requestedBucket = String(formData.get('bucket') ?? 'audio-files').trim();
  if (!ALLOWED_BUCKETS.has(requestedBucket)) return jsonResponse({ error: `Unsupported storage bucket "${requestedBucket}"`, allowedBuckets: Array.from(ALLOWED_BUCKETS) }, 400);

  const folder = String(formData.get('folder') ?? '').trim().replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9/_-]/g, '');
  const safeName = sanitizeFileName(rawFile.name || 'upload.bin');
  const objectPath = folder ? `${folder}/${Date.now()}-${crypto.randomUUID()}-${safeName}` : `${Date.now()}-${crypto.randomUUID()}-${safeName}`;

  const arrayBuffer = await rawFile.arrayBuffer();
  const contentType = rawFile.type || 'application/octet-stream';

  const { data: uploadData, error: uploadError } = await supabase.storage.from(requestedBucket).upload(objectPath, arrayBuffer, { contentType, upsert: false });
  if (uploadError || !uploadData) return jsonResponse({ error: `Storage upload failed: ${uploadError?.message ?? 'Unknown storage error'}` }, 500);

  let fileUrl: string | null = null;
  if (PRIVATE_BUCKETS.has(requestedBucket)) {
    const { data: signedData, error: signedError } = await supabase.storage.from(requestedBucket).createSignedUrl(uploadData.path, 60 * 60);
    if (signedError) return jsonResponse({ error: `Uploaded object but failed to sign private URL: ${signedError.message}` }, 500);
    fileUrl = signedData?.signedUrl ?? null;
  } else {
    const { data: publicUrlData } = supabase.storage.from(requestedBucket).getPublicUrl(uploadData.path);
    fileUrl = publicUrlData.publicUrl;
  }

  return jsonResponse({ bucket: requestedBucket, path: uploadData.path, url: fileUrl, mimeType: contentType, sizeBytes: rawFile.size, uploadedBy: auth.userId }, 201);
};
