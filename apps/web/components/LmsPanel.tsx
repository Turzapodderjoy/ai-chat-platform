"use client";

import { useCallback, useEffect, useState } from "react";

import { cardStyle, subtleTextStyle, primaryButtonStyle, secondaryButtonStyle, dangerButtonStyle, labelTextStyle } from "./dashboard-styles";
import { showAlert, showConfirm } from "../lib/app-dialog";

// Wave B #31 / Wave C #30 - LMS onboarding scaffold panel. Lean LmsLite items
// (single self-contained training content: guide/module/course) a shop seeds to
// onboard staff. Wave C #30 adds lessons + staff enrollment to course items.
// businessId from props.

interface LmsItem {
  id: string;
  title: string;
  type: string;
  description: string | null;
  content: string | null;
  order: number;
  isActive: boolean;
}

interface LmsLesson {
  id: string;
  courseId: string;
  title: string;
  content: string | null;
  order: number;
}

interface LmsEnrollment {
  id: string;
  courseId: string;
  staffId: string;
  status: string;
  progress: number;
  staff: { id: string; name: string; email: string | null } | null;
}

interface StaffMember {
  id: string;
  name: string;
  email?: string | null;
  role?: string;
  active?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  guide: "Guide",
  module: "Module",
  course: "Course",
};

const STATUS_LABELS: Record<string, string> = {
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
};

