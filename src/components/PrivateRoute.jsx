// src/components/PrivateRoute.jsx
import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

// ✅ Get cached app user (saved during login)
function getCachedUser() {
  try {
    const raw = localStorage.getItem("appUser");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error("Invalid cached user:", e);
    return null;
  }
}

export default function PrivateRoute({ children, role }) {
  const [user, setUser] = useState(() => getCachedUser());
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Keep in sync with Supabase events
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          const cached = getCachedUser();

          // trust cached role if present
          if (cached && cached.id === session.user.id) {
            setUser(cached);
          } else {
            // fallback if cache missing
            setUser({
              id: session.user.id,
              email: session.user.email,
              role: "user",
            });
          }

        } else {
          // logout event
          localStorage.removeItem("appUser");
          setUser(null);
        }

        setChecking(false);
      }
    );

    // initial load (offline support)
    setChecking(false);

    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, []);

  // still checking auth
  if (checking) {
    return <div className="p-6 text-center">Checking permission...</div>;
  }

  // no user at all
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // role-based protection
  if (role && user.role !== role) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
