 import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../db";
import { supabase } from "../lib/supabase";
import { deleteReport } from "../utils/deleteReport";
import ReactMarkdown from "react-markdown";
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
  const [currentUserId, setCurrentUserId] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingMessage, setEditingMessage] = useState("");
  const [commentActionLoading, setCommentActionLoading] = useState(false);
  const [publicReplyAttachments, setPublicReplyAttachments] = useState([]);
  const [internalNoteAttachments, setInternalNoteAttachments] = useState([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);

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

        setCurrentUserId(user.id);

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
          // Fetch attachments for each comment
          const commentsWithAttachments = await Promise.all(
            commentData.map(async (comment) => {
              const { data: attachData, error: attachError } = await supabase
                .from("comment_attachments")
                .select("*")
                .eq("comment_id", comment.id);
              return {
                ...comment,
                attachments: attachError ? [] : attachData || []
              };
            })
          );
          setComments(commentsWithAttachments);
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
      <div className="p-2 px-2 max-w-4xl mx-auto">
        <Alert className="border-red-200 bg-red-50 text-red-700">
          <AlertDescription>Report not found</AlertDescription>
        </Alert>
      </div>
    );

  const canManageReport = userRole === "manager" || (currentUserId && report.user_id === currentUserId);

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

  function isImageFile(att) {
    const mime = (att?.mime_type || "").toLowerCase();
    const name = (att?.file_name || "").toLowerCase();
    return mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name);
  }

  function getAttachmentUrl(att) {
    return att?.file_url || "";
  }

  async function handlePublicReplyAttachments(e) {
    const files = Array.from(e.target.files || []);
    setPublicReplyAttachments(prev => [...prev, ...files]);
    e.target.value = "";
  }

  async function sendPublicReply() {
    if (!publicReply.trim() && publicReplyAttachments.length === 0) return;

    setUploadingAttachments(true);

    // Get logged-in user FIRST
    const {
      data: { user }
    } = await supabase.auth.getUser();

    // Then insert comment
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

    if (error) {
      console.error("Error sending reply:", error);
      setUploadingAttachments(false);
      return;
    }

    // Upload attachments if any
    const uploadedAttachments = [];
    for (const file of publicReplyAttachments) {
      const fileName = `${Date.now()}_${file.name}`;
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from("attachments")
        .upload(`comment/${data.id}/${fileName}`, file);

      if (!uploadError && uploadData) {
        const { data: { publicUrl } } = supabase.storage
          .from("attachments")
          .getPublicUrl(`comment/${data.id}/${fileName}`);

        const { error: attachError, data: attachData } = await supabase
          .from("comment_attachments")
          .insert({
            comment_id: data.id,
            file_name: file.name,
            file_url: publicUrl,
            file_size: file.size,
            mime_type: file.type,
            uploaded_by: user.id
          })
          .select()
          .single();

        if (!attachError && attachData) {
          uploadedAttachments.push(attachData);
        }
      } else if (uploadError) {
        console.error("Error uploading public reply attachment:", uploadError);
      }
    }

    setComments(prev => [{
      ...data,
      attachments: uploadedAttachments
    }, ...prev]);
    setPublicReply("");
    setPublicReplyAttachments([]);
    setUploadingAttachments(false);
  }

  async function handleInternalNoteAttachments(e) {
    const files = Array.from(e.target.files || []);
    setInternalNoteAttachments(prev => [...prev, ...files]);
    e.target.value = "";
  }

  async function sendInternalNote() {
    if (!internalNote.trim() && internalNoteAttachments.length === 0) return;

    setUploadingAttachments(true);

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

    if (error) {
      console.error("Error sending internal note:", error);
      setUploadingAttachments(false);
      return;
    }

    // Upload attachments if any
    const uploadedAttachments = [];
    for (const file of internalNoteAttachments) {
      const fileName = `${Date.now()}_${file.name}`;
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from("attachments")
        .upload(`comment/${data.id}/${fileName}`, file);

      if (!uploadError && uploadData) {
        const { data: { publicUrl } } = supabase.storage
          .from("attachments")
          .getPublicUrl(`comment/${data.id}/${fileName}`);

        const { error: attachError, data: attachData } = await supabase
          .from("comment_attachments")
          .insert({
            comment_id: data.id,
            file_name: file.name,
            file_url: publicUrl,
            file_size: file.size,
            mime_type: file.type,
            uploaded_by: user.id
          })
          .select()
          .single();

        if (!attachError && attachData) {
          uploadedAttachments.push(attachData);
        }
      } else if (uploadError) {
        console.error("Error uploading internal note attachment:", uploadError);
      }
    }

    setComments(prev => [{
      ...data,
      attachments: uploadedAttachments
    }, ...prev]);
    setInternalNote("");
    setInternalNoteAttachments([]);
    setUploadingAttachments(false);
  }

  function beginEditComment(comment) {
    setEditingCommentId(comment.id);
    setEditingMessage(comment.message || "");
  }

  function cancelEditComment() {
    setEditingCommentId(null);
    setEditingMessage("");
  }

  async function saveEditComment(commentId) {
    if (!currentUserId || !editingMessage.trim()) return;

    setCommentActionLoading(true);

    const nextMessage = editingMessage.trim();
    const updatedAt = new Date().toISOString();

    const { error } = await supabase
      .from("report_comments")
      .update({
        message: nextMessage,
        updated_at: updatedAt
      })
      .eq("id", commentId)
      .eq("user_id", currentUserId);

    if (error) {
      console.error("Error updating comment:", error);
      setCommentActionLoading(false);
      return;
    }

    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? {
              ...c,
              message: nextMessage,
              updated_at: updatedAt
            }
          : c
      )
    );

    cancelEditComment();
    setCommentActionLoading(false);
  }

  async function deleteOwnComment(commentId) {
    if (!currentUserId) return;
    if (!confirm("Delete this post?")) return;

    setCommentActionLoading(true);

    const { error, count } = await supabase
      .from("report_comments")
      .delete({ count: "exact" })
      .eq("id", commentId)
      .eq("user_id", currentUserId);

    if (error) {
      console.error("Error deleting comment:", error);
      alert("Failed to delete: " + error.message);
      setCommentActionLoading(false);
      return;
    }

    if (count === 0) {
      console.error("Delete was blocked — check Supabase RLS policies for report_comments.");
      alert("Could not delete the post. You may not have permission.");
      setCommentActionLoading(false);
      return;
    }

    setComments((prev) => prev.filter((c) => c.id !== commentId));

    if (editingCommentId === commentId) {
      cancelEditComment();
    }

    setCommentActionLoading(false);
  }

  function isCommentEdited(comment) {
    if (!comment?.updated_at || !comment?.created_at) return false;
    return new Date(comment.updated_at).getTime() > new Date(comment.created_at).getTime();
  }

  return (
    <div className="p-2 px-2 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
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

        <div className="text-gray-700 max-w-none">
          <ReactMarkdown
            components={{
              p: ({ node, ...props }) => <p className="mb-2 leading-relaxed" {...props} />,
              ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-2 ml-2" {...props} />,
              ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-2 ml-2" {...props} />,
              li: ({ node, ...props }) => <li className="mb-1" {...props} />,
              h1: ({ node, ...props }) => <h1 className="text-xl font-bold mb-2 mt-3" {...props} />,
              h2: ({ node, ...props }) => <h2 className="text-lg font-bold mb-2 mt-3" {...props} />,
              h3: ({ node, ...props }) => <h3 className="text-base font-bold mb-2 mt-2" {...props} />,
              code: ({ node, ...props }) => <code className="bg-gray-200 px-1 py-0.5 rounded text-sm font-mono" {...props} />,
              pre: ({ node, ...props }) => <pre className="bg-gray-100 p-3 rounded mb-2 overflow-x-auto" {...props} />,
              blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-gray-400 pl-3 italic text-gray-600 mb-2" {...props} />,
              a: ({ node, ...props }) => <a className="text-blue-600 underline hover:text-blue-800" {...props} />,
            }}
          >
            {report.description || "No description provided"}
          </ReactMarkdown>
        </div>

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
          const isImage = isImageFile(att);
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

          {/* File Input and Preview for Public Reply */}
          <div className="mt-3 border border-dashed border-gray-300 rounded p-3 bg-gray-50">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Attachments
            </label>
            <input
              type="file"
              multiple
              onChange={handlePublicReplyAttachments}
              className="block w-full text-sm text-gray-600 cursor-pointer"
              disabled={uploadingAttachments}
            />
            {publicReplyAttachments.length > 0 && (
              <div className="mt-2 space-y-1">
                {publicReplyAttachments.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm bg-white p-2 rounded border">
                    <span className="truncate">{file.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPublicReplyAttachments(prev => prev.filter((_, i) => i !== idx))}
                      className="h-6 px-2"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button
            onClick={sendPublicReply}
            disabled={uploadingAttachments || (!publicReply.trim() && publicReplyAttachments.length === 0)}
            className="mt-3"
          >
            {uploadingAttachments ? "Uploading..." : "Send Response"}
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
                      {isCommentEdited(c) ? " (edited)" : ""}
                    </p>
                  </div>

                  {editingCommentId === c.id ? (
                    <>
                      <Textarea
                        value={editingMessage}
                        onChange={(e) => setEditingMessage(e.target.value)}
                        rows={3}
                      />
                      <div className="mt-2 flex gap-2">
                        <Button
                          onClick={() => saveEditComment(c.id)}
                          disabled={commentActionLoading || !editingMessage.trim()}
                          className="h-8 px-3"
                        >
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          onClick={cancelEditComment}
                          disabled={commentActionLoading}
                          className="h-8 px-3"
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
                        {c.message}
                      </p>

                      {/* Display Comment Attachments */}
                      {c.attachments && c.attachments.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {c.attachments.map((att) => {
                            const isImage = isImageFile(att);
                            const fileUrl = getAttachmentUrl(att);
                            return (
                              <div key={att.id} className="border border-gray-300 rounded p-2 bg-white">
                                {isImage ? (
                                  <img
                                    src={fileUrl}
                                    alt={att.file_name}
                                    onClick={() => setPreviewFile({
                                      url: fileUrl,
                                      name: att.file_name,
                                      type: att.mime_type,
                                    })}
                                    className="w-full h-20 object-cover rounded cursor-pointer hover:opacity-80"
                                  />
                                ) : (
                                  <div className="w-full h-20 bg-gray-100 flex items-center justify-center rounded">
                                    <span className="text-gray-600 text-xs">📄</span>
                                  </div>
                                )}
                                <p className="text-xs mt-1 text-gray-700 truncate">{att.file_name}</p>
                                <div className="mt-1 flex gap-2">
                                  <Button
                                    variant="link"
                                    className="h-auto p-0 text-xs"
                                    onClick={() =>
                                      fileUrl &&
                                      setPreviewFile({
                                        url: fileUrl,
                                        name: att.file_name,
                                        type: att.mime_type,
                                      })
                                    }
                                    disabled={!fileUrl}
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
                      )}

                      {currentUserId && c.user_id === currentUserId && (
                        <div className="mt-2 flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 px-3"
                            onClick={() => beginEditComment(c)}
                            disabled={commentActionLoading}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            className="h-8 px-3"
                            onClick={() => deleteOwnComment(c.id)}
                            disabled={commentActionLoading}
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </>
                  )}
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

          {/* File Input and Preview for Internal Note */}
          <div className="mt-3 border border-dashed border-gray-300 rounded p-3 bg-gray-50">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Attachments
            </label>
            <input
              type="file"
              multiple
              onChange={handleInternalNoteAttachments}
              className="block w-full text-sm text-gray-600 cursor-pointer"
              disabled={uploadingAttachments}
            />
            {internalNoteAttachments.length > 0 && (
              <div className="mt-2 space-y-1">
                {internalNoteAttachments.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm bg-white p-2 rounded border">
                    <span className="truncate">{file.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setInternalNoteAttachments(prev => prev.filter((_, i) => i !== idx))}
                      className="h-6 px-2"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button
            onClick={sendInternalNote}
            disabled={uploadingAttachments || (!internalNote.trim() && internalNoteAttachments.length === 0)}
            variant="secondary"
            className="mt-3"
          >
            {uploadingAttachments ? "Uploading..." : "Add Internal Note"}
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
                      {isCommentEdited(c) ? " (edited)" : ""}
                    </p>
                  </div>

                  {editingCommentId === c.id ? (
                    <>
                      <Textarea
                        value={editingMessage}
                        onChange={(e) => setEditingMessage(e.target.value)}
                        rows={3}
                      />
                      <div className="mt-2 flex gap-2">
                        <Button
                          onClick={() => saveEditComment(c.id)}
                          disabled={commentActionLoading || !editingMessage.trim()}
                          className="h-8 px-3"
                        >
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          onClick={cancelEditComment}
                          disabled={commentActionLoading}
                          className="h-8 px-3"
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
                        {c.message}
                      </p>

                      {/* Display Comment Attachments */}
                      {c.attachments && c.attachments.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {c.attachments.map((att) => {
                            const isImage = isImageFile(att);
                            const fileUrl = getAttachmentUrl(att);
                            return (
                              <div key={att.id} className="border border-gray-300 rounded p-2 bg-white">
                                {isImage ? (
                                  <img
                                    src={fileUrl}
                                    alt={att.file_name}
                                    onClick={() => setPreviewFile({
                                      url: fileUrl,
                                      name: att.file_name,
                                      type: att.mime_type,
                                    })}
                                    className="w-full h-20 object-cover rounded cursor-pointer hover:opacity-80"
                                  />
                                ) : (
                                  <div className="w-full h-20 bg-gray-100 flex items-center justify-center rounded">
                                    <span className="text-gray-600 text-xs">📄</span>
                                  </div>
                                )}
                                <p className="text-xs mt-1 text-gray-700 truncate">{att.file_name}</p>
                                <div className="mt-1 flex gap-2">
                                  <Button
                                    variant="link"
                                    className="h-auto p-0 text-xs"
                                    onClick={() =>
                                      fileUrl &&
                                      setPreviewFile({
                                        url: fileUrl,
                                        name: att.file_name,
                                        type: att.mime_type,
                                      })
                                    }
                                    disabled={!fileUrl}
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
                      )}

                      {currentUserId && c.user_id === currentUserId && (
                        <div className="mt-2 flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 px-3"
                            onClick={() => beginEditComment(c)}
                            disabled={commentActionLoading}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            className="h-8 px-3"
                            onClick={() => deleteOwnComment(c.id)}
                            disabled={commentActionLoading}
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
          </div>
        </>
      )}

      </CardContent>
      </Card>

      {/* EDIT/DELETE (manager or report owner only) */}
      {canManageReport && (
        <>
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
        </>
      )}

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
