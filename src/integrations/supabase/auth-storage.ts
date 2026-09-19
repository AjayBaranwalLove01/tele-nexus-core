import { brokeredPreviewStorage } from './previewAuthStorage';
import type { SupabaseClient } from '@supabase/supabase-js';

const REMEMBER_ME_KEY = 'oxo_remember_me';
const REMEMBER_ME_PREF_KEY = 'oxo_remember_me_pref';
const SESSION_COOKIE_NAME = 'oxo_session_active';
const SESSION_STORAGE_KEY = 'oxo_session_active';

/**
 * Check if the session cookie is present in document.cookie
 */
export function hasSessionCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim().startsWith(SESSION_COOKIE_NAME + '='));
}

/**
 * Set session-scoped cookie (omitted Expires and Max-Age makes it a browser-session-lifetime cookie).
 * Uses SameSite=Lax and Secure when served over HTTPS.
 */
export function setSessionCookie(): void {
  if (typeof document === 'undefined') return;
  const isSecure = typeof location !== 'undefined' && location.protocol === 'https:';
  document.cookie = SESSION_COOKIE_NAME + '=1; path=/; SameSite=Lax' + (isSecure ? '; Secure' : '');
}

/**
 * Explicitly clear the session cookie
 */
export function clearSessionCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = SESSION_COOKIE_NAME + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
}

/**
 * Retrieve the user's remembered preference for the Remember Me checkbox
 */
export function getRememberMePreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(REMEMBER_ME_PREF_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Record the Remember Me choice before/upon login attempt
 */
export function setRememberMeChoice(remember: boolean): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(REMEMBER_ME_PREF_KEY, remember ? 'true' : 'false');
    localStorage.setItem(REMEMBER_ME_KEY, remember ? 'true' : 'false');
  } catch {}

  if (remember) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {}
    clearSessionCookie();
  } else {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(SESSION_STORAGE_KEY, '1');
      }
    } catch {}
    setSessionCookie();
  }
}

/**
 * Completely clear the auth session, persistent flags, and session markers upon logout
 */
export function clearAuthSession(): void {
  clearSessionCookie();

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(REMEMBER_ME_KEY);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('auth-token') || key.startsWith('supabase.'))) {
          localStorage.removeItem(key);
        }
      }
    } catch {}
  }

  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('auth-token') || key.startsWith('supabase.'))) {
          sessionStorage.removeItem(key);
        }
      }
    } catch {}
  }
}

/**
 * Custom Storage adapter for Supabase client that respects Remember Me
 */
export function createAuthStorage(): Storage {
  if (typeof window === 'undefined') {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
  }

  const preview = brokeredPreviewStorage();
  // If running inside a Lovable preview iframe, use brokered storage
  if (preview && preview !== localStorage) {
    return preview as unknown as Storage;
  }

  return {
    getItem: (key: string): string | null => {
      const isAuthKey = key.includes('auth-token') || key.startsWith('sb-') || key.startsWith('supabase.');

      if (isAuthKey) {
        let isRemembered = false;
        try {
          isRemembered = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
        } catch {}

        if (!isRemembered) {
          // If not remembered, verify whether browser session is still active
          const isSessionAlive =
            hasSessionCookie() ||
            (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_STORAGE_KEY) === '1');

          if (!isSessionAlive) {
            // Browser was restarted! Purge stored tokens so user is required to log in
            try {
              localStorage.removeItem(key);
              localStorage.removeItem(REMEMBER_ME_KEY);
            } catch {}
            return null;
          }
        }
      }

      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },

    setItem: (key: string, value: string): void => {
      try {
        localStorage.setItem(key, value);
      } catch {}

      const isAuthKey = key.includes('auth-token') || key.startsWith('sb-') || key.startsWith('supabase.');
      if (isAuthKey) {
        try {
          const isRemembered = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
          if (!isRemembered) {
            setSessionCookie();
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(SESSION_STORAGE_KEY, '1');
            }
          }
        } catch {}
      }
    },

    removeItem: (key: string): void => {
      try {
        localStorage.removeItem(key);
      } catch {}
    },

    clear: (): void => {
      clearAuthSession();
    },

    key: (index: number): string | null => {
      try {
        return localStorage.key(index);
      } catch {
        return null;
      }
    },

    get length(): number {
      try {
        return localStorage.length;
      } catch {
        return 0;
      }
    },
  };
}

/**
 * Listen to Supabase auth events to handle clean logout
 */
export function setupAuthListeners(client: SupabaseClient): void {
  if (typeof window === 'undefined') return;
  try {
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearAuthSession();
      }
    });
  } catch {}
}