import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface AvatarProps {
    src?: string | null;
    name?: string | null;
    size?: number;
    className?: string;
}

function resolveAvatarSource(source: string) {
    const value = source.trim();
    if (/^https?:\/\//i.test(value)) {
        try {
            const url = new URL(value);
            const publicObject = url.pathname.match(/\/storage\/v1\/object\/public\/avatars\/(.+)$/);
            if (publicObject) {
                return supabase.storage.from('avatars').getPublicUrl(decodeURIComponent(publicObject[1])).data.publicUrl;
            }
        } catch {
            return value;
        }
        return value;
    }
    return supabase.storage.from('avatars').getPublicUrl(value.replace(/^avatars\//, '')).data.publicUrl;
}

export default function Avatar({ src, name, size = 40, className }: AvatarProps) {
    const [failedSource, setFailedSource] = useState<string | null>(null);
    const source = src?.trim() || '';
    const imageUrl = source ? resolveAvatarSource(source) : '';
    const initial = name?.trim().charAt(0).toLocaleUpperCase() || '?';

    return source && failedSource !== source ? (
        <img
            src={imageUrl}
            alt={name ? `${name} avatar` : 'User avatar'}
            width={size}
            height={size}
            loading="lazy"
            onError={() => setFailedSource(source)}
            className={cn('aspect-square shrink-0 rounded-full object-cover', className)}
            style={{ width: size, height: size }}
        />
    ) : (
        <span
            aria-label={name ? `${name} avatar` : 'User avatar'}
            role="img"
            className={cn('inline-flex aspect-square shrink-0 items-center justify-center rounded-full bg-[var(--accent)] font-display font-semibold text-[var(--base)]', className)}
            style={{ width: size, height: size, fontSize: Math.max(12, size * 0.42) }}
        >
            {initial}
        </span>
    );
}