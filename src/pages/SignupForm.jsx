import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export function SignupForm({
  className,
  ...props
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
      applicationServerKey: vapidPublicKey,
    });
  };

  const preparePushForOAuth = async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    const subscription = await getPushSubscription();
    if (!subscription) return;
    localStorage.setItem("pendingPushSubscription", JSON.stringify(subscription.toJSON()));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setStatus("");
    setStatusType("error");

    if (!email || !password) {
      setStatus("Please fill in all fields");
      setStatusType("error");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("Passwords do not match");
      setStatusType("error");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/profile?firstSetup=true`,
      },
    });

    if (error) {
      setStatus(error.message);
      setStatusType("error");
      return;
    }

    setStatus("Registration successful! Please check your email to confirm your signup. The confirmation link will open your profile setup.");
    setStatusType("success");
    setTimeout(() => navigate("/login"), 3000);
  };

  const handleGoogleLogin = async () => {
    setStatus("");
    setStatusType("error");

    try {
      await preparePushForOAuth();
      setStatusType("success");
      setStatus("Notification permission granted. Continue Google sign-in...");
    } catch (err) {
      console.warn("Push pre-subscribe skipped:", err);
      setStatusType("error");
      setStatus("Google sign-in can continue, but notifications were not enabled.");
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login` },
    });

    if (error) {
      setStatusType("error");
      setStatus("Google sign-in failed. Please try again.");
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={handleRegister}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">Create AduanExpress account</h1>
                <p className="text-sm text-balance text-muted-foreground">
                  Enter your email below to create your account
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                        id="register-email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                <FieldDescription>
                  We&apos;ll use this to contact you. We will not share your
                  email with anyone else.
                </FieldDescription>
              </Field>
              <Field>
                <Field className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                        <Input
                       id="register-password"
                       type="password"
                       placeholder="........"
                       value={password}
                       onChange={(e) => setPassword(e.target.value)}
                     />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="confirm-password">
                      Confirm Password
                    </FieldLabel>
                        <Input
                       id="register-confirm-password"
                       type="password"
                       placeholder="........"
                       value={confirmPassword}
                       onChange={(e) => setConfirmPassword(e.target.value)}
                     />
                  </Field>
                </Field>
                <FieldDescription>
                  Must be at least 8 characters long.
                </FieldDescription>
              </Field>
              <Field>
                <Button type="submit">Create Account</Button>
              </Field>
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                Or continue with
              </FieldSeparator>
              <Field className="grid grid-cols-1 gap-4">
                <Button variant="outline" type="button" onClick={handleGoogleLogin} className="w-full">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true" focusable="false">
                        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.198 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.959 3.041l5.657-5.657C34.053 6.053 29.277 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 19.002 13 24 13c3.059 0 5.842 1.154 7.959 3.041l5.657-5.657C34.053 6.053 29.277 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                        <path fill="#4CAF50" d="M24 44c5.176 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.145 35.091 26.715 36 24 36c-5.177 0-9.621-3.325-11.283-7.946l-6.523 5.025C9.505 39.556 16.227 44 24 44z"/>
                        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.05 12.05 0 0 1-4.084 5.571l.003-.002 6.19 5.238C37.052 39.132 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
                      </svg>
                      <span>Continue with Google</span>
                    </Button>
              </Field>
              <FieldDescription className="text-center">                
                Already have an account? <Link to="/login" className="text-blue-600 hover:underline font-medium">
                 Login here
                </Link>
              </FieldDescription>
            </FieldGroup>
          </form>
          <div className="relative hidden bg-muted md:block">
            <img
              src="/placeholder.svg"
              alt="Image"
              className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
            />
          </div>
        </CardContent>
      </Card>
        <FieldDescription className="px-6 text-center">
            By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
            and <a href="#">Privacy Policy</a>.
        </FieldDescription>
          
    {status && (
    <Alert className={statusType === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}>
        <AlertDescription>{status}</AlertDescription>
    </Alert>
    )}
    </div>
  )
}
