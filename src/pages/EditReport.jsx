//EditReport.jsx 27/11 424pm

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../db";
import { supabase } from "../lib/supabase";
import { syncReports } from "../lib/sync";
import { compressImage } from "../utils/imageCompressor";

export default function EditReport() {
  const { id } = useParams(); // report_id
  const navigate = useNavigate();

  const [report, setReport] = useState(null);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progressMap, setProgressMap] = useState({});
  const [compressing, setCompressing] = useState(false);
  const [projects, setProjects] = useState([]);

  // -----------------------------
  // LOAD REPORT (offline first)
  // -----------------------------
  useEffect(() => {
    async function loadData() {
      setLoading(true);

      // 1) Try Dexie first
      const localReport = await db.reports.get(id);

      if (localReport) {
        setReport(localReport);

        const localAtt = await db.attachments
          .where("report_id")
          .equals(id)
          .and(a => !a.to_delete)
          .toArray();

        setExistingAttachments(localAtt);
        setLoading(false);
        return;
      }

      // 2) If offline and not found: give up
      if (!navigator.onLine) {
        setLoading(false);
        return;
      }

      // 3) Otherwise fetch from Supabase
      const { data: onlineReport } = await supabase
        .from("reports")
        .select("*")
        .eq("id", id)
        .single();

      if (onlineReport) {
        setReport(onlineReport);

        const { data: onlineAtt } = await supabase
          .from("attachments")
          .select("*")
          .eq("report_id", id);

        if (onlineAtt) {
          setExistingAttachments(onlineAtt);
        }
      }

      setLoading(false);
    }

    loadData();
  }, [id]);

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

  // -----------------------------
  // ADD NEW FILES
  // -----------------------------
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
        setNewFiles((prev) => [...(prev || []), ...compressedFiles]);
  
      } catch (err) {
        console.error("Compression error:", err);
      }
  
      setCompressing(false);
      e.target.value = null;
    };

  // -----------------------------
  // REMOVE ATTACHMENT
  // -----------------------------
  const handleRemoveAttachment = async (att) => {
    const confirm = window.confirm("Remove this attachment?");
    if (!confirm) return;

    // If it's a NEW (not yet synced) attachment
    if (!att.synced && !att.file_url) {
      await db.attachments.delete(att.id);
    } else {
      // Mark for deletion (syncReports will delete online)
      await db.attachments.update(att.id, { to_delete: true, synced: false });
    }

    setExistingAttachments((prev) => prev.filter((a) => a.id !== att.id));
  };

  // -----------------------------
  // SAVE CHANGES (OFFLINE FIRST)
  // -----------------------------
  const handleSave = async () => {
    if (!report.title) {
      alert("Title required");
      return;
    }

    setSaving(true);

    // 1) Update report locally
    await db.reports.put({
      ...report,
      synced: false, // important: mark for sync
      updated_at: new Date().toISOString()
    });

    // 2) Add new attachments to Dexie
    for (const file of newFiles) {
      await db.attachments.add({
        id: crypto.randomUUID(),
        report_id: id,
        file_name: file.name,
        mime_type: file.type,
        file_data: file,
        user_id: report.user_id,
        synced: false,
        to_delete: false
      });
    }

    //alert("Report saved locally ✅ Will sync when online");
    syncReports();
      
    setSaving(false);

    navigate(`/report/${id}`);
  };

  if (loading) return <p className="p-4">Loading...</p>;

  if (!report)
    return (
      <div className="p-4">
        <p className="text-red-500">Report not found</p>
      </div>
    );

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Edit Report</h1>

      {/* Title */}
      <label className="block text-sm mb-1 font-semibold">
        Title
      </label>
      <input
        value={report.title || ""}
        onChange={(e) =>
          setReport({ ...report, title: e.target.value })
        }
        className="border w-full p-2 rounded mb-3"
      />

      {/* Type */}
      <label className="block text-sm mb-1 font-semibold">
        Report Type
      </label>
      <select
        value={report.report_type || ""}
        onChange={(e) =>
          setReport({ ...report, report_type: e.target.value })
        }
        className="border w-full p-2 rounded mb-3"
      >
        <option value="">Select</option>
        <option value="Incident">Incident</option>
        <option value="Maintenance">Maintenance</option>
        <option value="Attendance">Attendance</option>
      </select>

      {/* Project */}
      <label className="block text-sm mb-1 font-semibold">
        Project
      </label>
      <select
        value={report.project_id || ""}
        onChange={(e) => {
          const selected = projects.find((p) => p.id === e.target.value);
          setReport({
            ...report,
            project_id: e.target.value,
            project_name: selected?.name || null
          });
        }}
        className="border w-full p-2 rounded mb-3"
      >
        <option value="">Select</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {/* Description */}
      <label className="block text-sm mb-1 font-semibold">
        Description
      </label>
      <textarea
        rows={4}
        value={report.description || ""}
        onChange={(e) =>
          setReport({ ...report, description: e.target.value })
        }
        className="border w-full p-2 rounded mb-3"
      />

      {/* Existing Attachments */}
      <h3 className="font-semibold mt-4 mb-2">
        Existing Attachments ({existingAttachments.length})
      </h3>

      {existingAttachments.length === 0 && (
        <p className="text-gray-500 text-sm">
          No attachments
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        {existingAttachments.map((att) => {
          const isImage = att.mime_type?.startsWith("image");
          // const fileUrl =
          //   att.file_url ||
          //   (att.file && URL.createObjectURL(att.file));
          const fileUrl =
          att.file_url ||
          (att.file_data instanceof Blob
            ? URL.createObjectURL(att.file_data)
            : null);

          return (
            <div
              key={att.id}
              className="border rounded p-2 relative"
            >
              {isImage ? (
                <img
                  src={fileUrl}
                  className="w-full h-24 object-cover rounded"
                />
              ) : (
                <div className="h-24 bg-gray-200 flex items-center justify-center rounded">
                  📄
                </div>
              )}

              <p className="truncate text-xs mt-1">
                {att.file_name}
              </p>

              <button
                onClick={() => handleRemoveAttachment(att)}
                className="absolute top-1 right-1 text-xs bg-red-600 text-white px-2 rounded"
              >
                ✕
              </button>
            </div>
          );
        })}

        {newFiles.map((file, index) => {
          const previewUrl = URL.createObjectURL(file);

          return (
            <div key={index} className="border rounded p-2 relative">
              {file.type.startsWith("image") ? (
                <img
                  src={previewUrl}
                  className="w-full h-24 object-cover rounded"
                />
              ) : (
                <div className="h-24 bg-gray-200 flex items-center justify-center rounded">
                  📄
                </div>
              )}

              <p className="truncate text-xs mt-1">
                {file.name}
              </p>

              <button
                onClick={() =>
                  setNewFiles(prev => prev.filter((_, i) => i !== index))
                }
                className="absolute top-1 right-1 text-xs bg-red-600 text-white px-2 rounded"
              >
                ✕
              </button>
            </div>
          );
        })}

      </div>

      {/* Add new files */}
      <label className="block text-sm mb-1 font-semibold">
        Add new attachments
      </label>

      <input
        type="file"
        multiple
        onChange={handleFileChange}
        className="border w-full p-2 rounded mb-3"
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

      {/* Buttons */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-blue-600 text-white py-2 rounded"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>

        <button
          onClick={() => navigate(-1)}
          className="flex-1 bg-gray-300 py-2 rounded"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
