import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function ProtectedRoute({ children, requireProfileComplete = true }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profileComplete, setProfileComplete] = useState(true);
  const location = useLocation();

  useEffect(() => {
    let active = true;

    async function loadSessionAndProfile(existingSession, options = { showLoading: true }) {
      if (options.showLoading) {
        setLoading(true);
      }
      const session = existingSession || (await supabase.auth.getSession()).data.session;
      if (!active) return;

      setSession(session);

      if (!session?.user) {
        setProfileComplete(true);
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name, contact_no, agency_name, agency_role")
        .eq("id", session.user.id)
        .single();

      const isComplete = Boolean(
        profile?.full_name &&
        profile?.contact_no &&
        profile?.agency_name &&
        profile?.agency_role
      );

      if (active) {
        setProfileComplete(isComplete);
        setLoading(false);
      }
    }

    loadSessionAndProfile();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return;

        // Keep protected pages mounted during token refresh/focus events.
        if (event === "SIGNED_OUT") {
          setSession(null);
          setProfileComplete(true);
          setLoading(false);
          return;
        }

        setSession(session ?? null);

        if (!session?.user) {
          setProfileComplete(true);
          setLoading(false);
          return;
        }

        loadSessionAndProfile(session, { showLoading: false });
      }
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [location.pathname]);

  if (loading) return null; // or loading spinner

  if (!session) return <Navigate to="/login" replace />;
  if (requireProfileComplete && !profileComplete) {
    return <Navigate to="/profile?firstSetup=true" replace />;
  }
  return children;
}
