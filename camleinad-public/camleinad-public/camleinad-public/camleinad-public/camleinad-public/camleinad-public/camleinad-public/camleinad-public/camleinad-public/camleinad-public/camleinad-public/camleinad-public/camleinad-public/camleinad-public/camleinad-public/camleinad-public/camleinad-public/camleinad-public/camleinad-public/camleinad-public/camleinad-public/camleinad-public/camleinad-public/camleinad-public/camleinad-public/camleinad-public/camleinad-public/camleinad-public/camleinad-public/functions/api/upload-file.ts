interface Env {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const ALLOWED_BUCKETS = new Set(['audio-files', 'teaser-audio', 'album-art', 'gallery', 'avatars', 'video-files']);

function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/\s/g, '');
  const chunkSize = 0x8000;
  const out: number[] = [];

  for (let i = 0; i < normalized.length; i += chunkSize) {
    const chunk = normalized.slice(i, i + chunkSize);
    const binary = atob(chunk);
    for (let j = 0; j < binary.length; j += 1) {
      out.push(binary.charCodeAt(j));
    }
  }

  return new Uint8Array(out);
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const body = await request.json() as { bucket?: string; path?: string; fileBase64?: string; contentType?: string };
    const { bucket, path, fileBase64, contentType } = body;

    if (!bucket || !path || !fileBase64) {
      return Response.json({ error: 'Missing bucket, path, or fileBase64' }, { status: 400 });
    }

    if (!ALLOWED_BUCKETS.has(bucket)) {
      return Response.json({ error: 'Invalid bucket' }, { status: 400 });
    }

    const authHeader = request.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return Response.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const anonClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
    const { data: userData, error: userError } = await anonClient.auth.getUser(jwt);

    if (userError || !userData?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profileData, error: profileError } = await anonClient
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    const isOwnAvatarUpload = bucket === 'avatars' && path.startsWith(`${userData.user.id}/`);
    if ((profileError || profileData?.role !== 'admin') && !isOwnAvatarUpload) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const bytes = base64ToBytes(fileBase64);
    if (bytes.length > 25 * 1024 * 1024) {
      return Response.json({ error: 'File too large. Max 25 MB.' }, { status: 413 });
    }

    const adminClient = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const { error: uploadError } = await adminClient.storage
      .from(bucket)
      .upload(path, bytes, {
        contentType: contentType || 'application/octet-stream',
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      return Response.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = adminClient.storage.from(bucket).getPublicUrl(path);
    return Response.json({ publicUrl }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected upload error';
    return Response.json({ error: message }, { status: 500 });
  }
};
