import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select } from "../components/ui/select";

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

  if (loading) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>Loading profile...</AlertDescription>
        </Alert>
      </div>
    );
  }

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
        <Alert className={`mb-4 ${status.includes("successfully") ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      )}

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Edit Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
  
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="profile-full-name">Full Name</Label>
              <Input
                id="profile-full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-contact-no">Contact No</Label>
              <Input
                id="profile-contact-no"
                value={contactNo}
                onChange={(e) => setContactNo(e.target.value)}
                placeholder="Contact number"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="profile-agency-name">Agency Name</Label>
              <Input
                id="profile-agency-name"
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                placeholder="Agency name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-agency-role">Agency Role</Label>
              <Input
                id="profile-agency-role"
                value={agencyRole}
                onChange={(e) => setAgencyRole(e.target.value)}
                placeholder="Agency role"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-role">User Role</Label>
            {isManager ? (
              <Select
                id="profile-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </Select>
            ) : (
              <Input
                id="profile-role"
                className="bg-gray-100 text-gray-600"
                value={role || "user"}
                readOnly
              />
            )}
          </div>

          <Button
            type="submit"
            disabled={saving}
            className="w-full"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </form>
          </CardContent>
        </Card>
      </div>
  );
}
