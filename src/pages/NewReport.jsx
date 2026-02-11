import React, { useState } from "react";
import { db } from "../db";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { syncReports } from "../lib/sync";
import { compressImage } from "../utils/imageCompressor";

export default function NewReport() {
  const navigate = useNavigate();

  const [reportType, setReportType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState([]); // multiple files
  const [error, setError] = useState(null);
  const [progressMap, setProgressMap] = useState({});
  const [compressing, setCompressing] = useState(false);

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
    await db.reports.put({
      id: reportId,
      report_type: reportType,
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
    <div className="p-4 max-w-lg mx-auto">
      <h2 className="text-xl font-semibold mb-4">New Report</h2>

      {error && (
        <div className="bg-red-100 text-red-700 p-2 mb-3 rounded">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Report Type */}
        <div>
          <label className="block font-medium">Report Type</label>
          <select
            className="w-full border rounded-md p-2"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
          >
            <option value="">Select a type</option>
            <option value="Attendance">Attendance</option>
            <option value="Incident">Incident</option>
            <option value="Maintenance">Maintenance</option>
          </select>
        </div>

        {/* Title */}
        <div>
          <label className="block font-medium">Title</label>
          <input
            className="border p-2 rounded w-full"            
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="block font-medium">Description</label>
          <textarea
            className="border p-2 rounded w-full"
            rows="4"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        {/* Attachments */}
        <div>
          <label className="block font-medium">Attachments</label>
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

          {/* File Previews */}
          {attachments.length > 0 && (
            <ul className="mt-3 bg-gray-100 p-2 rounded">
              {attachments.map((file, idx) => (
                <li key={idx} className="text-sm text-gray-700">
                  📎 {file.name} ({Math.round(file.size / 1024)} KB)
                </li>
              ))}
            </ul>
          )}

          {compressing && (
            <p className="text-blue-500">
              Compressing {attachments.length} images...
            </p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded mt-3 w-full"
        >
          Submit Report
        </button>
      </form>
    </div>
  );
}
