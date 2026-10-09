import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import FetchError from '@/components/ui/FetchError';
import Avatar from '@/components/ui/Avatar';
import type { BookingRequest, Message } from '@/types';

export default function MessagesAdmin() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [tab, setTab] = useState<'messages' | 'bookings'>('messages');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(false);
    const [messagesResult, bookingsResult] = await Promise.all([
      supabase.from('messages').select('*').order('created_at', { ascending: false }),
      supabase.from('booking_requests').select('*').order('created_at', { ascending: false }),
    ]);
    if (messagesResult.error || bookingsResult.error) setLoadError(true);
    else {
      setMessages(messagesResult.data || []);
      setBookings(bookingsResult.data || []);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function updateStatus(table: string, id: string, status: string) {
    const { error } = await supabase.from(table).update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error('Could not update this message. Try again.'); return; }
    toast.success('Status updated');
    load();
  }

  const STATUS_OPTIONS = ['NEW', 'READ', 'IN_PROGRESS', 'RESPONDED', 'CLOSED'];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Messages</h1>
        <p className="text-[#72727E] text-sm mt-1">Contact forms and booking requests</p>
      </div>

      <div className="flex gap-2 mb-6">
        {(['messages', 'bookings'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-violet-500/20 text-white border border-violet-500/30' : 'text-[#72727E] hover:text-white'}`}>
            {t === 'messages' ? `Messages (${messages.length})` : `Bookings (${bookings.length})`}
          </button>
        ))}
      </div>

      {loading ? <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl skeleton" />)}</div> : loadError ? (
        <FetchError message="Couldn’t load messages. Try again." onRetry={() => void load()} />
      ) : (
        <div className="glass rounded-2xl border border-white/8 overflow-hidden">
          {(tab === 'messages' ? messages : bookings).map((item, i) => (
            <div key={item.id} className={`px-5 py-4 ${i > 0 ? 'border-t border-white/5' : ''}`}>
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar src={null} name={item.name || item.email || '?'} size={32} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{item.name || item.email || '?'}</p>
                    <p className="text-xs text-[#72727E]">{item.email} {item.phone && `· ${item.phone}`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <select value={item.status} onChange={e => updateStatus(tab === 'messages' ? 'messages' : 'booking_requests', item.id, e.target.value)}
                    className="text-xs bg-[#14141D] border border-white/10 rounded-lg px-2 py-1 text-[#A8A8B3]">
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                  <span className="text-xs text-[#72727E]">{formatDate(item.created_at)}</span>
                </div>
              </div>
              {tab === 'messages' ? (
                <>
                  {item.subject && <p className="text-xs font-medium text-[#A8A8B3] mb-1">{item.subject}</p>}
                  <p className="text-sm text-[#72727E] line-clamp-2">{item.message}</p>
                </>
              ) : (
                <div className="text-xs text-[#72727E] space-y-0.5">
                  {item.event_name && <p>Event: {item.event_name}</p>}
                  {item.event_date && <p>Date: {item.event_date}</p>}
                  {item.location && <p>Location: {item.location}</p>}
                  {item.budget && <p>Budget: {item.budget}</p>}
                  <p className="text-[#A8A8B3] mt-1">{item.message}</p>
                </div>
              )}
            </div>
          ))}
          {(tab === 'messages' ? messages : bookings).length === 0 && (
            <div className="p-8 text-center text-[#72727E] text-sm">No {tab} yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
