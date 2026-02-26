import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Link, useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    async function hydrateSession() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || !active) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role, full_name")
        .eq("id", user.id)
        .single();

      const cachedUser = {
        id: user.id,
        email: user.email,
        role: profile?.role || "user",
        full_name: profile?.full_name || "",
      };

      localStorage.setItem("appUser", JSON.stringify(cachedUser));
      navigate("/");
    }

    hydrateSession();

    return () => {
      active = false;
    };
  }, [navigate]);

  const subscribeToPush = async (user) => {
    if (!user) return;
    if (!("serviceWorker" in navigator)) return;
    if (!("Notification" in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC,
    });

    const { data: existingData } = await supabase
      .from("push_subscriptions")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingData) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", user.id);
    }

    await supabase
      .from("push_subscriptions")
      .upsert({
        user_id: user.id,
        subscription: subscription.toJSON(),
      });
  };

  const handleLogin = async () => {
    setStatus("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus("Invalid login credentials");
      return;
    }

    const session = data.session;
    const user = session?.user;

    // fetch role from user_profiles
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();

    // cache for offline use
    const cachedUser = {
      id: user.id,
      email: user.email,
      role: profile?.role || "user",
      full_name: profile?.full_name || "",
    };

    localStorage.setItem("appUser", JSON.stringify(cachedUser));

    subscribeToPush(user).catch((err) => {
      console.warn("Push subscription skipped:", err);
    });

    navigate("/");
  };

  const handleGoogleLogin = async () => {
    setStatus("");

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/login`
      }
    });

    if (error) {
      setStatus("Google sign-in failed. Please try again.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">

        <h1 className="text-2xl font-bold text-center mb-6">ADUAN EXPRESS</h1>

        {/* Email */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            className="w-full p-2 border rounded-md"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        {/* Password */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            className="w-full p-2 border rounded-md"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />          
        </div>

        {/* Login Button */}
        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 font-medium"
        >
          Login
        </button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs text-gray-500">OR</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        {/* Google Login */}
        <button
          onClick={handleGoogleLogin}
          className="w-full border border-gray-300 py-2 rounded-md hover:bg-gray-50 font-medium"
        >
          Continue with Google
        </button>


        {/* Status Message */}
        {status && (
          <p className="text-red-600 text-center mt-3 text-sm">{status}</p>
        )}

        {/* Register Link */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-600">
            Don’t have an account?{" "}
            <Link
              to="/register"
              className="text-blue-600 hover:underline font-medium"
            >
              Register here
            </Link>
          </p>
          <p className="text-sm text-gray-600 mt-2">
            <Link to="/forgot-password" className="text-blue-600 hover:underline">
              Forgot password?
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
