import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function UserProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

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

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus("");

    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({
        full_name: profile.full_name || null,
        role: profile.role || "user",
        contact_no: profile.contact_no || null,
        agency_name: profile.agency_name || null,
        agency_role: profile.agency_role || null
      })
      .eq("id", profile.id);

    if (updateError) {
      setStatus(updateError.message);
      setSaving(false);
      return;
    }

    setStatus("Profile updated successfully.");
    setSaving(false);
  };

  return (
    
    <div className="p-6">
      {/*Back button*/}
      <button
        onClick={() => navigate(-1)}
        className="text-blue-600 underline mb-6"
      >
        Back
      </button>

      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold">User Profile</h1>
          <p className="text-gray-500 text-sm">
            Manage user information and role
          </p>
        </div>
      </div>

      {/*Status message*/}
      {status && (
        <p 
        className={`mb-4 text-sm ${
          status.includes("successfully") ? "text-green-600" : "text-red-600"
          }`}
        >
          {status}
        </p>
      )}

      <form 
      onSubmit={handleSave} 
      className="bg-white shadow-lg rounded-xl p-6 space-y-6 w-full">
        <div>
          <label className="block text-sm font-medium mb-1">Full Name</label>
          <input
            className="w-full border border-border-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={profile.full_name || ""}
            onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            className="w-full border border-border-300 rounded-lg p-3 bg-gray-100 text-gray-600"
            value={profile.email || "Unavailable"}
            readOnly
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Role</label>
          <select
            className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={profile.role || "user"}
            onChange={(e) => setProfile({ ...profile, role: e.target.value })}
          >
            <option value="user">User</option>
            <option value="manager">Manager</option>
            <option value="technician">Technician</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Contact No</label>
          <input
            className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={profile.contact_no || ""}
            onChange={(e) => setProfile({ ...profile, contact_no: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Agency Name</label>
            <input
              className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={profile.agency_name || ""}
              onChange={(e) =>
                setProfile({ ...profile, agency_name: e.target.value })
              }
            />
          </div>
        </div>  

        <div>
            <label className="block text-sm font-medium mb-1">Agency Role</label>
            <input
              className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={profile.agency_role || ""}
              onChange={(e) =>
                setProfile({ ...profile, agency_role: e.target.value })
              }
            />
          </div>

        <div>
          <label className="block text-sm font-medium mb-1">Joined At</label>
          <input
            className="w-full border border-gray-300 rounded-lg p-3 bg-gray-100 text-gray-600"
            value={
              profile.created_at
                ? new Date(profile.created_at).toLocaleString()
                : "-"
            }
            readOnly
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-medium"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
