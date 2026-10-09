import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { toast } from 'sonner';
import CamLogo from '@/components/layout/CamLogo';

type Step = 'entry' | 'otp' | 'login';

export default function AuthPage() {
  const [mode, setMode] = useState<'register' | 'login'>('login');
  const [step, setStep] = useState<Step>('entry');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSendOtp() {
    if (!email.trim() || password.length < 6) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.trim() || email.split('@')[0] } },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    if (data.session && data.user) {
      login({ id: data.user.id, email: data.user.email!, username: username.trim() || data.user.email!.split('@')[0] });
      navigate('/');
      return;
    }
    setOtpError('');
    setStep('otp');
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) return;
    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'signup' });
    setLoading(false);
    if (error) { setOtpError('Invalid or expired code. Try again.'); return; }
    if (data.user) {
      login({ id: data.user.id, email: data.user.email!, username: data.user.user_metadata?.username || data.user.email!.split('@')[0] });
      navigate('/');
    }
  }

  async function handleResendOtp() {
    setLoading(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setLoading(false);
    if (error) { toast.error('Could not resend the code. Please wait and try again.'); return; }
    setOtpError('');
    toast.success('A new verification code has been sent.');
  }

  async function handleLogin() {
    if (!email || !password) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { toast.error(error.message); setLoading(false); return; }
    if (data.user) {
      login({ id: data.user.id, email: data.user.email!, username: data.user.user_metadata?.username || data.user.email!.split('@')[0] });
      navigate('/');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-16">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <CamLogo className="cam-logo-3--auth" />
          </Link>
          <p className="text-[#72727E] text-sm mt-2">Join the CAM community</p>
        </div>

        <div className="glass rounded-2xl p-7 border border-white/10">
          {/* Tab toggle */}
          <div className="flex bg-white/5 rounded-xl p-1 mb-6">
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setStep(m === 'login' ? 'login' : 'entry'); setPassword(''); setOtp(''); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === m ? 'bg-violet-600 text-white' : 'text-[#72727E] hover:text-white'}`}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <>
            {mode === 'login' ? (
              <div key="login" className="space-y-4">
                <div>
                  <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#72727E] text-sm focus:outline-none focus:border-violet-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#72727E] text-sm focus:outline-none focus:border-violet-500/50" />
                </div>
                <button
                  onClick={handleLogin} disabled={loading || !email || !password}
                  className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-all disabled:opacity-50"
                >
                  <span className="flex items-center justify-center gap-2">{loading && <LoadingSpinner />}{loading ? 'Signing in…' : 'Sign In'}</span>
                </button>
              </div>
            ) : (
              <div key="register" className="space-y-4">
                {step === 'entry' && (
                  <>
                    <div>
                      <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Email</label>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#72727E] text-sm focus:outline-none focus:border-violet-500/50" />
                    </div>
                    <div>
                      <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Username</label>
                      <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#72727E] text-sm focus:outline-none focus:border-violet-500/50" />
                    </div>
                    <div>
                      <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Password</label>
                      <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#72727E] text-sm focus:outline-none focus:border-violet-500/50" />
                    </div>
                    <button
                      onClick={handleSendOtp} disabled={loading || !email || password.length < 6}
                      className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-all disabled:opacity-50"
                    >
                      <span className="flex items-center justify-center gap-2">{loading && <LoadingSpinner />}{loading ? 'Creating account…' : 'Create Account'}</span>
                    </button>
                  </>
                )}
                {step === 'otp' && (
                  <>
                    <p className="text-sm text-[#A8A8B3] text-center">We sent a 6-digit code to your email. <span className="text-white">{email}</span></p>
                    <div>
                      <label className="block text-xs text-[#72727E] uppercase tracking-wider mb-2">Verification Code</label>
                      <InputOTP maxLength={6} value={otp} onChange={value => { setOtp(value); setOtpError(''); }} pattern="[0-9]*" inputMode="numeric" aria-label="Six-digit verification code">
                        <InputOTPGroup className="w-full justify-between">
                          {[0, 1, 2, 3, 4, 5].map(index => <InputOTPSlot key={index} index={index} className="h-12 w-12 bg-white/5 border-white/10 text-white" />)}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    {otpError && <p role="alert" className="text-sm text-red-300 text-center">{otpError}</p>}
                    <button
                      onClick={handleVerifyOtp} disabled={loading || otp.length !== 6}
                      className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-all disabled:opacity-50"
                    >
                      <span className="flex items-center justify-center gap-2">{loading && <LoadingSpinner />}{loading ? 'Verifying…' : 'Verify Code'}</span>
                    </button>
                    <button type="button" onClick={handleResendOtp} disabled={loading} className="w-full text-sm text-violet-300 hover:text-white disabled:opacity-50">
                      Resend code
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        </div>
      </div>
    </div>
  );
}
