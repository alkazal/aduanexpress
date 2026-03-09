import React, { useEffect, useState } from "react";
import { db } from "../db";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { syncReports } from "../lib/sync";
import { compressImage } from "../utils/imageCompressor";

export default function NewReport() {
  const navigate = useNavigate();

  const [reportType, setReportType] = useState("");
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState([]); // multiple files
  const [error, setError] = useState(null);
  const [progressMap, setProgressMap] = useState({});
  const [compressing, setCompressing] = useState(false);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    let active = true;

    async function loadProjects() {
      const localProjects = await db.projects.toArray();
      if (active) setProjects(localProjects);

      if (navigator.onLine) {
        const { data, error } = await supabase
          .from("projects")
          .select("id, name, updated_at")
          .order("name", { ascending: true });

        if (!error && data) {
          if (active) setProjects(data);
          for (const p of data) {
            await db.projects.put({
              id: p.id,
              name: p.name,
              updated_at: p.updated_at || null
            });
          }
        }
      }
    }

    loadProjects();
    return () => {
      active = false;
    };
  }, []);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setCompressing(true);

    try {
      const compressedFiles = await Promise.all(
        files.map(async (file) => {

          // For non-images, skip compression
          if (!file.type.startsWith("image/")) {
            return file;
          }

          const compressed = await compressImage(file, (progress) => {
            setProgressMap((prev) => ({
              ...prev,
              [file.name]: progress
            }));
          });

          return compressed;
        })
      );

      // ✅ Append instead of replace
      setAttachments((prev) => [...(prev || []), ...compressedFiles]);

    } catch (err) {
      console.error("Compression error:", err);
    }

    setCompressing(false);
    e.target.value = null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!projectId) {
      setError("Please select a project.");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const user = session?.user;
    if (!user) {
      setError("You must be logged in to submit.");
      return;
    }

    const reportId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    // Save report to Dexie
    const selectedProject = projects.find((p) => p.id === projectId);

    await db.reports.put({
      id: reportId,
      report_type: reportType,
      project_id: projectId,
      project_name: selectedProject?.name || null,
      title,
      description,
      created_at: createdAt,
      user_id: user.id,
      synced: false,
      to_delete: false,
    });

    // Save each attachment separately
    for (const file of attachments) {
      await db.attachments.put({
        id: crypto.randomUUID(),
        report_id: reportId,
        user_id: user.id,
        file_name: file.name,
        file_data: file, // Blob stored offline
        file_url: null, // filled after sync
        mime_type: null,
        synced: false,
        to_delete: false,
      });
    }

    syncReports();

    navigate("/submissions");
  };

return (
    <div className="p-6 w-full min-h-screen bg-gray-100">
      <div className="max-w-4xl w-full mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="text-blue-600 underline mb-2"
          >
            Back
          </button>
          <h1 className="text-2xl font-bold">New Report</h1>
          <p className="text-gray-500 text-sm">Fill out the details below</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-100 text-red-700 p-2 mb-4 rounded">{error}</div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white shadow-lg rounded-xl p-6 space-y-6">
          {/* Report Type & Project */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium mb-1">Report Type</label>
              <select
                className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                <option value="">Select a type</option>
                <option value="Attendance">Attendance</option>
                <option value="Incident">Incident</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </div>

            <div>
              <label className="block font-medium mb-1">Project</label>
              <select
                className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
              >
                <option value="">Select a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {projects.length === 0 && (
                <p className="text-sm text-gray-500 mt-1">No projects available.</p>
              )}
            </div>
          </div>

          {/* Title & Description */}
          <div>
            <label className="block font-medium mb-1">Title</label>
            <input
              className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Description</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="4"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {/* Attachments */}
          <div>
            <label className="block font-medium mb-1">Attachments</label>
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              className="block mt-2"
            />

            {compressing && (
              <div className="space-y-2 mt-4">
                {Object.entries(progressMap).map(([name, progress]) => (
                  <div key={name}>
                    <p className="text-sm font-medium mb-1">{name}</p>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-blue-600 h-3 rounded-full transition-all duration-200"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {attachments.length > 0 && (
              <ul className="mt-3 bg-gray-100 p-2 rounded">
                {attachments.map((file, idx) => (
                  <li key={idx} className="text-sm text-gray-700">
                    📎 {file.name} ({Math.round(file.size / 1024)} KB)
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-medium"
          >
            Submit Report
          </button>
        </form>
      </div>
    </div>
  );
}