export function LmsPanel({ businessId, active = true }: { businessId: string; active?: boolean }) {
  const [items, setItems] = useState<LmsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LmsItem | null>(null);
  const [draft, setDraft] = useState({ title: "", type: "guide", description: "", content: "" });

  const [expanded, setExpanded] = useState<string | null>(null);
  const [lessons, setLessons] = useState<LmsLesson[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [enrollments, setEnrollments] = useState<LmsEnrollment[]>([]);
  const [lessonDraft, setLessonDraft] = useState({ title: "", content: "" });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/lms?businessId=${encodeURIComponent(businessId)}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    if (!active) return;
    refresh();
  }, [active, refresh]);

  const refreshCourse = useCallback(async (courseId: string) => {
    const [l, s, e] = await Promise.all([
      fetch(`/api/admin/lms/lessons?courseId=${encodeURIComponent(courseId)}`).then((r) => r.json()),
      fetch(`/api/admin/staff?businessId=${encodeURIComponent(businessId)}`).then((r) => r.json()),
      fetch(`/api/admin/lms/enrollments?courseId=${encodeURIComponent(courseId)}`).then((r) => r.json()),
    ]);
    setLessons(l.lessons ?? []);
    setStaff((s.staff ?? []).filter((m: StaffMember) => m.active !== false));
    setEnrollments(e.enrollments ?? []);
  }, [businessId]);

  const toggleExpand = async (courseId: string) => {
    if (expanded === courseId) {
      setExpanded(null);
      return;
    }
    setExpanded(courseId);
    await refreshCourse(courseId);
  };

  const startCreate = () => {
    setEditing({ id: "__new__", title: "", type: "guide", description: null, content: null, order: 0, isActive: true });
    setDraft({ title: "", type: "guide", description: "", content: "" });
  };

  const startEdit = (item: LmsItem) => {
    setEditing(item);
    setDraft({ title: item.title, type: item.type, description: item.description ?? "", content: item.content ?? "" });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!draft.title.trim()) {
      showAlert("Title is required");
      return;
    }
    const payload = {
      title: draft.title.trim(),
      type: draft.type,
      description: draft.description.trim() || null,
      content: draft.content.trim() || null,
    };
    const res = editing.id === "__new__"
      ? await fetch(`/api/admin/lms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, ...payload }) })
      : await fetch(`/api/admin/lms`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, ...payload }) });
    if (res.ok) {
      setEditing(null);
      refresh();
    } else {
      showAlert("Failed to save item");
    }
  };

  const handleToggle = async (item: LmsItem) => {
    const res = await fetch(`/api/admin/lms`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
    });
    if (res.ok) {
      refresh();
    } else {
      showAlert("Failed to update item");
    }
  };

  const handleDelete = async (item: LmsItem) => {
    if (!(await showConfirm(`Delete "${item.title}"?`))) return;
    const res = await fetch(`/api/admin/lms?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    if (res.ok) {
      if (expanded === item.id) setExpanded(null);
      refresh();
    } else {
      showAlert("Failed to delete item");
    }
  };

  const handleAddLesson = async () => {
    if (!expanded || !lessonDraft.title.trim()) {
      showAlert("Lesson title is required");
      return;
    }
    const res = await fetch(`/api/admin/lms/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: expanded, title: lessonDraft.title.trim(), content: lessonDraft.content.trim() || null }),
    });
    if (res.ok) {
      setLessonDraft({ title: "", content: "" });
      refreshCourse(expanded);
    } else {
      showAlert("Failed to save lesson");
    }
  };

  const handleDeleteLesson = async (lesson: LmsLesson) => {
    const res = await fetch(`/api/admin/lms/lessons?id=${encodeURIComponent(lesson.id)}`, { method: "DELETE" });
    if (res.ok) {
      refreshCourse(expanded!);
    } else {
      showAlert("Failed to delete lesson");
    }
  };

  const handleEnroll = async (staffId: string) => {
    if (!expanded) return;
    const res = await fetch(`/api/admin/lms/enrollments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: expanded, staffId }),
    });
    if (res.ok) {
      refreshCourse(expanded);
    } else {
      showAlert("Failed to assign course");
    }
  };

  const handleEnrollmentStatus = async (enrollment: LmsEnrollment, status: string) => {
    const progress = status === "completed" ? 100 : enrollment.progress;
    const res = await fetch(`/api/admin/lms/enrollments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: enrollment.id, status, progress }),
    });
    if (res.ok) {
      refreshCourse(expanded!);
    } else {
      showAlert("Failed to update enrollment");
    }
  };

  const handleUnenroll = async (enrollment: LmsEnrollment) => {
    if (!(await showConfirm(`Remove ${enrollment.staff?.name ?? "staff"} from this course?`))) return;
    const res = await fetch(`/api/admin/lms/enrollments?id=${encodeURIComponent(enrollment.id)}`, { method: "DELETE" });
    if (res.ok) {
      refreshCourse(expanded!);
    } else {
      showAlert("Failed to remove enrollment");
    }
  };

  const activeCount = items.filter((i) => i.isActive).length;
  const enrolledStaffIds = new Set(enrollments.map((e) => e.staffId));
  const availableStaff = staff.filter((m) => !enrolledStaffIds.has(m.id));

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Training & Onboarding</h3>
          <p style={subtleTextStyle}>Guides, modules, and courses for staff onboarding.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ ...labelTextStyle, color: "#6b7280" }}>
            {activeCount} active · {items.length} total
          </span>
          <button style={primaryButtonStyle} onClick={startCreate}>
            + Add Item
          </button>
        </div>
      </div>

      {editing && (
        <div style={{ ...cardStyle, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <input placeholder="Title *" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={{ padding: 8 }} />
          <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} style={{ padding: 8, width: 160 }}>
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <input placeholder="Short description (optional)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} style={{ padding: 8 }} />
          <textarea placeholder="Content / link / notes (optional)" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} style={{ padding: 8, minHeight: 70 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={primaryButtonStyle} onClick={handleSave}>
              {editing.id === "__new__" ? "Create" : "Save"}
            </button>
            <button style={secondaryButtonStyle} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={subtleTextStyle}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={subtleTextStyle}>No training items yet. Add your first onboarding guide.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((item) => (
            <div key={item.id} style={{ border: expanded === item.id ? "1px solid #e5e7eb" : "none", borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: item.isActive ? "#f9fafb" : "#f3f4f6", borderRadius: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {item.title}
                    {!item.isActive && <span style={{ ...subtleTextStyle, marginLeft: 8 }}>(inactive)</span>}
                  </div>
                  <p style={{ ...subtleTextStyle, margin: "2px 0 0" }}>
                    {TYPE_LABELS[item.type] ?? item.type}
                    {item.description ? ` — ${item.description}` : ""}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {item.type === "course" && (
                    <button style={secondaryButtonStyle} onClick={() => toggleExpand(item.id)}>
                      {expanded === item.id ? "Close" : "Lessons & Staff"}
                    </button>
                  )}
                  <button style={secondaryButtonStyle} onClick={() => handleToggle(item)}>
                    {item.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button style={secondaryButtonStyle} onClick={() => startEdit(item)}>
                    Edit
                  </button>
                  <button style={dangerButtonStyle} onClick={() => handleDelete(item)}>
                    Delete
                  </button>
                </div>
              </div>

              {expanded === item.id && (
                <div style={{ padding: "12px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <p style={{ ...labelTextStyle, marginBottom: 6 }}>Lessons ({lessons.length})</p>
                    {lessons.length === 0 && <p style={subtleTextStyle}>No lessons yet.</p>}
                    {lessons.map((lesson, idx) => (
                      <div key={lesson.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderBottom: "1px solid #f3f4f6" }}>
                        <div>
                          <div style={{ fontWeight: 500 }}>{idx + 1}. {lesson.title}</div>
                          {lesson.content && <p style={{ ...subtleTextStyle, margin: "2px 0 0" }}>{lesson.content}</p>}
                        </div>
                        <button style={dangerButtonStyle} onClick={() => handleDeleteLesson(lesson)}>
                          Remove
                        </button>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <input placeholder="Lesson title *" value={lessonDraft.title} onChange={(e) => setLessonDraft({ ...lessonDraft, title: e.target.value })} style={{ padding: 6, flex: 1 }} />
                      <input placeholder="Content (optional)" value={lessonDraft.content} onChange={(e) => setLessonDraft({ ...lessonDraft, content: e.target.value })} style={{ padding: 6, flex: 1 }} />
                      <button style={primaryButtonStyle} onClick={handleAddLesson}>
                        + Add
                      </button>
                    </div>
                  </div>

                  <div>
                    <p style={{ ...labelTextStyle, marginBottom: 6 }}>Enrolled staff ({enrollments.length})</p>
                    {enrollments.length === 0 && <p style={subtleTextStyle}>No staff assigned yet.</p>}
                    {enrollments.map((enrollment) => (
                      <div key={enrollment.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderBottom: "1px solid #f3f4f6" }}>
                        <div>
                          <div style={{ fontWeight: 500 }}>{enrollment.staff?.name ?? "Unknown staff"}</div>
                          <p style={{ ...subtleTextStyle, margin: "2px 0 0" }}>
                            {STATUS_LABELS[enrollment.status] ?? enrollment.status}
                            {enrollment.progress > 0 ? ` · ${enrollment.progress}%` : ""}
                          </p>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <select value={enrollment.status} onChange={(e) => handleEnrollmentStatus(enrollment, e.target.value)} style={{ padding: 6 }}>
                            {Object.entries(STATUS_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>{l}</option>
                            ))}
                          </select>
                          <button style={dangerButtonStyle} onClick={() => handleUnenroll(enrollment)}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                    {availableStaff.length > 0 && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <select defaultValue="" onChange={(e) => handleEnroll(e.target.value)} style={{ padding: 6, flex: 1 }}>
                          <option value="" disabled>Assign course to staff…</option>
                          {availableStaff.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}