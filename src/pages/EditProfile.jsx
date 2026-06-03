import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function EditProfile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const [fullName, setFullName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [agencyRole, setAgencyRole] = useState("");
  const [role, setRole] = useState("");
  const [isManager, setIsManager] = useState(false);

  const roles = ["user", "manager", "technician"];

  useEffect(() => {
    let active = true;

    async function persistAuthDisplayName(userId, displayName) {
      if (!displayName) return;

      const { error: persistNameError } = await supabase
        .from("user_profiles")
        .upsert({
          id: userId,
          full_name: displayName,
        }, { onConflict: "id" });

      if (!persistNameError) {
        const cachedUser = JSON.parse(localStorage.getItem("appUser") || "{}");
        localStorage.setItem(
          "appUser",
          JSON.stringify({
            ...cachedUser,
            full_name: displayName,
          })
        );
      }
    }

    async function loadProfile() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
        navigate("/login");
        return;
      }

      const { data, error } = await supabase
        .from("user_profiles")
        .select("full_name, contact_no, agency_name, agency_role, role")
        .eq("id", user.id)
        .single();

      const authDisplayName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.user_metadata?.display_name ||
        "";

      if (!error && data && active) {
        setFullName(data.full_name || authDisplayName);
        setContactNo(data.contact_no || "");
        setAgencyName(data.agency_name || "");
        setAgencyRole(data.agency_role || "");
        setRole(data.role || "user");

        if (!data.full_name && authDisplayName) {
          await persistAuthDisplayName(user.id, authDisplayName);
        }
      } else if (active) {
        setFullName(authDisplayName);

        if (authDisplayName) {
          await persistAuthDisplayName(user.id, authDisplayName);
        }
      }

      const cachedUser = JSON.parse(localStorage.getItem("appUser") || "{}");
      const currentRole = cachedUser.role || data?.role || "user";
      if (active) setIsManager(currentRole === "manager");

      if (active) setLoading(false);
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [navigate]);

  const handleSave = async (e) => {
    e.preventDefault();
    setStatus("");
    setSaving(true);

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user) {
      setStatus("Please login again.");
      setSaving(false);
      return;
    }

    const payload = {
      id: user.id,
      full_name: fullName.trim(),
      contact_no: contactNo.trim(),
      agency_name: agencyName.trim(),
      agency_role: agencyRole.trim()
    };

    if (isManager) {
      payload.role = role || "user";
    }

    const { error } = await supabase
      .from("user_profiles")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      setStatus(error.message);
      setSaving(false);
      return;
    }

    const cachedUser = JSON.parse(localStorage.getItem("appUser") || "{}");
    localStorage.setItem(
      "appUser",
      JSON.stringify({
        ...cachedUser,
        full_name: fullName.trim(),
        ...(isManager ? { role: role || cachedUser.role || "user" } : {})
      })
    );

    setStatus("Profile updated successfully.");
    setSaving(false);
  };

  if (loading) return <p className="p-6">Loading profile...</p>;

  return (
    <div className="p-6 w-full min-h-screen bg-gray-100">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Edit Profile</h1>
          <p className="text-gray-500 text-sm">
            Update your personal information 
          </p>
        </div>
      </div>

      {status && (
          <p className={`mb-4 text-sm ${status.includes("successfully") ? "text-green-600" : "text-red-600"}`}>
            {status}
          </p>
      )}

        <form onSubmit={handleSave} className="bg-white shadow-lg rounded-xl p-6 space-y-6">
  
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Full Name</label>
              <input
                className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Contact No</label>
              <input
                className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={contactNo}
                onChange={(e) => setContactNo(e.target.value)}
                placeholder="Contact number"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Agency Name</label>
              <input
                className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                placeholder="Agency name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Agency Role</label>
              <input
                className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={agencyRole}
                onChange={(e) => setAgencyRole(e.target.value)}
                placeholder="Agency role"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">User Role</label>
            {isManager ? (
              <select
                className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            ) : (
              <input
                className="w-full border border-gray-300 rounded-lg p-3 bg-gray-100 text-gray-600"
                value={role || "user"}
                readOnly
              />
            )}
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
