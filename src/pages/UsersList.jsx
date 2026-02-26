import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function UsersList() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold">Users</h1>
      </div>

      {loading && <p>Loading users...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && users.length === 0 && (
        <p className="text-gray-500">No users found.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => navigate(`/users/${u.id}`)}
            className="text-left bg-white shadow rounded-lg p-4 hover:bg-gray-50 border"
          >
            <p className="font-semibold text-lg">{u.full_name || "Unnamed User"}</p>
            <p className="text-sm text-gray-500">Role: {u.role || "user"}</p>
            <p className="text-sm text-gray-500">
              Email: {u.email || "Unavailable"}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
