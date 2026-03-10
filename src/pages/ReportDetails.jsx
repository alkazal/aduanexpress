import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../db";
import { supabase } from "../lib/supabase";
import { deleteReport } from "../utils/deleteReport";

// For image modal
function Modal({ url, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <img
        src={url}
        className="max-h-[90vh] max-w-[90vw] rounded shadow-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export default function ReportDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [report, setReport] = useState(null);
  const [attachments, setAttachments] = useState([]);

  const [modalUrl, setModalUrl] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);

  const [loading, setLoading] = useState(true);

  const [publicReply, setPublicReply] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [comments, setComments] = useState([]);
  const [activeTab, setActiveTab] = useState("public");

  // ----------------------------------------------------
  // LOAD REPORT (Offline first, then online fallback)
  // ----------------------------------------------------
  useEffect(() => {
    async function load() {
      setLoading(true);

      // 1. Try Dexie first
      const local = await db.reports.get(id);
      if (local) {
        setReport(local);

        local.history = local._status_changes || [];

        if (local.project_id && !local.project_name) {
          const proj = await db.projects.get(local.project_id);
          if (proj) {
            setReport((prev) => ({
              ...prev,
              project_name: proj.name
            }));
          }
        }
        
        const att = await db.attachments
          .where("report_id")
          .equals(id)
          .and((a) => !a.to_delete)
          .toArray();
        setAttachments(att);
      }

      // 2. If online → fetch fresh version from Supabase
      if (navigator.onLine) {
        const { data: online, error } = await supabase
          .from("reports")
          .select(
            `
            *,
            reporter:user_id ( full_name ),
            technician:assigned_to ( full_name ),
            project:project_id ( id, name ),
            history:report_status_history (
              id,
              old_status,
              new_status,
              changed_at,
              comment,
              changed_by,
              changed_by_name
            )
          `
          )
          .eq("id", id)
          .single();

        if (!error && online) {
          setReport({
            ...online,
            project_id: online.project?.id || online.project_id || null,
            project_name: online.project?.name || online.project_name || null
          });

          const { data: onlineAtt } = await supabase
            .from("attachments")
            .select("*")
            .eq("report_id", id);

          setAttachments(onlineAtt || []);
        }
      }

      setLoading(false);

      const { data: commentData } = await supabase
      .from("report_comments")
      .select("*")
      .eq("report_id", id)
      .order("created_at", { ascending: false });

    if (commentData) {
      setComments(commentData);
    }
    }

    load();
  }, [id]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") {
        setPreviewFile(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  if (loading) return <p className="p-6">Loading...</p>;
  if (!report)
    return <p className="p-6 text-red-500">Report not found</p>;

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

    const { data, error } = await supabase
      .from("report_comments")
      .insert({
        report_id: id,
        message: publicReply,
        user_name: "Technician",
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

    const { data, error } = await supabase
      .from("report_comments")
      .insert({
        report_id: id,
        message: internalNote,
        user_name: "Technician",
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

      <button
        onClick={() => navigate(-1)}
        className="text-blue-600 underline mb-4"
      >
        ← Back
      </button>

      <div className="bg-white border rounded-xl p-6 shadow-sm">
        <h1 className="text-2xl font-bold mb-2">
          #{report.ticket_no}
        </h1>

        <p className="text-lg text-gray-700">
          {report.title}
        </p>

        <span className="inline-block mt-2 px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded">
          {report.status}
        </span>
      </div>

            <div className="bg-white border rounded-xl p-6 shadow-sm mt-4">
        <h2 className="font-semibold mb-2">Description</h2>

        <p className="text-gray-700">
          {report.description}
        </p>

        <div className="grid grid-cols-2 gap-4 mt-4 text-sm">

          <div>
            <p className="text-gray-500">Project</p>
            <p className="font-medium">
              {report.project_name || report.project_id}
            </p>
          </div>

          <div>
            <p className="text-gray-500">Submitted By</p>
            <p className="font-medium">
              {report.reporter?.full_name || report.reporter_name}
            </p>
          </div>

      </div>
    </div>

      {/* ----------------------------------------------------
          ATTACHMENTS
      ---------------------------------------------------- */}
      <div className="bg-white border rounded-xl p-6 shadow-sm mt-6">

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
                  <button
                    onClick={() =>
                      setPreviewFile({
                        url: fileUrl,
                        name: att.file_name,
                        type: att.mime_type,
                      })
                    }
                    className="text-blue-600 text-xs underline"
                  >
                    View
                  </button>

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
      </div>

      <div className="bg-white border rounded-xl p-6 shadow-sm mt-6">

      <h2 className="text-lg font-semibold mb-4">Communication</h2>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
        <button
          onClick={() => setActiveTab("public")}
          className={`flex-1 py-2 text-sm rounded ${
            activeTab === "public" ? "bg-white shadow" : ""
          }`}
        >
          Public Reply
        </button>

        <button
          onClick={() => setActiveTab("internal")}
          className={`flex-1 py-2 text-sm rounded ${
            activeTab === "internal" ? "bg-white shadow" : ""
          }`}
        >
          Internal Notes
        </button>
      </div>

      {/* PUBLIC REPLY */}
      {activeTab === "public" && (
        <>
          <textarea
            value={publicReply}
            onChange={(e) => setPublicReply(e.target.value)}
            placeholder="Type your response to the user..."
            className="w-full border rounded-lg p-3 text-sm"
            rows={4}
          />

          <button
            onClick={sendPublicReply}
            className="mt-3 bg-black text-white px-4 py-2 rounded"
          >
            Send Response
          </button>

          {/* Previous Public Replies */}
          <div className="mt-6 space-y-3">
            {comments
              .filter(c => !c.is_internal)
              .map(c => (
                <div key={c.id} className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between mb-1">
                    <span className="font-medium">{c.user_name}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-sm text-gray-700">{c.message}</p>
                </div>
              ))}
          </div>
        </>
      )}

      {/* INTERNAL NOTES */}
      {activeTab === "internal" && (
        <>
          <textarea
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            placeholder="Add internal troubleshooting notes..."
            className="w-full border rounded-lg p-3 text-sm"
            rows={4}
          />

          <button
            onClick={sendInternalNote}
            className="mt-3 bg-gray-800 text-white px-4 py-2 rounded"
          >
            Add Internal Note
          </button>

          {/* Previous Internal Notes */}
          <div className="mt-6 space-y-3">
            {comments
              .filter(c => c.is_internal)
              .map(c => (
                <div key={c.id} className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                  <div className="flex justify-between mb-1">
                    <span className="font-medium">{c.user_name}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-sm text-gray-700">{c.message}</p>
                </div>
              ))}
          </div>
        </>
      )}

      </div>

       {/* EDIT BUTTON */}
      <button
        className="mt-6 w-full bg-blue-600 text-white py-2 rounded"
        onClick={() => navigate(`/report/${id}/edit`)}
      >
        Edit Report
      </button>
      <button
        className="mt-6 w-full bg-red-600 text-white py-2 rounded"
        onClick={async () => {
          if (confirm("Delete this report?")) {
            await deleteReport(report);
            navigate("/");
          }
        }}        
      >
        Delete
      </button>

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
            <button
              onClick={() => setPreviewFile(null)}
              className="absolute top-2 right-3 text-gray-500 hover:text-black text-lg"
            >
              ✕
            </button>

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
                  className="bg-blue-600 text-white px-4 py-2 rounded"
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
                className="bg-green-600 text-white px-4 py-2 rounded"
              >
                Download
              </a>
              <button
                onClick={() => setPreviewFile(null)}
                className="bg-gray-300 px-4 py-2 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
</div>

      {/* ----------------------------------------------------
          STATUS TIMELINE
      ---------------------------------------------------- */}
      <div className="bg-white border rounded-xl p-6 shadow-sm">

      <h2 className="text-lg font-semibold mb-4">
        Activity Timeline
      </h2>

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
     </div> 

      
    </div>
  );
}
