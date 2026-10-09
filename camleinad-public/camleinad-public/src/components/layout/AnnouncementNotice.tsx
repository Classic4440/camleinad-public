import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ActiveAnnouncement {
    text: string;
    target: string;
    storageKey: string;
}

const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function internalTarget(target: string) {
    return target.startsWith('/') && !target.startsWith('//');
}

export default function AnnouncementNotice() {
    const [announcement, setAnnouncement] = useState<ActiveAnnouncement | null>(null);

    useEffect(() => {
        let active = true;
        let timer: number | undefined;

        async function load() {
            const { data } = await supabase.from('site_settings').select('key,value')
                .in('key', ['announcement_enabled', 'announcement_text', 'announcement_link_target', 'announcement_start_at', 'announcement_end_at']);
            if (!active) return;
            const values: Record<string, string> = {};
            data?.forEach(row => { values[row.key] = row.value || ''; });

            const storageKey = `cam-announcement-dismissed:${encodeURIComponent(`${values.announcement_text}:${values.announcement_link_target}:${values.announcement_start_at}`)}`;
            const updateVisibility = () => {
                const start = Date.parse(values.announcement_start_at || '');
                const end = Date.parse(values.announcement_end_at || '');
                const isWithinWindow = Number.isFinite(start) && Number.isFinite(end) && Date.now() >= start && Date.now() < end;
                let isDismissed = false;
                try {
                    const dismissedUntil = Number(localStorage.getItem(storageKey));
                    isDismissed = Number.isFinite(dismissedUntil) && dismissedUntil > Date.now();
                    if (!isDismissed && dismissedUntil) localStorage.removeItem(storageKey);
                } catch { isDismissed = false; }
                if (values.announcement_enabled === 'true' && values.announcement_text?.trim() && isWithinWindow && !isDismissed) {
                    setAnnouncement({ text: values.announcement_text, target: values.announcement_link_target || '', storageKey });
                } else {
                    setAnnouncement(null);
                }
                document.documentElement.style.setProperty('--announcement-offset', values.announcement_enabled === 'true' && values.announcement_text?.trim() && isWithinWindow && !isDismissed ? '40px' : '0px');
            };

            updateVisibility();
            timer = window.setInterval(updateVisibility, 30_000);
        }

        void load();
        return () => {
            active = false;
            if (timer) window.clearInterval(timer);
            document.documentElement.style.setProperty('--announcement-offset', '0px');
        };
    }, []);

    function dismiss() {
        if (!announcement) return;
        try { localStorage.setItem(announcement.storageKey, String(Date.now() + DISMISS_DURATION_MS)); } catch { /* The bar remains dismissible without storage. */ }
        document.documentElement.style.setProperty('--announcement-offset', '0px');
        setAnnouncement(null);
    }

    if (!announcement) return null;
    const message = <span className="truncate">{announcement.text}</span>;

    return <div role="region" aria-label="Site announcement" className="fixed top-0 inset-x-0 z-[60] h-10 px-3 bg-violet-700 text-white shadow-md">
        <div className="max-w-7xl mx-auto h-full flex items-center justify-center gap-3 text-sm">
            {announcement.target && internalTarget(announcement.target) ? <Link to={announcement.target} className="min-w-0 hover:underline">{message}</Link>
                : announcement.target && /^https:\/\//i.test(announcement.target) ? <a href={announcement.target} target="_blank" rel="noopener noreferrer" className="min-w-0 hover:underline">{message}</a>
                    : <span className="min-w-0">{message}</span>}
            <button type="button" onClick={dismiss} aria-label="Dismiss announcement" className="p-1.5 rounded text-white/80 hover:text-white hover:bg-white/15 shrink-0"><X aria-hidden="true" className="w-4 h-4" /></button>
        </div>
    </div>;
}