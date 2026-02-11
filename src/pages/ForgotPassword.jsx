import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

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
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">

        <h1 className="text-2xl font-bold text-center mb-6">Forgot Password</h1>

        {/* Email input */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            className="w-full p-2 border rounded-md"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {/* Reset button */}
        <button
          onClick={handleReset}
          className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 font-medium"
        >
          Send Reset Link
        </button>

        {/* Status message */}
        {status && (
          <p className="text-center mt-3 text-sm text-gray-700">{status}</p>
        )}

        {/* Back to Login */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-600">
            Remember your password?{" "}
            <Link
              to="/login"
              className="text-blue-600 hover:underline font-medium"
            >
              Back to login
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
