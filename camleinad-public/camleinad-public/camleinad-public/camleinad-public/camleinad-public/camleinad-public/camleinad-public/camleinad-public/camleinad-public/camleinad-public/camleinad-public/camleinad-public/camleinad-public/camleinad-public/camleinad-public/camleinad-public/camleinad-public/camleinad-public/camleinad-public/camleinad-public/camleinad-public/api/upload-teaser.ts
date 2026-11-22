import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing required Supabase environment variables');
}

interface UploadTeaserBody {
  path: string;
  fileBase64: string;
  contentType?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { path, fileBase64, contentType = 'audio/mpeg' } = req.body as UploadTeaserBody;

    if (!path || !fileBase64) {
      return res.status(400).json({ error: 'Missing path or fileBase64' });
    }

    // Extract and verify JWT from Authorization header
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json({ error: 'No authorization token' });
    }

    // Create anon client to verify the user
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);

    if (userError || !userData.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify user is admin
    const { data: profile, error: profileError } = await anonClient
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (profileError || !profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: admin access required' });
    }

    // Use service role to upload
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Decode base64 to Buffer
    const buffer = Buffer.from(fileBase64, 'base64');

    // Upload to teaser-audio bucket
    const { error: uploadError, data } = await serviceClient.storage
      .from('teaser-audio')
      .upload(path, buffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return res.status(500).json({ error: uploadError.message });
    }

    // Get public URL
    const { data: urlData } = serviceClient.storage.from('teaser-audio').getPublicUrl(path);

    return res.status(200).json({ publicUrl: urlData.publicUrl });
  } catch (error) {
    console.error('Teaser upload error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
