import React, { useEffect, useRef, useState } from "react";
import { db } from "../db";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { syncReports } from "../lib/sync";
import { compressImage } from "../utils/imageCompressor";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Select } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";

const NEW_REPORT_DRAFT_KEY = "newReportDraft.v1";

function getCurrentLocalDatetimeValue() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function NewReport() {
  const navigate = useNavigate();

  const [reportType, setReportType] = useState("");
  const [department, setDepartment] = useState("");
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [requestorName, setRequestorName] = useState("");
  const [requestorPhoneNo, setRequestorPhoneNo] = useState("");
  const [requestDatetime, setRequestDatetime] = useState(
    () => getCurrentLocalDatetimeValue()
  );
  const [attachments, setAttachments] = useState([]); // multiple files
  const [error, setError] = useState(null);
  const [progressMap, setProgressMap] = useState({});
  const [compressing, setCompressing] = useState(false);
  const [projects, setProjects] = useState([]);
  const [reportTypes, setReportTypes] = useState([]);
  const [projectReportTypes, setProjectReportTypes] = useState([]);
  const [projectDepartments, setProjectDepartments] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [requestorSuggestions, setRequestorSuggestions] = useState([]);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const nameWrapperRef = useRef(null);
  const prevReportTypeRef = useRef("");

  useEffect(() => {
    try {
      const rawDraft = localStorage.getItem(NEW_REPORT_DRAFT_KEY);
      if (!rawDraft) return;

      const draft = JSON.parse(rawDraft);
      if (typeof draft.reportType === "string") setReportType(draft.reportType);
      if (typeof draft.department === "string") setDepartment(draft.department);
      if (typeof draft.projectId === "string") setProjectId(draft.projectId);
      if (typeof draft.title === "string") setTitle(draft.title);
      if (typeof draft.location === "string") setLocation(draft.location);
      if (typeof draft.description === "string") setDescription(draft.description);
      if (typeof draft.requestorName === "string") setRequestorName(draft.requestorName);
      if (typeof draft.requestorPhoneNo === "string") setRequestorPhoneNo(draft.requestorPhoneNo);
      if (typeof draft.requestDatetime === "string") setRequestDatetime(draft.requestDatetime);
    } catch (err) {
      console.error("Failed to restore new report draft:", err);
    }
  }, []);

  useEffect(() => {
    try {
      // Files are excluded because File objects are not safely serializable in localStorage.
      const draft = {
        reportType,
        department,
        projectId,
        title,
        location,
        description,
        requestorName,
        requestorPhoneNo,
        requestDatetime,
      };
      localStorage.setItem(NEW_REPORT_DRAFT_KEY, JSON.stringify(draft));
    } catch (err) {
      console.error("Failed to save new report draft:", err);
    }
  }, [
    reportType,
    department,
    projectId,
    title,
    location,
    description,
    requestorName,
    requestorPhoneNo,
    requestDatetime,
  ]);

  useEffect(() => {
    // Close suggestions on outside click
    function handleClickOutside(e) {
      if (nameWrapperRef.current && !nameWrapperRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadRequestors() {
      // Load from local Dexie first
      const localReports = await db.reports.toArray();
      const mergedMap = new Map();
      for (const r of localReports) {
        if (r.requestor_name) {
          const key = r.requestor_name.toLowerCase();
          if (!mergedMap.has(key)) {
            mergedMap.set(key, { name: r.requestor_name, phone_no: r.requestor_phone_no || "" });
          }
        }
      }
      if (active) setRequestorSuggestions([...mergedMap.values()]);

      // Merge with Supabase if online
      if (navigator.onLine) {
        const { data } = await supabase
          .from("reports")
          .select("requestor_name, requestor_phone_no")
          .not("requestor_name", "is", null);
        if (active && data) {
          for (const r of data) {
            if (r.requestor_name) {
              const key = r.requestor_name.toLowerCase();
              if (!mergedMap.has(key)) {
                mergedMap.set(key, { name: r.requestor_name, phone_no: r.requestor_phone_no || "" });
              }
            }
          }
          if (active) setRequestorSuggestions([...mergedMap.values()]);
        }
      }
    }
    loadRequestors();
    return () => { active = false; };
  }, []);

  function handleRequestorNameChange(e) {
    const value = e.target.value;
    setRequestorName(value);
    if (value.trim().length === 0) {
      setFilteredSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const lower = value.toLowerCase();
    const filtered = requestorSuggestions.filter((r) =>
      r.name.toLowerCase().includes(lower)
    );
    setFilteredSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
  }

  function handleSelectRequestor(r) {
    setRequestorName(r.name);
    setRequestorPhoneNo(r.phone_no);
    setShowSuggestions(false);
  }

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

  useEffect(() => {
    let active = true;

    async function loadReportTypes() {
      const localReportTypes = await db.reportTypes.toArray();
      if (active) setReportTypes(localReportTypes || []);

      if (navigator.onLine) {
        const { data, error } = await supabase
          .from("report_types")
          .select("id, project_id, name, updated_at")
          .order("name", { ascending: true });

        if (!error && data) {
          if (active) setReportTypes(data);
          for (const rt of data) {
            await db.reportTypes.put({
              id: rt.id,
              project_id: rt.project_id,
              name: rt.name,
              updated_at: rt.updated_at || null
            });
          }
        }
      }
    }

    loadReportTypes();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const filtered = (reportTypes || [])
      .filter((rt) => rt.project_id === projectId)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    setProjectReportTypes(filtered);

    if (reportType && !filtered.some((rt) => rt.name === reportType)) {
      setReportType("");
    }
  }, [projectId, reportTypes, reportType]);

  useEffect(() => {
    let active = true;

    async function loadDepartments() {
      const localDepartments = await db.projectDepartments.toArray();
      if (active) setDepartments(localDepartments || []);

      if (navigator.onLine) {
        const { data, error } = await supabase
          .from("project_departments")
          .select("id, project_id, name, updated_at")
          .order("name", { ascending: true });

        if (!error && data) {
          if (active) setDepartments(data);
          for (const dep of data) {
            await db.projectDepartments.put({
              id: dep.id,
              project_id: dep.project_id,
              name: dep.name,
              updated_at: dep.updated_at || null
            });
          }
        }
      }
    }

    loadDepartments();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const filtered = (departments || [])
      .filter((dep) => dep.project_id === projectId)
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    setProjectDepartments(filtered);

    if (department && !filtered.some((dep) => dep.name === department)) {
      setDepartment("");
    }
  }, [projectId, departments, department]);

  useEffect(() => {
    const previousReportType = prevReportTypeRef.current;

    setTitle((currentTitle) => {
      const shouldAutofill =
        currentTitle.trim() === "" ||
        (previousReportType && currentTitle === previousReportType);

      if (!shouldAutofill) return currentTitle;
      return reportType || "";
    });

    prevReportTypeRef.current = reportType;
  }, [reportType]);

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

    if (!reportType) {
      setError("Please select a report type.");
      return;
    }

    if (!department) {
      setError("Please select a department.");
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
      department,
      project_id: projectId,
      project_name: selectedProject?.name || null,
      title,
      location: location || null,
      description,
      requestor_name: requestorName,
      requestor_phone_no: requestorPhoneNo,
      request_datetime: requestDatetime ? new Date(requestDatetime).toISOString() : null,
      created_at: createdAt,
      user_id: user.id,
      _manager_email_sent: false,
      _manager_email_pending: true,
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
    localStorage.removeItem(NEW_REPORT_DRAFT_KEY);

    navigate("/submissions");
  };

  const handleClearDraft = () => {
    setReportType("");
    setDepartment("");
    setProjectId("");
    setTitle("");
    setLocation("");
    setDescription("");
    setRequestorName("");
    setRequestorPhoneNo("");
    setRequestDatetime(getCurrentLocalDatetimeValue());
    setAttachments([]);
    setProgressMap({});
    setFilteredSuggestions([]);
    setShowSuggestions(false);
    setError(null);
    localStorage.removeItem(NEW_REPORT_DRAFT_KEY);
  };

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
          <h1 className="text-2xl font-bold">New Report</h1>
          <p className="text-gray-500 text-sm">Fill out the details below</p>
        </div>

        {error && (
          <Alert className="mb-4 border-red-200 bg-red-50 text-red-700">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Report Information</CardTitle>
            <CardDescription>Complete all required fields before submitting.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="project">Category</Label>
                  <Select
                    id="project"
                    value={projectId}
                    onChange={(e) => {
                      setProjectId(e.target.value);
                    }}
                    required
                  >
                    <option value="">Select a category</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                  {projects.length === 0 && (
                    <p className="text-sm text-muted-foreground">No projects available.</p>
                  )}
                </div>
              
                <div className="space-y-2">
                  <Label htmlFor="report-type">Report Type</Label>
                  <Select
                    id="report-type"
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    disabled={!projectId || projectReportTypes.length === 0}
                    required
                  >
                    <option value="">
                      {!projectId
                        ? "Select a project first"
                        : projectReportTypes.length === 0
                          ? "No report types for this project"
                          : "Select a type"}
                    </option>
                    {projectReportTypes.map((rt) => (
                      <option key={rt.id} value={rt.name}>{rt.name}</option>
                    ))}
                  </Select>
                  {projectId && projectReportTypes.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No report types are configured for this project yet.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Select
                  id="department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  disabled={!projectId || projectDepartments.length === 0}
                  required
                >
                  <option value="">
                    {!projectId
                      ? "Select a project first"
                      : projectDepartments.length === 0
                        ? "No departments for this project"
                        : "Select a department"}
                  </option>
                  {projectDepartments.map((dep) => (
                    <option key={dep.id} value={dep.name}>{dep.name}</option>
                  ))}
                </Select>
                {projectId && projectDepartments.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No departments are configured for this project yet.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location (Optional)</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Enter location"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Reference and Problem (To be completed by the Originator/ Complainant)</Label>
                <Textarea
                  id="description"
                  rows="4"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="requestor-name">Reporter Name</Label>
                  <div ref={nameWrapperRef} className="relative">
                    <Input
                      id="requestor-name"
                      value={requestorName}
                      onChange={handleRequestorNameChange}
                      onFocus={() => {
                        if (requestorName.trim() && filteredSuggestions.length > 0)
                          setShowSuggestions(true);
                      }}
                      autoComplete="off"
                      placeholder="Type to search or enter new name"
                      required
                    />
                    {showSuggestions && filteredSuggestions.length > 0 && (
                      <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {filteredSuggestions.map((r, i) => (
                          <li
                            key={i}
                            onMouseDown={() => handleSelectRequestor(r)}
                            className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-100 text-sm"
                          >
                            <span className="font-medium">{r.name}</span>
                            {r.phone_no && (
                              <span className="text-gray-400 text-xs ml-2">{r.phone_no}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="requestor-phone">Reporter Phone No</Label>
                  <Input
                    id="requestor-phone"
                    type="tel"
                    value={requestorPhoneNo}
                    onChange={(e) => setRequestorPhoneNo(e.target.value)}
                    placeholder="Auto-filled when name is selected"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="request-datetime">Datetime Reported</Label>
                <div className="w-full overflow-hidden">
                  <Input
                    id="request-datetime"
                    type="datetime-local"
                    value={requestDatetime}
                    onChange={(e) => setRequestDatetime(e.target.value)}
                    required
                    className="w-full min-w-0 text-left"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="attachments">Attachments</Label>
                <Input
                  id="attachments"
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="h-auto py-2"
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
                  <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 space-y-2">
                    {attachments.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{file.name}</span>
                        <Badge variant="secondary">{Math.round(file.size / 1024)} KB</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleClearDraft}
                >
                  Clear Draft
                </Button>
                <Button type="submit" className="w-full">
                  Submit Report
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
