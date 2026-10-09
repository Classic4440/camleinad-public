import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AuthUser, Profile } from '@/types';

interface AuthContextType {
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  login: (user: AuthUser) => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function mapSupabaseUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email!,
    username: user.user_metadata?.username || user.user_metadata?.full_name || user.email!.split('@')[0],
    avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const mountedRef = useRef(true);
  const activeUserIdRef = useRef<string | null>(null);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (!mountedRef.current || activeUserIdRef.current !== userId) return;
    if (error) {
      console.warn('[Auth] Profile load failed:', error.message);
      setProfile(null);
      setIsAdmin(false);
      return;
    }
    const nextProfile = data as Profile | null;
    setProfile(nextProfile);
    setIsAdmin(nextProfile?.role === 'admin');
  }

  async function refreshProfile() {
    if (user?.id) await loadProfile(user.id);
  }

  function login(authUser: AuthUser) {
    activeUserIdRef.current = authUser.id;
    setUser(authUser);
    setProfile(null);
    setLoading(true);
    void loadProfile(authUser.id).finally(() => {
      if (mountedRef.current) setLoading(false);
    });
  }

  async function logout() {
    await supabase.auth.signOut();
    activeUserIdRef.current = null;
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
  }

  useEffect(() => {
    mountedRef.current = true;

    async function handleVisibility() {
      if (document.visibilityState !== 'visible') return;
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('[Auth] Session refresh failed on tab focus:', error.message);
      }
      if (!mountedRef.current) return;
      if (data?.session?.user) {
        const authUser = mapSupabaseUser(data.session.user);
        activeUserIdRef.current = authUser.id;
        setUser(authUser);
        void loadProfile(authUser.id);
      } else if (!error) {
        activeUserIdRef.current = null;
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);

    async function initializeSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mountedRef.current) return;
      if (session?.user) {
        const authUser = mapSupabaseUser(session.user);
        activeUserIdRef.current = authUser.id;
        setUser(authUser);
        await loadProfile(authUser.id);
      } else {
        activeUserIdRef.current = null;
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
      }
      if (mountedRef.current) setLoading(false);
    }

    void initializeSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return;
      if (event === 'SIGNED_IN' && session?.user) {
        const authUser = mapSupabaseUser(session.user);
        activeUserIdRef.current = authUser.id;
        setUser(authUser);
        setProfile(null);
        setLoading(true);
        void loadProfile(authUser.id).finally(() => {
          if (mountedRef.current) setLoading(false);
        });
      } else if (event === 'SIGNED_OUT') {
        activeUserIdRef.current = null;
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        const authUser = mapSupabaseUser(session.user);
        activeUserIdRef.current = authUser.id;
        setUser(authUser);
      }
    });

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
