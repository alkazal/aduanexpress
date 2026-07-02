import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select } from "../components/ui/select";

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

  if (loading) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>Loading profile...</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <Alert className="border-red-200 bg-red-50 text-red-700">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>Profile not found.</AlertDescription>
        </Alert>
      </div>
    );
  }

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
    navigate("/dashboard");
  };

  return (
    
    <div className="p-6">
      {/*Back button*/}
      <Button
        onClick={() => navigate(-1)}
        variant="link"
        className="mb-6 px-0"
      >
        Back
      </Button>

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
        <Alert className={`mb-4 ${status.includes("successfully") ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      )}

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>User Profile</CardTitle>
        </CardHeader>
        <CardContent>
      <form 
      onSubmit={handleSave} 
      className="space-y-6 w-full">
        <div className="space-y-2">
          <Label htmlFor="user-full-name">Full Name</Label>
          <Input
            id="user-full-name"
            value={profile.full_name || ""}
            onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="user-email">Email</Label>
          <Input
            id="user-email"
            className="bg-gray-100 text-gray-600"
            value={profile.email || "Unavailable"}
            readOnly
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="user-role">Role</Label>
          <Select
            id="user-role"
            value={profile.role || "user"}
            onChange={(e) => setProfile({ ...profile, role: e.target.value })}
          >
            <option value="user">User</option>
            <option value="manager">Manager</option>
            <option value="technician">Technician</option>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="user-contact">Contact No</Label>
          <Input
            id="user-contact"
            value={profile.contact_no || ""}
            onChange={(e) => setProfile({ ...profile, contact_no: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="user-agency-name">Agency Name</Label>
            <Input
              id="user-agency-name"
              value={profile.agency_name || ""}
              onChange={(e) =>
                setProfile({ ...profile, agency_name: e.target.value })
              }
            />
          </div>
        </div>  

        <div className="space-y-2">
            <Label htmlFor="user-agency-role">Agency Role</Label>
            <Input
              id="user-agency-role"
              value={profile.agency_role || ""}
              onChange={(e) =>
                setProfile({ ...profile, agency_role: e.target.value })
              }
            />
          </div>

        <div className="space-y-2">
          <Label htmlFor="user-joined">Joined At</Label>
          <Input
            id="user-joined"
            className="bg-gray-100 text-gray-600"
            value={
              profile.created_at
                ? new Date(profile.created_at).toLocaleString()
                : "-"
            }
            readOnly
          />
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
