import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

export default function UsersList() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  useEffect(() => {
    let active = true;

    async function loadUsers() {
      setLoading(true);
      setError("");

      let data = null;

      const { data: viewData, error: viewError } = await supabase
        .from("user_profiles_with_email")
        .select("id, full_name, role, email, created_at")
        .order("full_name", { ascending: true });

      if (!viewError && viewData) {
        data = viewData;
      } else {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("user_profiles")
          .select("id, full_name, role, created_at")
          .order("full_name", { ascending: true });

        if (fallbackError) {
          if (active) setError(fallbackError.message);
        } else {
          data = (fallbackData || []).map((u) => ({ ...u, email: null }));
        }
      }

      if (active && data) {
        setUsers(data);
      }

      if (active) setLoading(false);
    }

    loadUsers();

    return () => {
      active = false;
    };
  }, []);

  const filteredUsers = users.filter((u) => {
  const matchesSearch =
    (u.full_name || "")
      .toLowerCase()
      .includes(searchTerm.toLowerCase()) ||
    (u.email || "")
      .toLowerCase()
      .includes(searchTerm.toLowerCase());

  const matchesRole =
    roleFilter === "all" || (u.role || "user") === roleFilter;

  return matchesSearch && matchesRole;
});

const roleOptions = ["manager", "technician", "user"];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-gray-500 text-sm">
            Manage system users and technicians
          </p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">

        {/* Search */}
        <Input
          type="text"
          placeholder="Search by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full sm:w-72"
        />

        {/* Role Filter */}
        <div className="relative">
          <Select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="cursor-pointer"
          >
            <option value="all">All Roles</option>

            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </option>
            ))}
          </Select>

        </div>
      </div>  

      <p className="text-sm text-gray-500 mb-3">
        {filteredUsers.length} users
      </p>

      {loading && (
        <Alert>
          <AlertDescription>Loading users...</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert className="border-red-200 bg-red-50 text-red-700">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && !error && users.length === 0 && (
        <Alert>
          <AlertDescription>No users found.</AlertDescription>
        </Alert>
      )}

      <Card className="overflow-x-auto">
        <Table className="min-w-full">
          
          {/* Table Head */}
          <TableHeader className="bg-gray-50 border-b">
            <TableRow>
              <TableHead className="text-left px-6 py-3 font-semibold text-gray-600">User</TableHead>
              <TableHead className="text-left px-6 py-3 font-semibold text-gray-600">Email</TableHead>
              <TableHead className="text-left px-6 py-3 font-semibold text-gray-600">Role</TableHead>
              <TableHead className="text-left px-6 py-3 font-semibold text-gray-600">Joined</TableHead>
            </TableRow>
          </TableHeader>

          {/* Table Body */}
          <TableBody className="divide-y">
            {filteredUsers.map((u) => (
              <TableRow
                key={u.id}
                onClick={() => navigate(`/users/${u.id}`)}
                className="cursor-pointer hover:bg-gray-50 transition"
              >
                
                {/* Name + Avatar */}
                <TableCell className="px-6 py-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-blue-600 font-semibold text-xs">
                      {(u.full_name || "U")
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </span>
                  </div>

                  <span className="font-medium text-gray-900">
                    {u.full_name || "Unnamed User"}
                  </span>
                </TableCell>

                {/* Email */}
                <TableCell className="px-6 py-4 text-gray-600">
                  {u.email || "No email"}
                </TableCell>

                {/* Role Badge */}
                <TableCell className="px-6 py-4">
                  <Badge
                    variant="secondary"
                    className={`inline-block px-3 py-1 text-xs rounded-full hover:bg-transparent ${
                      u.role === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : u.role === "technician"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {u.role || "user"}
                  </Badge>
                </TableCell>

                {/* Joined Date */}
                <TableCell className="px-6 py-4 text-gray-500">
                  {new Date(u.created_at).toLocaleDateString()}
                </TableCell>

              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

    </div>
  );
}
