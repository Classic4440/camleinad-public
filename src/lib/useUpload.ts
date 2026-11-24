import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface UploadOptions {
  bucket: 'audio-files' | 'teaser-audio' | 'album-art' | 'gallery' | 'avatars' | 'video-files' | 'producer-files';
  path: string;
  file: File | Blob;
  contentType: string;
  onProgress?: (percent: number, loadedBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

export interface UploadResult {
  publicUrl: string;
}

export interface UploadToStorageOptions {
  bucket: UploadOptions['bucket'];
  folder: string;
  maxSizeMB?: number;
  contentType?: string;
  onProgress?: UploadOptions['onProgress'];
  signal?: AbortSignal;
}

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

/** Core upload used by both the hook and the standalone helper. */
async function performUpload(opts: UploadOptions): Promise<UploadResult> {
  const { bucket, path, file, contentType, onProgress, signal } = opts;

  const fileDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file for upload'));
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const pct = Math.min(15, (event.loaded / event.total) * 15);
        onProgress?.(pct, event.loaded, event.total);
      }
    };
    reader.readAsDataURL(file);
  });

  const fileBase64 = fileDataUrl.includes(',') ? fileDataUrl.split(',')[1] : fileDataUrl;
  if (!fileBase64) throw new Error('File is empty');

  const bytes = base64ToBytes(fileBase64);
  if (bytes.length > 25 * 1024 * 1024) {
    throw new Error('File too large. Max 25 MB.');
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error('Not authenticated');

  return await new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload-file');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = 15 + (event.loaded / event.total) * 75;
      onProgress?.(percent, event.loaded, event.total);
    };

    xhr.onload = () => {
      try {
        const response = JSON.parse(xhr.responseText || '{}') as {
          publicUrl?: string;
          error?: string;
        };
        if (xhr.status >= 400 || !response.publicUrl) {
          const message = response.error || `Upload failed (${xhr.status})`;
          onProgress?.(0, 0, 0);
          reject(new Error(message));
          return;
        }
        onProgress?.(100, bytes.length, bytes.length);
        resolve({ publicUrl: response.publicUrl });
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Upload failed'));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading.'));
    };

    xhr.onabort = () => {
      reject(new DOMException('Upload aborted.', 'AbortError'));
    };

    signal?.addEventListener('abort', () => xhr.abort(), { once: true });

    xhr.send(
      JSON.stringify({
        bucket,
        path,
        fileBase64: fileDataUrl.split(',')[1],
        contentType,
      })
    );
  });
}

/**
 * Standalone upload helper used by ProducersCutAdmin and similar call sites
 * that prefer a plain async function over the React hook.
 */
export async function uploadToStorage(
  file: File | Blob,
  options: UploadToStorageOptions
): Promise<UploadResult> {
  const maxMB = options.maxSizeMB ?? 25;
  const maxBytes = maxMB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`File too large. Max ${maxMB} MB.`);
  }

  const originalName = file instanceof File ? file.name : 'file';
  const ext = originalName.includes('.') ? originalName.split('.').pop() || 'bin' : 'bin';
  const folder = options.folder.replace(/\/+$/, '');
  const path = `${folder}/${Date.now()}.${ext}`;

  const contentType =
    options.contentType ||
    (file instanceof File && file.type ? file.type : 'application/octet-stream');

  return performUpload({
    bucket: options.bucket,
    path,
    file,
    contentType,
    onProgress: options.onProgress,
    signal: options.signal,
  });
}

export function useUpload() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<
    'idle' | 'preparing' | 'uploading' | 'finalizing' | 'done' | 'error'
  >('idle');
  const [error, setError] = useState<string | null>(null);

  async function upload(opts: UploadOptions): Promise<UploadResult> {
    setProgress(0);
    setStatus('preparing');
    setError(null);

    try {
      const result = await performUpload({
        ...opts,
        onProgress: (percent, loaded, total) => {
          setProgress(percent);
          if (percent > 0 && percent < 95) setStatus('uploading');
          else if (percent >= 95 && percent < 100) setStatus('finalizing');
          opts.onProgress?.(percent, loaded, total);
        },
      });
      setStatus('done');
      setProgress(100);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setStatus('error');
      setError(message);
      throw err;
    }
  }

  function reset() {
    setProgress(0);
    setStatus('idle');
    setError(null);
  }

  return { upload, progress, status, error, reset };
}
