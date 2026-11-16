import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PageTransition, RevealOnScroll } from '@/components/motion';
import { toast } from 'sonner';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import FetchError from '@/components/ui/FetchError';

export default function ContactPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'general' | 'booking' | 'press'>('general');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [settingsError, setSettingsError] = useState(false);
  const [settingsRetry, setSettingsRetry] = useState(0);

  // General form
  const [gForm, setGForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [pForm, setPForm] = useState({ name: '', email: '', subject: '', message: '' });
  // Booking form
  const [bForm, setBForm] = useState({
    name: '', email: '', phone: '', organization: '', event_name: '',
    event_date: '', location: '', event_type: '', budget: '', message: ''
  });

  useEffect(() => {
    let active = true;
    supabase.from('site_settings').select('key,value').in('key', ['contact_email', 'booking_email'])
      .then(({ data, error }) => {
        if (!active) return;
        setSettingsError(!!error);
        const map: Record<string, string> = {};
        data?.forEach(r => { map[r.key] = r.value || ''; });
        setSettings(map);
      });
    return () => { active = false; };
  }, [settingsRetry]);

  async function submitGeneral(e: React.FormEvent) {
    e.preventDefault();
    if (!gForm.name || !gForm.email || !gForm.message) return;
    setSubmitting(true);
    const { error } = await supabase.from('messages').insert({
      name: gForm.name, email: gForm.email,
      subject: gForm.subject, message: gForm.message,
      form_type: 'general',
    });
    setSubmitting(false);
    if (error) { toast.error('Failed to send. Please try again.'); return; }
    setSuccess(true);
    setGForm({ name: '', email: '', subject: '', message: '' });
    toast.success('Message sent!');
    setTimeout(() => setSuccess(false), 5000);
  }

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!bForm.name || !bForm.email || !bForm.message) return;
    setSubmitting(true);
    const { error } = await supabase.from('booking_requests').insert({ ...bForm, event_date: bForm.event_date || null });
    setSubmitting(false);
    if (error) { toast.error('Failed to submit. Please try again.'); return; }
    setSuccess(true);
    setBForm({ name: '', email: '', phone: '', organization: '', event_name: '', event_date: '', location: '', event_type: '', budget: '', message: '' });
    toast.success('Booking request submitted!');
    setTimeout(() => setSuccess(false), 5000);
  }

  async function submitPress(e: React.FormEvent) {
    e.preventDefault();
    if (!pForm.name || !pForm.email || !pForm.message) return;
    setSubmitting(true);
    const { error } = await supabase.from('messages').insert({ ...pForm, form_type: 'press' });
    setSubmitting(false);
    if (error) { toast.error('Could not send your press inquiry. Try again.'); return; }
    setSuccess(true);
    setPForm({ name: '', email: '', subject: '', message: '' });
    toast.success('Press inquiry sent.');
  }

  return (
    <PageTransition>
      <div className="editorial-page contact-page">
        <div className="mb-12">
          <p className="eyebrow">GET IN TOUCH</p>
          <h1 className="page-title">Contact</h1>
          <p className="text-[#A8A8B3] mt-3">
            Email directly: <a href={`mailto:${settings.contact_email || 'camleinad@outlook.com'}`} className="text-link">{settings.contact_email || 'camleinad@outlook.com'}</a>
          </p>
          {settingsError && <FetchError message="Couldn’t load contact details. The forms are still available." onRetry={() => setSettingsRetry(count => count + 1)} />}
        </div>

        {/* Tabs */}
        <div className="editorial-filters" role="group" aria-label="Contact type">
          {(['general', 'booking', 'press'] as const).map(t => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => { setTab(t); setSuccess(false); }}
              className={`editorial-filter ${tab === t ? 'is-active' : ''}`}
            >
              {t === 'general' ? 'General' : t === 'booking' ? 'Booking' : 'Press'}
            </button>
          ))}
        </div>

        <RevealOnScroll>
          <div className="contact-form">
            {tab === 'general' ? (
              <form onSubmit={submitGeneral} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Name *</label>
                    <input type="text" required value={gForm.name} onChange={e => setGForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#72727E] text-sm focus:outline-none focus:border-violet-500/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Email *</label>
                    <input type="email" required value={gForm.email} onChange={e => setGForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#72727E] text-sm focus:outline-none focus:border-violet-500/50" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Subject</label>
                  <input type="text" value={gForm.subject} onChange={e => setGForm(f => ({ ...f, subject: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#72727E] text-sm focus:outline-none focus:border-violet-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Message *</label>
                  <textarea required rows={5} value={gForm.message} onChange={e => setGForm(f => ({ ...f, message: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#72727E] text-sm resize-none focus:outline-none focus:border-violet-500/50" />
                </div>
                <button type="submit" disabled={submitting}
                  className="contact-submit disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">{submitting && <LoadingSpinner />}{submitting ? 'Sending…' : 'Send Message'}</span>
                </button>
              </form>
            ) : tab === 'booking' ? (
              <form onSubmit={submitBooking} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Name *</label>
                    <input type="text" required value={bForm.name} onChange={e => setBForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500/50" /></div>
                  <div><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Email *</label>
                    <input type="email" required value={bForm.email} onChange={e => setBForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500/50" /></div>
                  <div><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Phone</label>
                    <input type="tel" value={bForm.phone} onChange={e => setBForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500/50" /></div>
                  <div><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Organization</label>
                    <input type="text" value={bForm.organization} onChange={e => setBForm(f => ({ ...f, organization: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500/50" /></div>
                  <div><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Event Name</label>
                    <input type="text" value={bForm.event_name} onChange={e => setBForm(f => ({ ...f, event_name: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500/50" /></div>
                  <div><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Event Date</label>
                    <input type="date" value={bForm.event_date} onChange={e => setBForm(f => ({ ...f, event_date: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500/50" /></div>
                  <div><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Location</label>
                    <input type="text" value={bForm.location} onChange={e => setBForm(f => ({ ...f, location: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500/50" /></div>
                  <div><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Budget</label>
                    <input type="text" value={bForm.budget} onChange={e => setBForm(f => ({ ...f, budget: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500/50" /></div>
                </div>
                <div><label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Message *</label>
                  <textarea required rows={4} value={bForm.message} onChange={e => setBForm(f => ({ ...f, message: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm resize-none focus:outline-none focus:border-violet-500/50" /></div>
                <button type="submit" disabled={submitting}
                  className="contact-submit disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">{submitting && <LoadingSpinner />}{submitting ? 'Submitting…' : 'Submit Booking Request'}</span>
                </button>
              </form>
            ) : (
              <form onSubmit={submitPress} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Name *</label>
                    <input type="text" required value={pForm.name} onChange={e => setPForm(form => ({ ...form, name: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Email *</label>
                    <input type="email" required value={pForm.email} onChange={e => setPForm(form => ({ ...form, email: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500/50" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Publication or topic</label>
                  <input type="text" value={pForm.subject} onChange={e => setPForm(form => ({ ...form, subject: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Message *</label>
                  <textarea required rows={5} value={pForm.message} onChange={e => setPForm(form => ({ ...form, message: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm resize-none focus:outline-none focus:border-violet-500/50" />
                </div>
                <button type="submit" disabled={submitting} className="contact-submit disabled:opacity-50">
                  <span className="flex items-center gap-2">{submitting && <LoadingSpinner />}{submitting ? 'Sending…' : 'Send Press Inquiry'}</span>
                </button>
              </form>
            )}
          </div>
        </RevealOnScroll>

        {success && <p role="status" className="mt-4 text-sm text-emerald-300">Thanks. Your message has been sent.</p>}

        <section className="mt-16" aria-labelledby="contact-faq-title">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300 mb-3">Helpful information</p>
          <h2 id="contact-faq-title" className="text-2xl font-bold text-white mb-6">Frequently asked questions</h2>
          <div className="divide-y divide-white/10 border-y border-white/10">
            <details className="py-4 group">
              <summary className="cursor-pointer text-white font-medium">How do I submit music for a collaboration?</summary>
              <p className="mt-3 text-sm text-[#A8A8B3]">Choose General and include a short introduction, links to your work, and what you have in mind.</p>
            </details>
            <details className="py-4 group">
              <summary className="cursor-pointer text-white font-medium">How long do replies take?</summary>
              <p className="mt-3 text-sm text-[#A8A8B3]">Reply times vary. Include the relevant details so your message can be reviewed more easily.</p>
            </details>
            <details className="py-4 group">
              <summary className="cursor-pointer text-white font-medium">Where can I listen to the releases?</summary>
              <p className="mt-3 text-sm text-[#A8A8B3]">Visit the Music page for available releases and their configured streaming links.</p>
            </details>
            <details className="py-4 group">
              <summary className="cursor-pointer text-white font-medium">How do I ask about a booking?</summary>
              <p className="mt-3 text-sm text-[#A8A8B3]">Use the Booking tab and share the event date, location, and other details you already know.</p>
            </details>
            <details className="py-4 group">
              <summary className="cursor-pointer text-white font-medium">Where should press and interview requests go?</summary>
              <p className="mt-3 text-sm text-[#A8A8B3]">Use the Press tab or email camleinad@outlook.com directly.</p>
            </details>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
