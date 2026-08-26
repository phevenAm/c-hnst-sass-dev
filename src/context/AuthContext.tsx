import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { Session } from "@supabase/supabase-js";

import { resetStore, store } from "@store/index";
import { fetchPracticeSettings } from "@store/slices/practiceSettingsSlice";

import { clearPersistedAuthSession, REQUEST_TIMEOUT_MS, supabase } from "../lib/supabase";
import type { AuthUser, UserProfile } from "../models/globalTypes";

// supabase-js's own internals (cross-tab lock, session recovery) can stall
// before ever making a network request our fetchWithTimeout would catch —
// these are the outer backstops. If init hasn't settled by here, treat it as
// failed rather than spin forever.
//
// Both are derived from REQUEST_TIMEOUT_MS (supabase.ts) rather than a fixed
// number: they wrap operations that can themselves make one or more fetches
// bound by that timeout, so an outer backstop shorter than the fetch(es) it's
// meant to backstop would fire on a merely-slow-but-succeeding request and
// wipe a perfectly valid session (see git history 2026-08-19/20 for the bug
// this caused). Each gets a fixed grace on top for the lock-acquire/steal
// overhead that happens before any fetch even starts.
const LOCK_OVERHEAD_MS = 5_000;
// getSession() makes at most one network call (a token refresh).
const AUTH_INIT_TIMEOUT_MS = REQUEST_TIMEOUT_MS + LOCK_OVERHEAD_MS;
// handleSession() makes up to two sequential calls: fetchProfile, then the
// shared practice_settings fetch (fetchPracticeSettings).
const HANDLE_SESSION_TIMEOUT_MS = REQUEST_TIMEOUT_MS * 2 + LOCK_OVERHEAD_MS;

type ProfileUpdates = Partial<
  Pick<
    UserProfile,
    | "display_name"
    | "avatar_url"
    | "focus_keywords"
    | "onboarding_completed"
    | "has_consented"
    | "consented_at"
    | "consent_signed_name"
  >
>;

type PracticeSettings = {
  business_name: string | null;
  onboarding_required: boolean;
  subscription_status: string;
  subscription_plan: string;
  stripe_connect_onboarded: boolean;
  use_client_codenames: boolean;
  referral_code: string | null;
};

