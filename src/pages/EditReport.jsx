//EditReport.jsx 27/11 424pm

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../db";
import { supabase } from "../lib/supabase";
import { syncReports } from "../lib/sync";
import { compressImage } from "../utils/imageCompressor";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Select } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";

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

  function toDateTimeLocalValue(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  }

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

  if (loading) {
    return (
      <div className="p-4 max-w-xl mx-auto">
        <Alert>
          <AlertDescription>Loading...</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!report)
    return (
      <div className="p-4 max-w-xl mx-auto">
        <Alert className="border-red-200 bg-red-50 text-red-700">
          <AlertDescription>Report not found</AlertDescription>
        </Alert>
      </div>
    );

  return (
    <div className="p-2 px-2 w-full min-h-screen bg-gray-100">
      <div className="max-w-4xl w-full mx-auto">
        <div className="mb-6">
          <Button
            onClick={() => navigate(-1)}
            variant="link"
            className="mb-2 h-auto px-0"
          >
            Back
          </Button>
          <h1 className="text-2xl font-bold">Edit Report</h1>
          <p className="text-gray-500 text-sm">Update report details and attachments</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Report Information</CardTitle>
            <CardDescription>Make changes below, then save to sync updates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={report.title || ""}
              onChange={(e) =>
                setReport({ ...report, title: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-type">Report Type</Label>
            <Select
              id="edit-type"
              value={report.report_type || ""}
              onChange={(e) =>
                setReport({ ...report, report_type: e.target.value })
              }
            >
              <option value="">Select</option>
              <option value="Application">Application</option>
              <option value="Incident">Incident</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Attendance">Attendance</option>
            </Select>
          </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-project">Project</Label>
            <Select
              id="edit-project"
              value={report.project_id || ""}
              onChange={(e) => {
                const selected = projects.find((p) => p.id === e.target.value);
                setReport({
                  ...report,
                  project_id: e.target.value,
                  project_name: selected?.name || null
                });
              }}
            >
              <option value="">Select</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-request-datetime">Datetime Request</Label>
            <div className="w-full overflow-hidden">
            <Input
              id="edit-request-datetime"
              type="datetime-local"
              value={toDateTimeLocalValue(report.request_datetime)}
              onChange={(e) =>
                setReport({
                  ...report,
                  request_datetime: e.target.value ? new Date(e.target.value).toISOString() : null
                })
              }
              className="w-full min-w-0 text-left"
            />
            </div>
          </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              rows={4}
              value={report.description || ""}
              onChange={(e) =>
                setReport({ ...report, description: e.target.value })
              }
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-requestor-name">Requestor Name</Label>
            <Input
              id="edit-requestor-name"
              value={report.requestor_name || ""}
              onChange={(e) =>
                setReport({ ...report, requestor_name: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-requestor-phone">Requestor Phone No</Label>
            <Input
              id="edit-requestor-phone"
              type="tel"
              value={report.requestor_phone_no || ""}
              onChange={(e) =>
                setReport({ ...report, requestor_phone_no: e.target.value })
              }
            />
          </div>
          </div>

          <h3 className="font-semibold mt-4 mb-2">
            Existing Attachments ({existingAttachments.length})
          </h3>

          {existingAttachments.length === 0 && (
            <p className="text-muted-foreground text-sm">
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

              <Button
                onClick={() => handleRemoveAttachment(att)}
                className="absolute top-1 right-1 h-6 px-2 text-xs bg-red-600 hover:bg-red-700"
                type="button"
                size="sm"
              >
                ✕
              </Button>
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

              <Button
                onClick={() =>
                  setNewFiles(prev => prev.filter((_, i) => i !== index))
                }
                className="absolute top-1 right-1 h-6 px-2 text-xs bg-red-600 hover:bg-red-700"
                type="button"
                size="sm"
              >
                ✕
              </Button>
            </div>
          );
        })}

          </div>

          <div className="space-y-2">
            <Label htmlFor="new-files">Add new attachments</Label>
            <Input
              id="new-files"
              type="file"
              multiple
              onChange={handleFileChange}
              className="h-auto py-2"
            />
          </div>
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

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={() => navigate(-1)}
              className="w-full"
              variant="outline"
              type="button"
            >
              Back
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full"
              type="button"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>

        </CardContent>
      </Card>
      </div>
    </div>
  );
}
