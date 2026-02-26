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

  useEffect(() => {
    let active = true;

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

      if (!error && data && active) {
        setFullName(data.full_name || "");
        setContactNo(data.contact_no || "");
        setAgencyName(data.agency_name || "");
        setAgencyRole(data.agency_role || "");
        setRole(data.role || "user");
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
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Edit Profile</h1>

      {status && (
        <p className={`mb-4 text-sm ${status.includes("successfully") ? "text-green-600" : "text-red-600"}`}>
          {status}
        </p>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Full Name</label>
          <input
            className="w-full border rounded-md p-2"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Contact No</label>
          <input
            className="w-full border rounded-md p-2"
            value={contactNo}
            onChange={(e) => setContactNo(e.target.value)}
            placeholder="Contact number"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Agency Name</label>
          <input
            className="w-full border rounded-md p-2"
            value={agencyName}
            onChange={(e) => setAgencyName(e.target.value)}
            placeholder="Agency name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Agency Role</label>
          <input
            className="w-full border rounded-md p-2"
            value={agencyRole}
            onChange={(e) => setAgencyRole(e.target.value)}
            placeholder="Agency role"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">User Role</label>
          {isManager ? (
            <select
              className="w-full border rounded-md p-2"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="user">User</option>
              <option value="manager">Manager</option>
              <option value="technician">Technician</option>
            </select>
          ) : (
            <input
              className="w-full border rounded-md p-2 bg-gray-100"
              value={role || "user"}
              readOnly
            />
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 font-medium"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
