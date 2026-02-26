import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function UserProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);
      setError("");

      let data = null;

      const { data: viewData, error: viewError } = await supabase
        .from("user_profiles_with_email")
        .select("id, full_name, role, email, contact_no, agency_name, agency_role, created_at")
        .eq("id", id)
        .single();

      if (!viewError && viewData) {
        data = viewData;
      } else {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("user_profiles")
          .select("id, full_name, role, contact_no, agency_name, agency_role, created_at")
          .eq("id", id)
          .single();

        if (fallbackError) {
          if (active) setError(fallbackError.message);
        } else {
          data = { ...fallbackData, email: null };
        }
      }

      if (active) {
        setProfile(data);
        setLoading(false);
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [id]);

  if (loading) return <p className="p-6">Loading profile...</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!profile) return <p className="p-6">Profile not found.</p>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="text-blue-600 underline mb-4"
      >
        Back
      </button>

      <h1 className="text-2xl font-bold mb-4">User Profile</h1>

      <div className="bg-white shadow rounded-lg p-4 space-y-2">
        <p><b>Full Name:</b> {profile.full_name || "-"}</p>
        <p><b>Email:</b> {profile.email || "Unavailable"}</p>
        <p><b>Role:</b> {profile.role || "user"}</p>
        <p><b>Contact No:</b> {profile.contact_no || "-"}</p>
        <p><b>Agency Name:</b> {profile.agency_name || "-"}</p>
        <p><b>Agency Role:</b> {profile.agency_role || "-"}</p>
        <p><b>Created At:</b> {profile.created_at ? new Date(profile.created_at).toLocaleString() : "-"}</p>
      </div>
    </div>
  );
}
