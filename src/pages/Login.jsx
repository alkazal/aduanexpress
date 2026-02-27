import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Link, useNavigate } from "react-router-dom";
import { urlBase64ToUint8Array } from "../lib/utils";

const PUSH_TABLES = ["push_subscriptions", "push_subcription"];

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("error");

  const navigate = useNavigate();

  const getPushSubscription = async () => {
    if (!("serviceWorker" in navigator)) return null;

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) return existing;

    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC;
    if (!vapidPublicKey) throw new Error("Missing VITE_VAPID_PUBLIC");

    return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  };

  const upsertSubscription = async (userId, subscriptionJson) => {
    if (!userId || !subscriptionJson) return;

    for (const tableName of PUSH_TABLES) {
      const { error } = await supabase
        .from(tableName)
        .upsert({
          user_id: userId,
          subscription: subscriptionJson,
        });

      if (!error) {
        localStorage.removeItem("pendingPushSubscription");
        return;
      }

      if (error.code !== "42P01") {
        throw error;
      }
    }

    throw new Error("Push subscription table not found");
  };

  const subscribeToPush = async (user) => {
    if (!user) return;
    if (!("Notification" in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const subscription = await getPushSubscription();
    if (!subscription) return;

    await upsertSubscription(user.id, subscription.toJSON());
  };

  const preparePushForOAuth = async () => {
    if (!("Notification" in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const subscription = await getPushSubscription();
    if (!subscription) return;

    localStorage.setItem(
      "pendingPushSubscription",
      JSON.stringify(subscription.toJSON())
    );
  };

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

      const pendingSubscription = localStorage.getItem("pendingPushSubscription");
      if (pendingSubscription) {
        try {
          await upsertSubscription(user.id, JSON.parse(pendingSubscription));
          setStatusType("success");
          setStatus("Notification subscription saved.");
          localStorage.setItem(
            "postLoginNotificationStatus",
            JSON.stringify({
              message: "Notification subscription saved.",
              type: "success",
            })
          );
          setTimeout(() => {
            if (active) navigate("/");
          }, 1200);
          return;
        } catch (error) {
          console.warn("Failed to persist pending push subscription:", error);
          setStatusType("error");
          setStatus("Login succeeded, but notification subscription was not saved.");
          localStorage.setItem(
            "postLoginNotificationStatus",
            JSON.stringify({
              message: "Login succeeded, but notification subscription was not saved.",
              type: "error",
            })
          );
          setTimeout(() => {
            if (active) navigate("/");
          }, 1400);
          return;
        }
      }

      navigate("/");
    }

    hydrateSession();

    return () => {
      active = false;
    };
  }, [navigate]);

  const handleLogin = async () => {
    setStatus("");
    setStatusType("error");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatusType("error");
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

    try {
      await subscribeToPush(user);
      setStatusType("success");
      setStatus("Login successful. Notification subscription saved.");
      localStorage.setItem(
        "postLoginNotificationStatus",
        JSON.stringify({
          message: "Login successful. Notification subscription saved.",
          type: "success",
        })
      );
    } catch (err) {
      console.warn("Push subscription skipped:", err);
      setStatusType("error");
      setStatus("Login successful, but notification subscription failed.");
      localStorage.setItem(
        "postLoginNotificationStatus",
        JSON.stringify({
          message: "Login successful, but notification subscription failed.",
          type: "error",
        })
      );
    }

    setTimeout(() => navigate("/"), 1000);
  };

  const handleGoogleLogin = async () => {
    setStatus("");
    setStatusType("error");

    try {
      await preparePushForOAuth();
      setStatusType("success");
      setStatus("Notification permission granted. Continue Google sign-in...");
    } catch (error) {
      console.warn("Push pre-subscribe skipped:", error);
      setStatusType("error");
      setStatus("Google sign-in can continue, but notifications were not enabled.");
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/login`
      }
    });

    if (error) {
      setStatusType("error");
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
          <p className={`text-center mt-3 text-sm ${statusType === "success" ? "text-green-600" : "text-red-600"}`}>
            {status}
          </p>
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
