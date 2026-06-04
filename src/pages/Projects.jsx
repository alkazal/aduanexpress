import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const PAGE_SIZE = 8;

  const isOnline = navigator.onLine;

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [projects]
  );

  const filteredProjects = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return sortedProjects;

    return sortedProjects.filter((p) => (p.name || "").toLowerCase().includes(keyword));
  }, [sortedProjects, search]);

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE));

  const pagedProjects = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredProjects.slice(start, start + PAGE_SIZE);
  }, [filteredProjects, page]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [page, totalPages]);

  useEffect(() => {
    let mounted = true;

    async function loadProjects() {
      setLoading(true);

      const localProjects = await db.projects.toArray();
      if (mounted) {
        setProjects(localProjects || []);
      }

      if (navigator.onLine) {
        const { data, error } = await supabase
          .from("projects")
          .select("id, name, updated_at")
          .order("name", { ascending: true });

        if (!error && data) {
          if (mounted) {
            setProjects(data);
          }

          for (const p of data) {
            await db.projects.put({
              id: p.id,
              name: p.name,
              updated_at: p.updated_at || null
            });
          }
        }
      }

      if (mounted) {
        setLoading(false);
      }
    }

    loadProjects();

    const onOnline = () => loadProjects();
    window.addEventListener("online", onOnline);

    return () => {
      mounted = false;
      window.removeEventListener("online", onOnline);
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();

    if (!trimmed) {
      alert("Project name is required");
      return;
    }

    if (!navigator.onLine) {
      alert("Project management requires internet connection");
      return;
    }

    setSaving(true);

    if (editingId) {
      const { data, error } = await supabase
        .from("projects")
        .update({
          name: trimmed,
          updated_at: new Date().toISOString()
        })
        .eq("id", editingId)
        .select("id, name, updated_at")
        .single();

      if (error) {
        alert(`Update failed: ${error.message}`);
        setSaving(false);
        return;
      }

      await db.projects.put({
        id: data.id,
        name: data.name,
        updated_at: data.updated_at || null
      });

      setProjects((prev) => prev.map((p) => (p.id === editingId ? data : p)));
      setEditingId(null);
      setName("");
      setSaving(false);
      return;
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      alert("You must be logged in to create a project");
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({
        name: trimmed,
        created_by: session.user.id,
        updated_at: new Date().toISOString()
      })
      .select("id, name, updated_at")
      .single();

    if (error) {
      alert(`Create failed: ${error.message}`);
      setSaving(false);
      return;
    }

    await db.projects.put({
      id: data.id,
      name: data.name,
      updated_at: data.updated_at || null
    });

    setProjects((prev) => [data, ...prev]);
    setName("");
    setSaving(false);
  }

  function startEdit(project) {
    setEditingId(project.id);
    setName(project.name || "");
  }

  function cancelEdit() {
    setEditingId(null);
    setName("");
  }

  async function handleDelete(project) {
    const ok = confirm(`Delete project \"${project.name}\"?`);
    if (!ok) return;

    if (!navigator.onLine) {
      alert("Project management requires internet connection");
      return;
    }

    const { count, error: usageError } = await supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id);

    if (usageError) {
      alert(`Unable to validate project usage: ${usageError.message}`);
      return;
    }

    const localUsage = await db.reports.where("project_id").equals(project.id).count();
    const usageCount = Math.max(count || 0, localUsage || 0);

    if (usageCount > 0) {
      alert(`Cannot delete project. It is used by ${usageCount} report(s).`);
      return;
    }

    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", project.id);

    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }

    await db.projects.delete(project.id);
    setProjects((prev) => prev.filter((p) => p.id !== project.id));

    if (editingId === project.id) {
      cancelEdit();
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Projects</h1>
        <p className="text-sm text-gray-500">Manager-only project administration</p>
        {!isOnline && (
          <p className="text-xs text-orange-600 mt-1">
            You are offline. Creating, updating, and deleting projects is disabled.
          </p>
        )}
      </div>

      <div className="bg-white border rounded-xl p-5 shadow-sm mb-6">
        <h2 className="font-semibold mb-3">
          {editingId ? "Edit Project" : "Create Project"}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="flex-1 border border-border-light rounded-md px-3 py-2"
            disabled={saving || !isOnline}
          />

          <button
            type="submit"
            disabled={saving || !isOnline}
            className="bg-blue-600 text-white px-4 py-2 rounded-md disabled:opacity-60"
          >
            {saving ? "Saving..." : editingId ? "Update" : "Create"}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md"
            >
              Cancel
            </button>
          )}
        </form>
      </div>

      <div className="bg-white border rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <h2 className="font-semibold">All Projects ({filteredProjects.length})</h2>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search project..."
            className="border border-border-light rounded-md px-3 py-2 text-sm w-full sm:w-72"
          />
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading projects...</p>
        ) : filteredProjects.length === 0 ? (
          <p className="text-sm text-gray-500">No projects yet.</p>
        ) : (
          <div className="space-y-3">
            {pagedProjects.map((project) => (
              <div
                key={project.id}
                className="border border-border-light rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="font-medium text-gray-900">{project.name}</p>
                  <p className="text-xs text-gray-500">ID: {project.id}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEdit(project)}
                    className="text-blue-600 text-sm underline"
                    disabled={!isOnline}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(project)}
                    className="text-red-600 text-sm underline"
                    disabled={!isOnline}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            <div className="pt-2 flex items-center justify-between text-sm">
              <p className="text-gray-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
