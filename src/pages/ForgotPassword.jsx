import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");

  const handleReset = async () => {
    setStatus("");

    if (!email) {
      setStatus("Please enter your email");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Password reset email sent! Please check your inbox.");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-400 to-white px-4 py-8">
      <Card className="w-full max-w-md border-0 shadow-xl">
        <CardHeader>
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-lg font-semibold">AE</span>
            </div>
          </div>
          <CardTitle className="text-center">Forgot Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <Button onClick={handleReset} className="w-full">
            Send Reset Link
          </Button>

          {status && (
            <Alert>
              <AlertDescription>{status}</AlertDescription>
            </Alert>
          )}

          <div className="text-center pt-2">
            <p className="text-sm text-gray-600">
              Remember your password?{" "}
              <Link to="/login" className="text-blue-600 hover:underline font-medium">
                Back to login
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
