import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [reportTypes, setReportTypes] = useState([]);
  const [projectDepartments, setProjectDepartments] = useState([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [selectedTypeProjectId, setSelectedTypeProjectId] = useState("");
  const [typeName, setTypeName] = useState("");
  const [editingTypeId, setEditingTypeId] = useState(null);
  const [typeSearch, setTypeSearch] = useState("");
  const [selectedDepartmentProjectId, setSelectedDepartmentProjectId] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [editingDepartmentId, setEditingDepartmentId] = useState(null);
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [typeSaving, setTypeSaving] = useState(false);
  const [departmentSaving, setDepartmentSaving] = useState(false);
  const [isMobileHeaderCompact, setIsMobileHeaderCompact] = useState(false);
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

  const sortedReportTypes = useMemo(
    () => [...reportTypes].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [reportTypes]
  );

  const filteredReportTypes = useMemo(() => {
    if (!selectedTypeProjectId) return [];

    const keyword = typeSearch.trim().toLowerCase();

    return sortedReportTypes.filter((rt) => {
      if (rt.project_id !== selectedTypeProjectId) return false;
      if (!keyword) return true;
      return (rt.name || "").toLowerCase().includes(keyword);
    });
  }, [selectedTypeProjectId, sortedReportTypes, typeSearch]);

  const sortedProjectDepartments = useMemo(
    () => [...projectDepartments].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [projectDepartments]
  );

  const filteredProjectDepartments = useMemo(() => {
    if (!selectedDepartmentProjectId) return [];

    const keyword = departmentSearch.trim().toLowerCase();

    return sortedProjectDepartments.filter((dep) => {
      if (dep.project_id !== selectedDepartmentProjectId) return false;
      if (!keyword) return true;
      return (dep.name || "").toLowerCase().includes(keyword);
    });
  }, [selectedDepartmentProjectId, sortedProjectDepartments, departmentSearch]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (!sortedProjects.length) {
      setSelectedTypeProjectId("");
      setSelectedDepartmentProjectId("");
      return;
    }

    if (!selectedTypeProjectId || !sortedProjects.some((p) => p.id === selectedTypeProjectId)) {
      setSelectedTypeProjectId(sortedProjects[0].id);
    }

    if (!selectedDepartmentProjectId || !sortedProjects.some((p) => p.id === selectedDepartmentProjectId)) {
      setSelectedDepartmentProjectId(sortedProjects[0].id);
    }
  }, [sortedProjects, selectedTypeProjectId, selectedDepartmentProjectId]);

  useEffect(() => {
    let mounted = true;

    async function loadProjects() {
      setLoading(true);

      const localProjects = await db.projects.toArray();
      const localReportTypes = await db.reportTypes.toArray();
      const localProjectDepartments = await db.projectDepartments.toArray();
      if (mounted) {
        setProjects(localProjects || []);
        setReportTypes(localReportTypes || []);
        setProjectDepartments(localProjectDepartments || []);
      }

      if (navigator.onLine) {
        const { data, error } = await supabase
          .from("projects")
          .select("id, name, updated_at")
          .order("name", { ascending: true });

        const { data: typeData, error: typeError } = await supabase
          .from("report_types")
          .select("id, project_id, name, updated_at")
          .order("name", { ascending: true });

        const { data: departmentData, error: departmentError } = await supabase
          .from("project_departments")
          .select("id, project_id, name, updated_at")
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

        if (!typeError && typeData) {
          if (mounted) {
            setReportTypes(typeData);
          }

          for (const rt of typeData) {
            await db.reportTypes.put({
              id: rt.id,
              project_id: rt.project_id,
              name: rt.name,
              updated_at: rt.updated_at || null
            });
          }
        }

        if (!departmentError && departmentData) {
          if (mounted) {
            setProjectDepartments(departmentData);
          }

          for (const dep of departmentData) {
            await db.projectDepartments.put({
              id: dep.id,
              project_id: dep.project_id,
              name: dep.name,
              updated_at: dep.updated_at || null
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

  function startTypeEdit(reportType) {
    setEditingTypeId(reportType.id);
    setTypeName(reportType.name || "");
    setSelectedTypeProjectId(reportType.project_id || "");
  }

  function cancelTypeEdit() {
    setEditingTypeId(null);
    setTypeName("");
  }

  async function handleTypeSubmit(e) {
    e.preventDefault();

    const trimmed = typeName.trim();

    if (!selectedTypeProjectId) {
      alert("Please select a project for report type.");
      return;
    }

    if (!trimmed) {
      alert("Report type name is required");
      return;
    }

    if (!navigator.onLine) {
      alert("Report type management requires internet connection");
      return;
    }

    setTypeSaving(true);

    if (editingTypeId) {
      const { data, error } = await supabase
        .from("report_types")
        .update({
          project_id: selectedTypeProjectId,
          name: trimmed,
          updated_at: new Date().toISOString()
        })
        .eq("id", editingTypeId)
        .select("id, project_id, name, updated_at")
        .single();

      if (error) {
        alert(`Update failed: ${error.message}`);
        setTypeSaving(false);
        return;
      }

      await db.reportTypes.put({
        id: data.id,
        project_id: data.project_id,
        name: data.name,
        updated_at: data.updated_at || null
      });

      setReportTypes((prev) => prev.map((rt) => (rt.id === editingTypeId ? data : rt)));
      cancelTypeEdit();
      setTypeSaving(false);
      return;
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      alert("You must be logged in to create a report type");
      setTypeSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("report_types")
      .insert({
        project_id: selectedTypeProjectId,
        name: trimmed,
        created_by: session.user.id,
        updated_at: new Date().toISOString()
      })
      .select("id, project_id, name, updated_at")
      .single();

    if (error) {
      alert(`Create failed: ${error.message}`);
      setTypeSaving(false);
      return;
    }

    await db.reportTypes.put({
      id: data.id,
      project_id: data.project_id,
      name: data.name,
      updated_at: data.updated_at || null
    });

    setReportTypes((prev) => [data, ...prev]);
    setTypeName("");
    setTypeSaving(false);
  }

  async function handleTypeDelete(reportType) {
    const ok = confirm(`Delete report type "${reportType.name}"?`);
    if (!ok) return;

    if (!navigator.onLine) {
      alert("Report type management requires internet connection");
      return;
    }

    const { count, error: usageError } = await supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("project_id", reportType.project_id)
      .eq("report_type", reportType.name);

    if (usageError) {
      alert(`Unable to validate report type usage: ${usageError.message}`);
      return;
    }

    const localUsage = await db.reports
      .where("project_id")
      .equals(reportType.project_id)
      .filter((r) => r.report_type === reportType.name)
      .count();

    const usageCount = Math.max(count || 0, localUsage || 0);

    if (usageCount > 0) {
      alert(`Cannot delete report type. It is used by ${usageCount} report(s).`);
      return;
    }

    const { error } = await supabase
      .from("report_types")
      .delete()
      .eq("id", reportType.id);

    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }

    await db.reportTypes.delete(reportType.id);
    setReportTypes((prev) => prev.filter((rt) => rt.id !== reportType.id));

    if (editingTypeId === reportType.id) {
      cancelTypeEdit();
    }
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
    await db.reportTypes.where("project_id").equals(project.id).delete();
    await db.projectDepartments.where("project_id").equals(project.id).delete();
    setProjects((prev) => prev.filter((p) => p.id !== project.id));
    setReportTypes((prev) => prev.filter((rt) => rt.project_id !== project.id));
    setProjectDepartments((prev) => prev.filter((dep) => dep.project_id !== project.id));

    if (editingId === project.id) {
      cancelEdit();
    }
  }

  function startDepartmentEdit(department) {
    setEditingDepartmentId(department.id);
    setDepartmentName(department.name || "");
    setSelectedDepartmentProjectId(department.project_id || "");
  }

  function cancelDepartmentEdit() {
    setEditingDepartmentId(null);
    setDepartmentName("");
  }

  async function handleDepartmentSubmit(e) {
    e.preventDefault();

    const trimmed = departmentName.trim();

    if (!selectedDepartmentProjectId) {
      alert("Please select a project for department.");
      return;
    }

    if (!trimmed) {
      alert("Department name is required");
      return;
    }

    if (!navigator.onLine) {
      alert("Department management requires internet connection");
      return;
    }

    setDepartmentSaving(true);

    if (editingDepartmentId) {
      const { data, error } = await supabase
        .from("project_departments")
        .update({
          project_id: selectedDepartmentProjectId,
          name: trimmed,
          updated_at: new Date().toISOString()
        })
        .eq("id", editingDepartmentId)
        .select("id, project_id, name, updated_at")
        .single();

      if (error) {
        alert(`Update failed: ${error.message}`);
        setDepartmentSaving(false);
        return;
      }

      await db.projectDepartments.put({
        id: data.id,
        project_id: data.project_id,
        name: data.name,
        updated_at: data.updated_at || null
      });

      setProjectDepartments((prev) => prev.map((dep) => (dep.id === editingDepartmentId ? data : dep)));
      cancelDepartmentEdit();
      setDepartmentSaving(false);
      return;
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      alert("You must be logged in to create a department");
      setDepartmentSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("project_departments")
      .insert({
        project_id: selectedDepartmentProjectId,
        name: trimmed,
        created_by: session.user.id,
        updated_at: new Date().toISOString()
      })
      .select("id, project_id, name, updated_at")
      .single();

    if (error) {
      alert(`Create failed: ${error.message}`);
      setDepartmentSaving(false);
      return;
    }

    await db.projectDepartments.put({
      id: data.id,
      project_id: data.project_id,
      name: data.name,
      updated_at: data.updated_at || null
    });

    setProjectDepartments((prev) => [data, ...prev]);
    setDepartmentName("");
    setDepartmentSaving(false);
  }

  async function handleDepartmentDelete(department) {
    const ok = confirm(`Delete department "${department.name}"?`);
    if (!ok) return;

    if (!navigator.onLine) {
      alert("Department management requires internet connection");
      return;
    }

    const { count, error: usageError } = await supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("project_id", department.project_id)
      .eq("department", department.name);

    if (usageError) {
      alert(`Unable to validate department usage: ${usageError.message}`);
      return;
    }

    const localUsage = await db.reports
      .where("project_id")
      .equals(department.project_id)
      .filter((r) => r.department === department.name)
      .count();

    const usageCount = Math.max(count || 0, localUsage || 0);

    if (usageCount > 0) {
      alert(`Cannot delete department. It is used by ${usageCount} report(s).`);
      return;
    }

    const { error } = await supabase
      .from("project_departments")
      .delete()
      .eq("id", department.id);

    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }

    await db.projectDepartments.delete(department.id);
    setProjectDepartments((prev) => prev.filter((dep) => dep.id !== department.id));

    if (editingDepartmentId === department.id) {
      cancelDepartmentEdit();
    }
  }

  return (
    <div
        className={`sticky top-16 z-20 mx-0 px-2 mb-4 bg-gray-50/95 backdrop-blur border-b border-gray-100 transition-all duration-200 ${
          isMobileHeaderCompact ? "pt-2 pb-2 shadow-sm" : "pt-2 pb-3"
        } sm:static sm:mx-0 sm:px-0 sm:pt-0 sm:pb-0 sm:bg-transparent sm:backdrop-blur-0 sm:border-b-0 sm:shadow-none`}
      >
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Projects</h1>
        <p className="text-sm text-gray-500">Manager-only project administration</p>
        {!isOnline && (
          <Alert className="mt-2 border-orange-200 bg-orange-50 text-orange-700">
            <AlertDescription>
              You are offline. Creating, updating, and deleting projects, report types, and departments is disabled.
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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Project Report Types</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleTypeSubmit} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
            <Select
              value={selectedTypeProjectId}
              onChange={(e) => setSelectedTypeProjectId(e.target.value)}
              disabled={!isOnline || projects.length === 0 || typeSaving}
            >
              <option value="">Select project</option>
              {sortedProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>

            <Input
              value={typeName}
              onChange={(e) => setTypeName(e.target.value)}
              placeholder="Report type name"
              disabled={!isOnline || !selectedTypeProjectId || typeSaving}
            />

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={!isOnline || !selectedTypeProjectId || typeSaving}
              >
                {typeSaving ? "Saving..." : editingTypeId ? "Update" : "Create"}
              </Button>
              {editingTypeId && (
                <Button type="button" variant="secondary" onClick={cancelTypeEdit}>
                  Cancel
                </Button>
              )}
            </div>
          </form>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="font-semibold">
              Types in Selected Project ({filteredReportTypes.length})
            </h2>
            <Input
              value={typeSearch}
              onChange={(e) => setTypeSearch(e.target.value)}
              placeholder="Search report type..."
              className="w-full sm:w-72"
              disabled={!selectedTypeProjectId}
            />
          </div>

          {!selectedTypeProjectId ? (
            <Alert>
              <AlertDescription>Select a project to manage report types.</AlertDescription>
            </Alert>
          ) : filteredReportTypes.length === 0 ? (
            <Alert>
              <AlertDescription>No report types for this project yet.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              {filteredReportTypes.map((reportType) => (
                <div
                  key={reportType.id}
                  className="border border-border-light rounded-lg p-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-medium text-gray-900">{reportType.name}</p>
                    <p className="text-xs text-gray-500">ID: {reportType.id}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => startTypeEdit(reportType)}
                      variant="link"
                      className="h-auto px-0 text-sm"
                      disabled={!isOnline}
                    >
                      Edit
                    </Button>
                    <Button
                      onClick={() => handleTypeDelete(reportType)}
                      variant="link"
                      className="h-auto px-0 text-sm text-red-600 hover:text-red-700"
                      disabled={!isOnline}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Project Departments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleDepartmentSubmit} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
            <Select
              value={selectedDepartmentProjectId}
              onChange={(e) => setSelectedDepartmentProjectId(e.target.value)}
              disabled={!isOnline || projects.length === 0 || departmentSaving}
            >
              <option value="">Select project</option>
              {sortedProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>

            <Input
              value={departmentName}
              onChange={(e) => setDepartmentName(e.target.value)}
              placeholder="Department name"
              disabled={!isOnline || !selectedDepartmentProjectId || departmentSaving}
            />

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={!isOnline || !selectedDepartmentProjectId || departmentSaving}
              >
                {departmentSaving ? "Saving..." : editingDepartmentId ? "Update" : "Create"}
              </Button>
              {editingDepartmentId && (
                <Button type="button" variant="secondary" onClick={cancelDepartmentEdit}>
                  Cancel
                </Button>
              )}
            </div>
          </form>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="font-semibold">
              Departments in Selected Project ({filteredProjectDepartments.length})
            </h2>
            <Input
              value={departmentSearch}
              onChange={(e) => setDepartmentSearch(e.target.value)}
              placeholder="Search department..."
              className="w-full sm:w-72"
              disabled={!selectedDepartmentProjectId}
            />
          </div>

          {!selectedDepartmentProjectId ? (
            <Alert>
              <AlertDescription>Select a project to manage departments.</AlertDescription>
            </Alert>
          ) : filteredProjectDepartments.length === 0 ? (
            <Alert>
              <AlertDescription>No departments for this project yet.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              {filteredProjectDepartments.map((department) => (
                <div
                  key={department.id}
                  className="border border-border-light rounded-lg p-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-medium text-gray-900">{department.name}</p>
                    <p className="text-xs text-gray-500">ID: {department.id}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => startDepartmentEdit(department)}
                      variant="link"
                      className="h-auto px-0 text-sm"
                      disabled={!isOnline}
                    >
                      Edit
                    </Button>
                    <Button
                      onClick={() => handleDepartmentDelete(department)}
                      variant="link"
                      className="h-auto px-0 text-sm text-red-600 hover:text-red-700"
                      disabled={!isOnline}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
