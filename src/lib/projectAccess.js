import { db } from "../db";
import { supabase } from "./supabase";

export function getCachedAppUser() {
  try {
    const raw = localStorage.getItem("appUser");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error("Invalid cached app user:", error);
    return null;
  }
}

export async function getCurrentUserContext() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const cachedUser = getCachedAppUser();

  return {
    session,
    userId: session?.user?.id || null,
    role: cachedUser?.role || "user",
  };
}

export async function replaceUserProjectAccess(userId, projectIds) {
  if (!userId) return;

  const nextProjectIds = [...new Set((projectIds || []).filter(Boolean))];
  const existingRows = await db.userProjectAccess.where("user_id").equals(userId).toArray();
  const nextSet = new Set(nextProjectIds);

  for (const row of existingRows) {
    if (!nextSet.has(row.project_id)) {
      await db.userProjectAccess.delete(row.id);
    }
  }

  const updatedAt = new Date().toISOString();
  for (const projectId of nextProjectIds) {
    await db.userProjectAccess.put({
      id: `${userId}:${projectId}`,
      user_id: userId,
      project_id: projectId,
      updated_at: updatedAt,
    });
  }
}

export async function loadProjectIdsForUser(userId, options = {}) {
  const { preferOnline = true } = options;

  if (!userId) return [];

  if (preferOnline && navigator.onLine) {
    const { data, error } = await supabase
      .from("user_project_access")
      .select("project_id")
      .eq("user_id", userId);

    if (!error && data) {
      const projectIds = data
        .map((row) => row.project_id)
        .filter(Boolean);
      await replaceUserProjectAccess(userId, projectIds);
      return projectIds;
    }
  }

  const localRows = await db.userProjectAccess.where("user_id").equals(userId).toArray();
  return localRows.map((row) => row.project_id).filter(Boolean);
}

export async function getAccessibleProjectIdsForCurrentUser(options = {}) {
  const { preferOnline = true } = options;
  const { userId, role } = await getCurrentUserContext();

  if (!userId) return [];
  if (role === "manager") return null;

  return loadProjectIdsForUser(userId, { preferOnline });
}

export async function canCurrentUserUseProject(projectId, options = {}) {
  if (!projectId) return false;

  const projectIds = await getAccessibleProjectIdsForCurrentUser(options);
  if (projectIds === null) return true;

  return projectIds.includes(projectId);
}

export async function filterProjectsForCurrentUser(projects, options = {}) {
  const projectIds = await getAccessibleProjectIdsForCurrentUser(options);
  if (projectIds === null) return projects;

  const allowedIds = new Set(projectIds);
  return (projects || []).filter((project) => allowedIds.has(project.id));
}

export async function loadProjectsForCurrentUser(options = {}) {
  const { preferOnline = true } = options;
  const { userId, role } = await getCurrentUserContext();

  if (!userId) return [];

  if (preferOnline && navigator.onLine) {
    if (role === "manager") {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, updated_at")
        .order("name", { ascending: true });

      if (!error && data) {
        for (const project of data) {
          await db.projects.put({
            id: project.id,
            name: project.name,
            updated_at: project.updated_at || null,
          });
        }
        return data;
      }
    } else {
      const { data, error } = await supabase
        .from("user_project_access")
        .select("project:project_id(id, name, updated_at)")
        .eq("user_id", userId);

      if (!error && data) {
        const projects = data
          .map((row) => row.project)
          .filter(Boolean)
          .map((project) => ({
            id: project.id,
            name: project.name,
            updated_at: project.updated_at || null,
          }));

        await replaceUserProjectAccess(
          userId,
          projects.map((project) => project.id)
        );

        for (const project of projects) {
          await db.projects.put(project);
        }

        return projects.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      }
    }
  }

  const localProjects = await db.projects.toArray();
  return filterProjectsForCurrentUser(localProjects, { preferOnline: false });
}

export async function canCurrentUserAccessReport(report, options = {}) {
  const { userId, role } = await getCurrentUserContext();
  if (!userId || !report) return false;

  if (role === "manager") return true;

  if (role === "technician") {
    return report.assigned_to === userId || report.user_id === userId;
  }

  const projectIds = await getAccessibleProjectIdsForCurrentUser(options);
  const hasProjectAccess = projectIds === null ? true : projectIds.includes(report.project_id);

  return hasProjectAccess;
}

export async function loadAssignedProjectIdsForTargetUser(userId) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from("user_project_access")
    .select("project_id")
    .eq("user_id", userId);

  if (error || !data) {
    throw new Error(error?.message || "Failed to load project assignments");
  }

  return data.map((row) => row.project_id).filter(Boolean);
}

export async function saveAssignedProjectIdsForTargetUser(userId, projectIds) {
  if (!userId) throw new Error("Missing user id");

  const nextIds = [...new Set((projectIds || []).filter(Boolean))];

  const { error: deleteError } = await supabase
    .from("user_project_access")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    throw new Error(deleteError.message || "Failed to clear existing project assignments");
  }

  if (nextIds.length > 0) {
    const payload = nextIds.map((projectId) => ({
      user_id: userId,
      project_id: projectId,
    }));

    const { error: insertError } = await supabase
      .from("user_project_access")
      .insert(payload);

    if (insertError) {
      throw new Error(insertError.message || "Failed to save project assignments");
    }
  }

  await replaceUserProjectAccess(userId, nextIds);
}
