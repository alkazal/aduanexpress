import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useNavigate } from "react-router-dom";
import { urlBase64ToUint8Array } from "../lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Alert, AlertDescription } from "../components/ui/alert";

const PUSH_TABLES = ["push_subscriptions"];

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("error");

  const navigate = useNavigate();

  const formatErrorDetails = (error) => {
    if (!error) return "Unknown error";
    const code = error.code ? `code=${error.code}` : "";
    const message = error.message ? `message=${error.message}` : "";
    const details = error.details ? `details=${error.details}` : "";
    const hint = error.hint ? `hint=${error.hint}` : "";
    return [code, message, details, hint].filter(Boolean).join(" | ");
  };

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

    const attemptErrors = [];

    for (const tableName of PUSH_TABLES) {
      const payload = {
        user_id: userId,
        subscription: subscriptionJson,
      };

      let { error } = await supabase
        .from(tableName)
        .upsert(payload, { onConflict: "user_id" });

      if (error?.code === "42P10") {
        const retry = await supabase
          .from(tableName)
          .upsert(payload);
        error = retry.error;
      }

      if (!error) {
        localStorage.removeItem("pendingPushSubscription");
        return;
      }

      attemptErrors.push({ tableName, error });

      if (error.code !== "42P01") {
        throw new Error(
          `Push save failed on ${tableName}: ${formatErrorDetails(error)}`
        );
      }
    }

    const attempts = attemptErrors
      .map(({ tableName, error }) => `${tableName}: ${formatErrorDetails(error)}`)
      .join(" || ");
    throw new Error(`Push subscription table not found. Attempts -> ${attempts}`);
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

    async function hydrateSession(existingSession) {
      const session = existingSession || (await supabase.auth.getSession()).data.session;
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
          setStatus(`Login succeeded, but notification subscription was not saved. ${formatErrorDetails(error)}`);
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

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN") return;
      hydrateSession(session);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);g

  const handleLogin = async (e) => {
    e.preventDefault();
    setStatus("");
    setStatusType("error");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setStatusType("error");
        setStatus(error.message || "Invalid login credentials");
        return;
      }

      const user = data?.user || data?.session?.user;
      if (!user) {
        setStatusType("error");
        setStatus("Login succeeded but user session is not available yet. Please try again.");
        return;
      }

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
        setStatus(`Login successful, but notification subscription failed. ${formatErrorDetails(err)}`);
        localStorage.setItem(
          "postLoginNotificationStatus",
          JSON.stringify({
            message: "Login successful, but notification subscription failed.",
            type: "error",
          })
        );
      }

      setTimeout(() => navigate("/", { replace: true }), 1000);
    } catch (err) {
      console.error("Unexpected login error:", err);
      setStatusType("error");
      setStatus(`Unexpected login error. ${formatErrorDetails(err)}`);
    }
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
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-5xl">

        <div className={cn("flex flex-col gap-6")}>
          <Card className="overflow-hidden p-0">
            <CardContent className="grid p-0 md:grid-cols-2">
              <form className="p-6 md:p-10" onSubmit={handleLogin}>
                <FieldGroup className="gap-5">
                  <div className="flex flex-col items-center gap-2 text-center md:items-start md:text-left">
                    <h1 className="text-2xl font-semibold tracking-tight">Welcome to AduanExpress</h1>
                    <p className="text-pretty text-muted-foreground">
                      Login to your AE account
                    </p>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="login-email">Email</FieldLabel>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </Field>
                  <Field>
                    <div className="flex items-center">
                      <FieldLabel htmlFor="login-password">Password</FieldLabel>
                      <Link to="/forgot-password" className="ml-auto text-sm underline-offset-2 hover:underline">
                        Forgot your password?
                      </Link>
                    </div>
                    <Input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="........"
                    />
                  </Field>
                  <Field>
                    <Button type="submit">
                      Login
                    </Button>
                  </Field>
                  <FieldSeparator>
                    Or continue with
                  </FieldSeparator>
                  <Field className="grid grid-cols-1 gap-4">

                    {/* <Button variant="outline" type="button">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <path
                          d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
                          fill="currentColor"
                        />
                      </svg>
                      <span className="sr-only">Login with Apple</span>
                    </Button> */}
                    <Button variant="outline" type="button" onClick={handleGoogleLogin} className="w-full">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true" focusable="false">
                        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.198 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.959 3.041l5.657-5.657C34.053 6.053 29.277 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 19.002 13 24 13c3.059 0 5.842 1.154 7.959 3.041l5.657-5.657C34.053 6.053 29.277 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                        <path fill="#4CAF50" d="M24 44c5.176 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.145 35.091 26.715 36 24 36c-5.177 0-9.621-3.325-11.283-7.946l-6.523 5.025C9.505 39.556 16.227 44 24 44z"/>
                        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.05 12.05 0 0 1-4.084 5.571l.003-.002 6.19 5.238C37.052 39.132 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
                      </svg>
                      <span>Continue with Google</span>
                    </Button>
                    
                    {/* <Button variant="outline" type="button">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <path
                          d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z"
                          fill="currentColor"
                        />
                      </svg>
                      <span className="sr-only">Login with Meta</span>
                    </Button> */}

                  </Field>
                  <FieldDescription className="text-center md:text-left">
                    Don&apos;t have an account? <Link to="/register">Sign up</Link>
                  </FieldDescription>
                </FieldGroup>

                {status && (
                  <Alert className={statusType === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}>
                    <AlertDescription className="whitespace-pre-line break-words">
                      {status}
                    </AlertDescription>
                  </Alert>
                )}
                
              </form>
              <div className="relative hidden min-h-[560px] bg-muted md:block">
                <img
                  src="/placeholder.svg"
                  alt="AduanExpress illustration"
                  className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
                <div className="relative z-10 flex h-full flex-col justify-end p-10 text-white">
                  <p className="text-lg font-semibold">AduanExpress</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/90">
                    Connect with us to seamlessly manage, track, and resolve your complaints with absolute efficiency.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <FieldDescription className="px-6 text-center">
            By clicking continue, you agree to our Terms of Service and Privacy Policy.
          </FieldDescription>
        </div>
      </div>
    </div>
  );
}
