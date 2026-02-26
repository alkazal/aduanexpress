import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profileComplete, setProfileComplete] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadSessionAndProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;

      setSession(session);

      if (!session?.user) {
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
      (_event, session) => {
        setSession(session);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) return null; // or loading spinner

  if (!session) return <Navigate to="/login" replace />;
  if (!profileComplete) return <Navigate to="/profile" replace />;
  return children;
}
