import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  // Check if user is automatically logged in from magic link
  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setStatus("Invalid reset link. Please request again.");
        setLoading(false);
        return;
      }

      setLoading(false);
    }

    checkSession();
  }, []);

  async function handleUpdatePassword() {
    if (!password) {
      setStatus("Please enter a new password");
      return;
    }

    setStatus("Updating password...");

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Password updated successfully! Redirecting...");
    
    setTimeout(() => {
      navigate("/login");
    }, 1500);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Alert className="w-full max-w-sm">
          <AlertDescription>Loading...</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-400 to-white px-4 py-8">
      <Card className="w-full max-w-md border-0 shadow-xl">
        <CardHeader>
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-lg font-semibold">AE</span>
            </div>
          </div>
          <CardTitle className="text-center">Reset Password</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Enter new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button onClick={handleUpdatePassword} className="w-full">
            Update Password
          </Button>

          {status && (
            <Alert>
              <AlertDescription>{status}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
