import { Navigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../lib/auth.jsx';
import { useState } from 'react';
import toast from 'react-hot-toast';
import Logo from '../components/Logo.jsx';

export default function Login() {
  const { user, googleReady, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [searchParams] = useSearchParams();
  const authError = searchParams.get('error');

  if (user) return <Navigate to="/" replace />;

  const handleGoogle = async () => {
    setBusy(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
    } catch (e) {
      toast.error(e.message || 'Sign-in failed');
      setBusy(false);
    }
  };

  const callbackUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/auth/callback/google`
      : 'http://localhost:5173/api/auth/callback/google';

  return (
    <div className="min-h-screen grid place-items-center px-4 relative overflow-hidden">
      <BackgroundOrbs />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Logo
            size={64}
            className="inline-block rounded-3xl shadow-[0_0_60px_-12px_rgba(0,212,170,0.6)] mb-5"
          />
          <h1 className="heading text-4xl mb-2">OweNow</h1>
          <p className="text-text-muted">Split expenses with friends. Without the friction.</p>
        </div>

        <div className="card p-7">
          <h2 className="heading text-xl text-center mb-6">Welcome back</h2>

          {googleReady ? (
            <button
              onClick={handleGoogle}
              disabled={busy}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-border-strong bg-white text-[#1F1F1F] font-medium hover:bg-white/90 active:scale-[0.99] transition disabled:opacity-60"
            >
              <GoogleIcon />
              {busy ? 'Signing in…' : 'Continue with Google'}
            </button>
          ) : (
            <div className="rounded-xl border border-border bg-bg-subtle/60 p-4 text-xs text-text-muted space-y-2">
              <p className="text-text font-medium">
                Google sign-in needs an OAuth client from Google Cloud. Add these to <code>.env</code>, then restart the dev server:
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Create an OAuth client (Web application) in Google Cloud Console.</li>
                <li>
                  Set the authorized redirect URI to <code className="text-accent">{callbackUrl}</code>.
                </li>
                <li>
                  Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>.
                </li>
              </ol>
            </div>
          )}

          {authError && (
            <p className="mt-4 text-xs text-danger text-center">
              Google could not complete sign-in ({authError}). Check your client ID, secret, and authorized redirect URI (<code>{callbackUrl}</code>), then try again.
            </p>
          )}

          <div className="mt-6 text-center text-xs text-text-subtle">
            By continuing, you agree to our Terms and Privacy Policy.
          </div>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          <Stat label="Settle in" value="seconds" />
          <Stat label="Currencies" value="8+" />
          <Stat label="Forever" value="free" />
        </div>
      </motion.div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="card p-3">
      <div className="font-display font-bold text-accent text-lg">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-text-subtle mt-0.5">{label}</div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/>
    </svg>
  );
}

function BackgroundOrbs() {
  return (
    <>
      <motion.div
        animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0.6, 0.4] }}
        transition={{ duration: 8, repeat: Infinity }}
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-accent/20 blur-3xl"
      />
      <motion.div
        animate={{ scale: [1.1, 1, 1.1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 10, repeat: Infinity }}
        className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-secondary/20 blur-3xl"
      />
    </>
  );
}
