interface Env {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Parse JSON body
  let body: { path?: string; fileBase64?: string; contentType?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { path, fileBase64, contentType } = body;
  if (!path || !fileBase64) {
    return new Response(JSON.stringify({ error: 'Missing path or fileBase64' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Auth: verify JWT
  const authHeader = request.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Missing token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { createClient } = await import('@supabase/supabase-js');

  // Anon client to check user identity
  const anonClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  const { data: userData, error: userErr } = await anonClient.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Use service role for the role lookup because anon cannot read profiles.role.
  const adminClient = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: profile, error: profileErr } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();
  if (profileErr || profile?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Not authorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Decode base64 to Uint8Array
  const binaryString = atob(fileBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const { error: uploadErr } = await adminClient.storage
    .from('teaser-audio')
    .upload(path, bytes, {
      contentType: contentType || 'audio/mpeg',
      upsert: true,
    });

  if (uploadErr) {
    return new Response(JSON.stringify({ error: uploadErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: { publicUrl } } = adminClient.storage
    .from('teaser-audio')
    .getPublicUrl(path);

  return new Response(JSON.stringify({ publicUrl }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
