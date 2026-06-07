 import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../db";
import { supabase } from "../lib/supabase";
import { deleteReport } from "../utils/deleteReport";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Textarea } from "../components/ui/textarea";

export default function ReportDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [report, setReport] = useState(null);
  const [attachments, setAttachments] = useState([]);

  const [previewFile, setPreviewFile] = useState(null);

  const [loading, setLoading] = useState(true);

  const [publicReply, setPublicReply] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [comments, setComments] = useState([]);
  const [activeTab, setActiveTab] = useState("public");

  const [userRole, setUserRole] = useState(null);
  const isStaff = userRole === "manager" || userRole === "technician";

  useEffect(() => {
    async function getUserRole() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          console.error("Error fetching user:", error);
          return;
        }

        const user = data?.user;
        if (!user) {
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("user_profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profileError) {
          console.error("Error fetching user profile:", profileError);
        } else {
          setUserRole(profileData?.role || null);
        }
      } catch (err) {
        console.error("Unexpected error getting user role:", err);
      }
    }

    getUserRole();
  }, []);
  
  // ----------------------------------------------------
  // LOAD REPORT (Offline first, then online fallback)
  // ----------------------------------------------------
  useEffect(() => {
    async function load() {
      setLoading(true);

      try {
        // 1️⃣ Load local report
        const local = await db.reports.get(id);
        if (local) {
          const localWithHistory = { ...local, history: local._status_changes || [] };
          setReport(localWithHistory);

          // Merge project name if missing
          if (local.project_id && !local.project_name) {
            const proj = await db.projects.get(local.project_id);
            if (proj) {
              setReport(prev => ({ ...prev, project_name: proj.name }));
            }
          }

          // Local attachments
          const localAttachments = await db.attachments
            .where("report_id")
            .equals(id)
            .and(a => !a.to_delete)
            .toArray();
          setAttachments(localAttachments);
        }

        // If online, fetch latest report
        if (navigator.onLine) {
          const { data: online, error: reportError } = await supabase
            .from("reports")
            .select(`
              *,
              reporter:user_id ( full_name ),
              technician:assigned_to ( full_name ),
              project:project_id ( id, name ),
              history:report_status_history (
                id, old_status, new_status, changed_at, comment, changed_by, changed_by_name
              )
            `)
            .eq("id", id)
            .single();

          if (reportError) {
            console.error("Error fetching online report:", reportError);
          } else if (online) {
            setReport(prev => ({
              ...prev,
              ...online,
              project_id: online.project?.id || prev.project_id || null,
              project_name: online.project?.name || prev.project_name || null,
              history: [...(prev?.history || []), ...(online.history || [])]
            }));
          }

          // Online attachments
          const { data: onlineAtt, error: attError } = await supabase
            .from("attachments")
            .select("*")
            .eq("report_id", id);

          if (attError) {
            console.error("Error fetching attachments:", attError);
          } else {
            // Merge local + online attachments, avoid duplicates by id
            const merged = [...(attachments || [])];
            onlineAtt?.forEach(oa => {
              if (!merged.some(a => a.id === oa.id)) merged.push(oa);
            });
            setAttachments(merged);
          }
        }

        // Load comments
        const { data: commentData, error: commentError } = await supabase
          .from("report_comments")
          .select(`
            *,
            user:user_profiles (
              full_name, role
            )
          `)
          .eq("report_id", id)
          .order("created_at", { ascending: false });

        if (commentError) {
          console.error("Error fetching comments:", commentError);
        } else if (commentData) {
          setComments(commentData);
        }
      } catch (err) {
        console.error("Unexpected error loading report:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  useEffect(() => {
    return () => {
      attachments.forEach(att => {
        if (att.file || att.file_data) URL.revokeObjectURL(att.file || att.file_data);
      });
    };
  }, [attachments]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") {
        setPreviewFile(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Alert>
          <AlertDescription>Loading...</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!report)
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Alert className="border-red-200 bg-red-50 text-red-700">
          <AlertDescription>Report not found</AlertDescription>
        </Alert>
      </div>
    );

  // ----------------------------------------------------
  // BUILD STATUS TIMELINE (NEW CLEAN VERSION)
  // ----------------------------------------------------


  // 1) Submitted event
  // timeline.push({
  //   label: "Submitted",
  //   at: report.created_at,
  //   by: report.reporter?.full_name || "Unknown user",
  //   comment: "Report submitted"
  // });

  // 2) Assigned → New
  // if (report.assigned_at) {
  //   timeline.push({
  //     label: "Assigned (New)",
  //     at: report.assigned_at,
  //     by: report.technician?.full_name || "Manager",
  //     comment: "Assigned to technician"
  //   });
  // }

  // 3) Status change history from DB (deduped)
  const rawHistory = [
    ...(report.history || []),
    ...(report._status_changes || [])
  ];

  const unique = new Map();

  rawHistory.forEach((h) => {
    const key = `${h.old_status}-${h.new_status}-${h.changed_at}`;

    if (!unique.has(key)) {
      unique.set(key, {
        label: `${h.old_status} → ${h.new_status}`,
        at: h.changed_at,
        by: h.changed_by_name || h.changed_by,
        comment: h.comment
      });
    }
  });

  const timeline = Array.from(unique.values());

  // 4) Closed (manager only)
  // if (report.closed_at) {
  //   timeline.push({
  //     label: "Closed",
  //     at: report.closed_at,
  //     by: report.updated_by_name,
  //     comment: report.closing_notes
  //   });
  // }

  // FINAL SORT
  timeline.sort((a, b) => new Date(a.at) - new Date(b.at));

  async function sendPublicReply() {
    if (!publicReply.trim()) return;

    // Get logged-in user FIRST
    const {
      data: { user }
    } = await supabase.auth.getUser();

    // Then insert
    const { data, error } = await supabase
      .from("report_comments")
      .insert({
        report_id: id,
        message: publicReply,   
        user_id: user.id,
        is_internal: false      
      })
      .select()
      .single();

    if (!error) {
      setComments(prev => [data, ...prev]);
      setPublicReply("");
    }
  }

  async function sendInternalNote() {
    if (!internalNote.trim()) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("report_comments")
      .insert({
        report_id: id,
        message: internalNote,  
        user_id: user.id,
        is_internal: true       
      })
      .select()
      .single();

    if (!error) {
      setComments(prev => [data, ...prev]);
      setInternalNote("");
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">

      <Button
        onClick={() => navigate(-1)}
        variant="link"
        className="mb-4 px-0"
      >
        ← Back
      </Button>

      <Card>
        <CardContent className="p-6">
        <h1 className="text-2xl font-bold mb-2">
          #{report.ticket_no}
        </h1>

        <p className="text-lg text-gray-700">
          {report.title}
        </p>

        <div className="flex gap-2 mt-2 flex-wrap">

        <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-100">
          {report.status}
        </Badge>

        {report.maintenance_level && (
          <Badge
            variant="secondary"
            className={`px-3 py-1 text-xs rounded-full font-semibold flex items-center gap-1 hover:bg-transparent
              ${report.maintenance_level === 1 && "bg-green-100 text-green-700"}
              ${report.maintenance_level === 2 && "bg-yellow-100 text-yellow-700"}
              ${report.maintenance_level === 3 && "bg-red-100 text-red-700"}
            `}
          >
            Maintenance L{report.maintenance_level}
          </Badge>
        )}

      </div>

      </CardContent>
      </Card>

            <Card className="mt-4">
              <CardContent className="p-6">
        <h2 className="font-semibold mb-2">Description</h2>

        <p className="text-gray-700">
          {report.description}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4 text-sm">

          <div>
            <p className="text-gray-500">Project</p>
            <p className="font-medium">
              {report.project_name || report.project_id}
            </p>
          </div>

          <div>
            <p className="text-gray-500">Maintenance Level</p>
            <p className="font-medium">
              {report.maintenance_level
                ? `Level ${report.maintenance_level}`
                : "Not set"}
            </p>
          </div>

          <div>
            <p className="text-gray-500">Submitted By</p>
            <p className="font-medium">
              {report.reporter?.full_name || report.reporter_name}
            </p>
          </div>

          <div>
            <p className="text-gray-500">Requestor Name</p>
            <p className="font-medium">{report.requestor_name || "-"}</p>
          </div>

          <div>
            <p className="text-gray-500">Requestor Phone No</p>
            <p className="font-medium">{report.requestor_phone_no || "-"}</p>
          </div>

          <div>
            <p className="text-gray-500">Datetime Request</p>
            <p className="font-medium">
              {report.request_datetime
                ? new Date(report.request_datetime).toLocaleString()
                : "-"}
            </p>
          </div>

      </div>
    </CardContent>
    </Card>

      {/* ----------------------------------------------------
          ATTACHMENTS
      ---------------------------------------------------- */}
      <Card className="mt-6">
        <CardContent className="p-6">

      <h2 className="text-xl font-semibold mb-4">
        Attachments ({attachments.length})
      </h2>

      {attachments.length === 0 && (
        <p className="text-gray-500 text-sm">No attachments</p>
      )}
    

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {attachments.map((att) => {
          const isImage = att.mime_type?.startsWith("image");
          //const isImg = att.mime_type?.startsWith("image/");
          // const url =
          //   att.file_url ||
          //   (att.file_data && URL.createObjectURL(att.file_data));

          // Fallback URL:
            // - If online: att.file_url
            // - If offline: att.file_data or att.file (Blob)
            let fileUrl = att.file_url;

            if (!fileUrl && (att.file || att.file_data)) {
              // Convert blob to URL
              fileUrl = URL.createObjectURL(att.file || att.file_data);
            }
        
          return (
          //   <div
          //     key={att.id}
          //     className="border rounded p-2 bg-white shadow-sm cursor-pointer"
          //     onClick={() => isImg && setModalUrl(url)}
          //   >
          //     {isImg ? (
          //       <img
          //         src={url}
          //         className="h-32 w-full object-cover rounded"
          //       />
          //     ) : (
          //       <div className="h-32 bg-gray-200 flex items-center justify-center rounded">
          //         📄
          //       </div>
          //     )}

          //     <p className="text-xs mt-1 truncate">{att.file_name}</p>
          //   </div>
          // );
            <div
                key={att.id}
                className="border border-border-light rounded-md p-2 shadow-sm bg-white"
              >
                {/* Thumbnail Preview */}
                {isImage ? (
                  <img
                      src={fileUrl}
                      alt={att.file_name}
                      onClick={() =>
                        setPreviewFile({
                          url: fileUrl,
                          name: att.file_name,
                          type: att.mime_type,
                        })
                      }
                      className="w-full h-28 object-cover rounded cursor-pointer hover:opacity-80"
                    />
                ) : (
                  <div className="w-full h-28 bg-gray-200 flex items-center justify-center rounded">
                    <span className="text-gray-600 text-sm">📄 File</span>
                  </div>
                )}

                {/* Filename */}
                <p className="text-xs mt-2 text-gray-700 truncate">
                  {att.file_name}
                </p>

                {/* Actions */}
                <div className="flex gap-2 mt-2">
                  <Button
                    onClick={() =>
                      setPreviewFile({
                        url: fileUrl,
                        name: att.file_name,
                        type: att.mime_type,
                      })
                    }
                    variant="link"
                    className="h-auto px-0 text-xs"
                  >
                    View
                  </Button>

                  <a
                    href={fileUrl}
                    download={att.file_name}
                    className="text-blue-600 text-xs underline"
                  >
                    Download
                  </a>
                </div>
              </div>
            );
        })}
      </div>
      </CardContent>
      </Card>

      <Card className="mt-6">
      <CardContent className="p-6">

      <h2 className="text-lg font-semibold mb-4">Communication</h2>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
        <Button
          onClick={() => setActiveTab("public")}
          variant={activeTab === "public" ? "secondary" : "ghost"}
          className={`flex-1 py-2 text-sm rounded ${
            activeTab === "public" ? "bg-white shadow" : ""
          }`}
        >
          Public Reply
        </Button>

        {isStaff && (
          <Button
            onClick={() => setActiveTab("internal")}
            variant={activeTab === "internal" ? "secondary" : "ghost"}
            className={`flex-1 py-2 text-sm rounded ${
              activeTab === "internal" ? "bg-white shadow" : ""
            }`}
          >
            Internal Notes
          </Button>
        )}
      </div>

      {/* PUBLIC REPLY */}
      {activeTab === "public" && (
        <>
          <Textarea
            value={publicReply}
            onChange={(e) => setPublicReply(e.target.value)}
            placeholder="Type your response to the user..."
            rows={4}
          />

          <Button
            onClick={sendPublicReply}
            className="mt-3"
          >
            Send Response
          </Button>

          {/* Display Previous Public Replies */}
          <div className="mt-6 space-y-3">
            {comments
              .filter(c => !c.is_internal)
              .map(c => (
                <div key={c.id} className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
                  <div className="flex flex-col gap-1 mb-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {c.user?.full_name || "Unknown"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(c.created_at).toLocaleString()}
                    </p>
                  </div>

                  <p className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
                    {c.message}
                  </p>
                </div>
              ))}
          </div>
        </>
      )}

      {/* INTERNAL NOTES */}
      {activeTab === "internal" && (
        <>
          <Textarea
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            placeholder="Add internal troubleshooting notes..."
            rows={4}
          />

          <Button
            onClick={sendInternalNote}
            variant="secondary"
            className="mt-3"
          >
            Add Internal Note
          </Button>

          {/* Display Previous Internal Notes */}
          <div className="mt-6 space-y-3">
            {comments
              .filter(c => c.is_internal)
              .map(c => (
                <div key={c.id} className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                  <div className="flex flex-col gap-1 mb-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {c.user?.full_name || "Unknown"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(c.created_at).toLocaleString()}
                    </p>
                  </div>

                  <p className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
                    {c.message}
                  </p>
                </div>
              ))}
          </div>
        </>
      )}

      </CardContent>
      </Card>

       {/* EDIT BUTTON */}
      <Button
        className="mt-6 w-full"
        onClick={() => navigate(`/report/${id}/edit`)}
      >
        Edit Report
      </Button>
      <Button
        variant="destructive"
        className="mt-6 w-full"
        onClick={async () => {
          if (confirm("Delete this report?")) {
            await deleteReport(report);
            navigate("/");
          }
        }}        
      >
        Delete
      </Button>

      {/* Delete Button */}
      {/* <button
        onClick={() => deleteReport(id)}
        className="mt-4 bg-red-600 text-white px-4 py-2 rounded"
      >
        Delete Report
      </button> */}

      {/* Image Preview Modal */}
      {/* {modalUrl && (
        <Modal url={modalUrl} onClose={() => setModalUrl(null)} />
      )} */}

      {/* ===================== PREVIEW MODAL ===================== */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-3xl rounded-lg p-4 relative">
            
            {/* Close button */}
            <Button
              onClick={() => setPreviewFile(null)}
              variant="ghost"
              size="sm"
              className="absolute top-2 right-3"
            >
              ✕
            </Button>

            {/* File name */}
            <p className="text-sm mb-3 font-semibold truncate">
              {previewFile.name}
            </p>

            {/* Preview content */}
            {previewFile.type?.startsWith("image") ? (
              <img
                src={previewFile.url}
                className="w-full max-h-[75vh] object-contain rounded"
              />
            ) : previewFile.type === "application/pdf" ? (
              <iframe
                src={previewFile.url}
                className="w-full h-[75vh] rounded"
                title="PDF Preview"
              />
            ) : (
              <div className="flex flex-col items-center p-10">
                <p className="mb-4">Cannot preview this file type</p>
                <a
                  href={previewFile.url}
                  download
                  className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
                >
                  Download
                </a>
              </div>
            )}

            {/* Bottom actions */}
            <div className="mt-4 flex justify-end gap-3">
              <a
                href={previewFile.url}
                download
                className="inline-flex h-10 items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white"
              >
                Download
              </a>
              <Button
                onClick={() => setPreviewFile(null)}
                variant="secondary"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
</div>

      {/* ----------------------------------------------------
          STATUS TIMELINE
      ---------------------------------------------------- */}
      <Card>
      <CardHeader>
        <CardTitle className="text-lg">Activity Timeline</CardTitle>
      </CardHeader>
      <CardContent className="p-6 pt-0">

      <div className="relative border-l-2 border-blue-500 pl-6 space-y-10">

        {timeline.map((item, i) => (
          <div key={i} className="relative">

            {/* Dot */}
            <div className="absolute -left-[10px] top-2.5 w-2 h-2 bg-blue-600 rounded-full"></div>

            {/* Title */}
            <p className="font-semibold">{item.label}</p>

            {/* Timestamp + User */}
            <p className="text-sm text-gray-600">
              {new Date(item.at).toLocaleString()}  
              {" — "}
              <span className="font-medium">{item.by}</span>
            </p>

            {/* Comment */}
            {item.comment && (
              <p className="text-gray-700 text-sm mt-1">
                💬 {item.comment}
              </p>
            )}
          </div>
        ))}

      </div>
      </CardContent>
         </Card> 

      
    </div>
  );
}
