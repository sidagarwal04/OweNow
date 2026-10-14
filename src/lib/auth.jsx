import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  apiFetch,
  getCachedSession,
  getStoredToken,
  setCachedSession,
  setStoredToken,
} from './api.js';

const AuthContext = createContext({
  session: null,
  user: null,
  profile: null,
  googleReady: true,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
  updateProfile: async () => {},
});

export function AuthProvider({ children }) {
  const cached = getCachedSession();
  const [session, setSession] = useState(cached?.session ?? null);
  const [profile, setProfile] = useState(cached?.profile ?? null);
  const [googleReady, setGoogleReady] = useState(true);
  const [loading, setLoading] = useState(!cached?.session);

  const fetchSession = async () => {
    try {
      const data = await apiFetch('/api/auth/session');
      if (typeof data.googleReady === 'boolean') {
        setGoogleReady(data.googleReady);
      }
      if (data?.user && data?.session) {
        if (data.session.access_token) {
          setStoredToken(data.session.access_token);
        }
        setSession(data.session);
        setProfile(data.profile ?? null);
        setCachedSession({ session: data.session, profile: data.profile ?? null });
        return data;
      } else {
        setStoredToken(null);
        setCachedSession(null);
        setSession(null);
        setProfile(null);
        return null;
      }
    } catch (e) {
      console.error('[OweNow] fetchSession failed:', e);
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // Capture ?auth_token=... returned from /api/auth/callback/google
        const url = new URL(window.location.href);
        const tokenFromUrl = url.searchParams.get('auth_token');
        if (tokenFromUrl) {
          setStoredToken(tokenFromUrl);
          url.searchParams.delete('auth_token');
          window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
        }

        await fetchSession();
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      googleReady,
      loading,
      signInWithGoogle: async () => {
        window.location.assign('/api/auth/google');
        return { error: null };
      },
      signOut: async () => {
        await apiFetch('/api/auth/signout', { method: 'POST' }).catch(() => {});
        setStoredToken(null);
        setCachedSession(null);
        setSession(null);
        setProfile(null);
      },
      refreshProfile: async () => {
        await fetchSession();
      },
      updateProfile: async (updates) => {
        const { profile: updated } = await apiFetch('/api/auth/profile', {
          method: 'PATCH',
          body: updates,
        });
        setProfile(updated);
        const currentToken = getStoredToken();
        if (session) {
          const nextSession = {
            ...session,
            access_token: currentToken || session.access_token,
            user: {
              ...session.user,
              user_metadata: {
                ...session.user?.user_metadata,
                full_name: updated.full_name,
                avatar_url: updated.avatar_url,
              },
            },
          };
          setSession(nextSession);
          setCachedSession({ session: nextSession, profile: updated });
        }
        return updated;
      },
    }),
    [session, profile, googleReady, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
