import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";

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
          <Alert className="mt-2 border-orange-200 bg-orange-50 text-orange-700">
            <AlertDescription>
              You are offline. Creating, updating, and deleting projects is disabled.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">
            {editingId ? "Edit Project" : "Create Project"}
          </CardTitle>
        </CardHeader>
        <CardContent>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="flex-1"
            disabled={saving || !isOnline}
          />

          <Button
            type="submit"
            disabled={saving || !isOnline}
          >
            {saving ? "Saving..." : editingId ? "Update" : "Create"}
          </Button>

          {editingId && (
            <Button
              type="button"
              onClick={cancelEdit}
              variant="secondary"
            >
              Cancel
            </Button>
          )}
        </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <h2 className="font-semibold">All Projects ({filteredProjects.length})</h2>
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search project..."
            className="w-full sm:w-72"
          />
        </div>

        {loading ? (
          <Alert>
            <AlertDescription>Loading projects...</AlertDescription>
          </Alert>
        ) : filteredProjects.length === 0 ? (
          <Alert>
            <AlertDescription>No projects yet.</AlertDescription>
          </Alert>
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
                  <Button
                    onClick={() => startEdit(project)}
                    variant="link"
                    className="h-auto px-0 text-sm"
                    disabled={!isOnline}
                  >
                    Edit
                  </Button>
                  <Button
                    onClick={() => handleDelete(project)}
                    variant="link"
                    className="h-auto px-0 text-sm text-red-600 hover:text-red-700"
                    disabled={!isOnline}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}

            <div className="pt-2 flex items-center justify-between text-sm">
              <p className="text-gray-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page === 1}
                  variant="outline"
                  size="sm"
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page === totalPages}
                  variant="outline"
                  size="sm"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
        </CardContent>
      </Card>
    </div>
  );
}
