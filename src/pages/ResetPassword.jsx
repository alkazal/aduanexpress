import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";

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
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-400 to-white px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">

        {/* Logo and Title */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-lg font-semibold">AE</span>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center mb-6">Reset Password</h1>

        {/* New password */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">
            New Password
          </label>
          <input
            type="password"
            className="w-full p-2 border border-border-light rounded-md"
            placeholder="Enter new password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          onClick={handleUpdatePassword}
          className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 font-medium"
        >
          Update Password
        </button>

        {status && (
          <p className="text-center mt-4 text-gray-700">{status}</p>
        )}
      </div>
    </div>
  );
}