type AuthContextType = {
  authUser: AuthUser | null;
  userProfile: UserProfile | null;
  practiceSettings: PracticeSettings | null;
  /** Hours before a session that clients are blocked from self-service pay/reschedule/cancel.
   *  null = restriction disabled. undefined = not loaded yet. */
  rescheduleCutoffHours: number | null | undefined;
  displayName: string | null;
  loading: boolean;
  isFinishingSignup: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isDemo: boolean;
  isSuperAdmin: boolean;
  /** Set when the profile row failed to load after auth succeeded — distinct from
   *  `loading`, which only covers the initial session check. ProtectedRoute uses
   *  this to show a retry screen instead of spinning forever. */
  profileError: string | null;
  retryProfile: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, meta?: Record<string, unknown>, accessToken?: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: ProfileUpdates) => Promise<void>;
  refreshPracticeSettings: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchProfile(authUser: AuthUser): Promise<UserProfile | null> {
  const { data, error } = await supabase.from("users").select("*").eq("id", authUser.id).single();

  if (error) {
    console.error("fetchProfile error:", error.message);
    return null;
  }

  return data;
}

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [practiceSettings, setPracticeSettings] = useState<PracticeSettings | null>(null);
  const [rescheduleCutoffHours, setRescheduleCutoffHours] = useState<number | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [isFinishingSignup, setIsFinishingSignup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const prevUserIdRef = useRef<string | null>(null);

  // Races any promise against the same kind of outer backstop used for auth
  // init — reused so a hang triggered mid-session (e.g. a TOKEN_REFRESHED
  // event landing while supabase-js's internals are in a bad state) gets the
  // same guaranteed recovery as a hang on page load, instead of only page
  // load being covered. timeoutMs must be sized to what `promise` can
  // legitimately take (see the constants above) — too short and this fires
  // on a merely-slow-but-succeeding call instead of an actual hang.
  const withTimeout = <T,>(promise: Promise<T>, label: string, timeoutMs: number): Promise<T> =>
    Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`${label} did not settle within ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);

  const handleSession = async (session: Session | null) => {
    const currentAuthUser = session?.user ?? null;
    const newUserId = currentAuthUser?.id ?? null;

    setAuthUser(currentAuthUser);

    if (newUserId !== prevUserIdRef.current) {
      prevUserIdRef.current = newUserId;

      if (currentAuthUser) {
        // A user-id change mid-session (e.g. the demo "View as therapist"/
        // "View as client" switch, which signs into a different account
        // without a full page reload) leaves `loading` false as the new
        // profile/role fetch is still in flight — ProtectedRoute and the
        // root role redirect only gate on `loading`, so without this they'd
        // make their allow/redirect decision against the *previous* user's
        // stale isAdmin, immediately bouncing back to the old role's route
        // before this fetch had a chance to update it.
        setLoading(true);
        const profileData = await fetchProfile(currentAuthUser);
        setUserProfile(profileData);
        setProfileError(profileData ? null : "Couldn't load your profile.");

        // Shared cache (practiceSettingsSlice) — RLS scopes SELECT to exactly
        // one row for any caller (admin's own row, or a client's own admin's
        // row), so this same dispatch works for both roles and is reused by
        // every other consumer (Navbar, PaymentModal, etc.) instead of each
        // firing its own independent fetch. Read via the action result
        // rather than .unwrap() so a failure degrades to null like the old
        // direct-select code did, instead of throwing into the outer
        // auth-hang recovery path and clearing a perfectly good session.
        const settingsAction = await store.dispatch(fetchPracticeSettings());
        const settings = fetchPracticeSettings.fulfilled.match(settingsAction) ? settingsAction.payload : null;
        setPracticeSettings(profileData?.role === "admin" ? (settings ?? null) : null);
        setRescheduleCutoffHours(settings?.reschedule_cutoff_hours ?? null);
      } else {
        setUserProfile(null);
        setProfileError(null);
        setPracticeSettings(null);
        setRescheduleCutoffHours(undefined);
      }
    }

    setLoading(false);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: handleSession is intentionally excluded — adding it would require memoizing the entire call chain and would cause the subscription to re-register on every render
  useEffect(() => {
    let initialised = false;

    const init = async () => {
      try {
        const { data } = await withTimeout(supabase.auth.getSession(), "Auth init (getSession)", AUTH_INIT_TIMEOUT_MS);
        await withTimeout(handleSession(data.session), "Auth init (handleSession)", HANDLE_SESSION_TIMEOUT_MS);
      } catch (err) {
        // Multiple tabs/windows open can cause supabase-js's cross-tab auth
        // lock to get "stolen" from this one (AbortError, after its 5s
        // recovery timeout) — without this catch, the rejection was never
        // handled and `loading` stayed true forever, leaving the app stuck
        // on the spinner. The outer race above also catches cases where
        // getSession() stalls without ever throwing (the exact mechanism
        // isn't always visible to us — supabase-js internals can hang before
        // making any network request our own fetch timeout would catch).
        // Either way, clear the persisted session so the retry — this one,
        // or the user's next reload — doesn't hit the exact same stuck
        // state again; that's what manually deleting the token does today.
        console.error("Auth init failed:", err);
        clearPersistedAuthSession();
        setLoading(false);
      } finally {
        initialised = true;
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!initialised) return;
      // Same backstop as init: a hang here (e.g. a TOKEN_REFRESHED event
      // landing while supabase-js's cross-tab lock is in a bad state) used
      // to have no recovery path at all — the app would sit in whatever
      // half-updated state it was in indefinitely, the "clear localStorage
      // and sign back in" symptom, but mid-session instead of on load.
      withTimeout(handleSession(session), "Auth state change", HANDLE_SESSION_TIMEOUT_MS).catch((err) => {
        console.error("Auth state change handling failed:", err);
        clearPersistedAuthSession();
        setLoading(false);
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      throw error;
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, meta?: Record<string, unknown>, accessToken?: string) => {
      setError(null);

      const cleanedToken = accessToken?.trim();

      if (!cleanedToken) {
        const message = "Access token is required.";
        setError(message);
        throw new Error(message);
      }

      // Validate via a security-definer RPC rather than reading the token table
      // directly: RLS keeps every practice's tokens private, and this only
      // confirms the one token the signer already holds (no enumeration).
      const { data: isTokenValid, error: tokenError } = await supabase.rpc("validate_platform_access_token", {
        input_token: cleanedToken,
      });

      if (tokenError) {
        setError(tokenError.message);
        throw new Error(tokenError.message);
      }

      if (!isTokenValid) {
        const message = "Invalid or already-used access token.";
        setError(message);
        throw new Error(message);
      }

      // Set the spinner flag BEFORE signUp() — the Supabase project has
      // email auto-confirm enabled, so signUp() immediately signs the user in
      // and fires onAuthStateChange. If we wait until after, the dashboard
      // can mount and fetch 0 sessions before the stub merge runs.
      setIsFinishingSignup(true);
      try {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: meta,
          },
        });

        if (signUpError) {
          setError(signUpError.message);
          throw signUpError;
        }

        // Auto-confirm email — invite email is proof the address is valid
        await supabase.functions.invoke("auto-confirm-signup", {
          body: { user_id: signUpData.user!.id, access_token: cleanedToken },
        });

        // Sign in so auth.uid() is set when consume_platform_access_token runs
        await supabase.auth.signInWithPassword({ email, password });

        const { data: tokenConsumed, error: consumeTokenError } = await supabase.rpc("consume_platform_access_token", {
          input_token: cleanedToken,
        });

        if (consumeTokenError) {
          setError(consumeTokenError.message);
          throw consumeTokenError;
        }

        if (!tokenConsumed) {
          const message = "This access token has already been used.";
          setError(message);
          throw new Error(message);
        }

        // If this signup was converted from an offline stub, notify the admin
        const { data: linkedStub } = await supabase
          .from("client_stubs")
          .select("id")
          .eq("linked_user_id", signUpData.user!.id)
          .maybeSingle();

        if (linkedStub?.id) {
          supabase.functions.invoke("notify-admin-stub-joined", {
            body: { stub_id: linkedStub.id, new_user_id: signUpData.user!.id },
          });
        }
      } finally {
        // Clear all cached Redux data so the dashboard fetches fresh on mount.
        // This covers both the happy path and any error path where stale data
        // might have been loaded before the merge completed.
        store.dispatch(resetStore());
        setIsFinishingSignup(false);
      }
    },
    [],
  );

  const updateProfile = useCallback(
    async (updates: ProfileUpdates) => {
      if (!authUser) return;

      if (userProfile?.is_demo) {
        setUserProfile((prev) => (prev ? { ...prev, ...updates } : prev));
        return;
      }

      const { error } = await supabase.from("users").update(updates).eq("id", authUser.id);

      if (error) throw new Error(error.message);

      setUserProfile((prev) => (prev ? { ...prev, ...updates } : prev));
    },
    [authUser, userProfile],
  );

  const refreshPracticeSettings = useCallback(async () => {
    if (!authUser || userProfile?.role !== "admin") return;
    const settingsAction = await store.dispatch(fetchPracticeSettings());
    const settings = fetchPracticeSettings.fulfilled.match(settingsAction) ? settingsAction.payload : null;
    setPracticeSettings(settings ?? null);
  }, [authUser, userProfile?.role]);

  const retryProfile = useCallback(() => {
    if (!authUser) return;
    fetchProfile(authUser).then((profileData) => {
      setUserProfile(profileData);
      setProfileError(profileData ? null : "Couldn't load your profile.");
    });
  }, [authUser]);

  const signOut = useCallback(async () => {
    setError(null);

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("signOut error:", error.message);
      throw error;
    }
    store.dispatch(resetStore());
  }, []);

  const displayName = userProfile?.display_name ?? userProfile?.first_name ?? null;

  const contextValue = useMemo(
    () => ({
      authUser,
      userProfile,
      practiceSettings,
      rescheduleCutoffHours,
      displayName,
      error,
      loading,
      isFinishingSignup,
      isAuthenticated: !!authUser,
      isAdmin: userProfile?.role === "admin",
      isDemo: userProfile?.is_demo ?? false,
      isSuperAdmin: (userProfile as Record<string, unknown>)?.is_superadmin === true,
      profileError,
      retryProfile,
      signIn,
      signUp,
      signOut,
      updateProfile,
      refreshPracticeSettings,
    }),
    [
      authUser,
      userProfile,
      practiceSettings,
      rescheduleCutoffHours,
      displayName,
      error,
      loading,
      isFinishingSignup,
      profileError,
      retryProfile,
      signIn,
      signUp,
      signOut,
      updateProfile,
      refreshPracticeSettings,
    ],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
