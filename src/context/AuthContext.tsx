import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { Session } from "@supabase/supabase-js";

import { resetStore, store } from "@store/index";

import { supabase } from "../lib/supabase";
import type { AuthUser, UserProfile } from "../models/globalTypes";

type ProfileUpdates = Partial<
  Pick<UserProfile, "display_name" | "avatar_url" | "focus_keywords" | "onboarding_completed">
>;

type PracticeSettings = {
  subscription_status: string;
  subscription_plan: string;
  stripe_connect_onboarded: boolean;
  use_client_codenames: boolean;
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
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, meta?: Record<string, unknown>, accessToken?: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: ProfileUpdates) => Promise<void>;
  refreshPracticeSettings: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

  const prevUserIdRef = useRef<string | null>(null);

  const fetchProfile = async (authUser: AuthUser): Promise<UserProfile | null> => {
    const { data, error } = await supabase.from("users").select("*").eq("id", authUser.id).single();

    if (error) {
      console.error("fetchProfile error:", error.message);
      return null;
    }

    return data;
  };

  const handleSession = async (session: Session | null) => {
    const currentAuthUser = session?.user ?? null;
    const newUserId = currentAuthUser?.id ?? null;

    setAuthUser(currentAuthUser);

    if (newUserId !== prevUserIdRef.current) {
      prevUserIdRef.current = newUserId;

      if (currentAuthUser) {
        const profileData = await fetchProfile(currentAuthUser);
        setUserProfile(profileData);

        if (profileData?.role === "admin") {
          // maybeSingle (not single): a demo admin — or any admin without a
          // practice_settings row — legitimately has no row, and single() would
          // 406 on zero rows. maybeSingle returns null cleanly.
          const { data: settings } = await supabase
            .from("practice_settings")
            .select(
              "subscription_status, subscription_plan, stripe_connect_onboarded, use_client_codenames, reschedule_cutoff_hours",
            )
            .eq("admin_id", currentAuthUser.id)
            .maybeSingle();
          setPracticeSettings(settings ?? null);
          setRescheduleCutoffHours(settings?.reschedule_cutoff_hours ?? null);
        } else {
          setPracticeSettings(null);
          // Clients can't SELECT practice_settings directly (RLS scopes it to
          // the owning admin), so this one field is exposed via RPC instead.
          const { data: cutoff } = await supabase.rpc("get_my_reschedule_cutoff_hours");
          setRescheduleCutoffHours(cutoff ?? null);
        }
      } else {
        setUserProfile(null);
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
      const { data } = await supabase.auth.getSession();
      await handleSession(data.session);
      initialised = true;
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!initialised) return;
      handleSession(session);
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
    const { data } = await supabase
      .from("practice_settings")
      .select("subscription_status, subscription_plan, stripe_connect_onboarded, use_client_codenames")
      .eq("admin_id", authUser.id)
      .maybeSingle();
    setPracticeSettings(data ?? null);
  }, [authUser, userProfile?.role]);

  const signOut = useCallback(async () => {
    setError(null);

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("signOut error:", error.message);
    } else {
      store.dispatch(resetStore());
    }
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
      signIn,
      signUp,
      signOut,
      updateProfile,
      refreshPracticeSettings,
    ],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
