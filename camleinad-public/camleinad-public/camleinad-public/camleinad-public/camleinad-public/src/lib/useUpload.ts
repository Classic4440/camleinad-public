import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface UploadOptions {
  bucket: 'audio-files' | 'teaser-audio' | 'album-art' | 'gallery' | 'avatars' | 'video-files';
  path: string;
  file: File | Blob;
  contentType: string;
  onProgress?: (percent: number, loadedBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

export interface UploadResult {
  publicUrl: string;
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

export function useUpload() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'preparing' | 'uploading' | 'finalizing' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function upload(opts: UploadOptions): Promise<UploadResult> {
    const { bucket, path, file, contentType, onProgress, signal } = opts;

    setProgress(0);
    setStatus('preparing');
    setError(null);

    try {
      const fileDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Could not read file for upload'));
        reader.onprogress = (event) => {
          if (event.lengthComputable) {
            const pct = Math.min(15, (event.loaded / event.total) * 15);
            setProgress(pct);
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

      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('Not authenticated');

      return await new Promise<UploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload-file');
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) {
            setStatus('uploading');
            return;
          }
          const percent = 15 + (event.loaded / event.total) * 75;
          setProgress(percent);
          setStatus('uploading');
          onProgress?.(percent, event.loaded, event.total);
        };

        xhr.upload.onload = () => {
          setStatus('finalizing');
          setProgress(95);
        };

        xhr.onreadystatechange = () => {
          if (xhr.readyState !== XMLHttpRequest.DONE) return;
        };

        xhr.onload = () => {
          try {
            const response = JSON.parse(xhr.responseText || '{}') as { publicUrl?: string; error?: string };
            if (xhr.status >= 400 || !response.publicUrl) {
              const message = response.error || `Upload failed (${xhr.status})`;
              setStatus('error');
              setError(message);
              onProgress?.(0, 0, 0);
              reject(new Error(message));
              return;
            }
            setStatus('done');
            setProgress(100);
            resolve({ publicUrl: response.publicUrl });
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Upload failed';
            setStatus('error');
            setError(message);
            reject(err);
          }
        };

        xhr.onerror = () => {
          const message = 'Network error while uploading.';
          setStatus('error');
          setError(message);
          reject(new Error(message));
        };

        xhr.onabort = () => {
          const message = 'Upload aborted.';
          setStatus('error');
          setError(message);
          reject(new DOMException(message, 'AbortError'));
        };

        signal?.addEventListener('abort', () => xhr.abort(), { once: true });

        xhr.send(JSON.stringify({ bucket, path, fileBase64: fileDataUrl.split(',')[1], contentType }));
      });
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
