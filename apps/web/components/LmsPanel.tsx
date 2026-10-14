"use client";

import { useCallback, useEffect, useState } from "react";

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
    <section className="panel">
      <div className="panel-head">
        <span className="instrument-label">Training and onboarding</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="data" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {activeCount} active of {items.length}
          </span>
          <button onClick={startCreate} className="primary sm">Add item</button>
        </div>
      </div>

      <div className="panel-body">
        <p className="meta" style={{ marginTop: 0, marginBottom: 14, maxWidth: "68ch" }}>
          Guides, modules and courses your staff work through when they join.
        </p>

        {editing && (
          <div
            className="panel-sunk"
            style={{ padding: 14, marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}
          >
            <span className="instrument-label">
              {editing.id === "__new__" ? "New training item" : "Edit training item"}
            </span>
            <div className="field">
              <label className="field-label" htmlFor="aiva-lms-title">Title</label>
              <input id="aiva-lms-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div className="field" style={{ maxWidth: 200 }}>
              <label className="field-label" htmlFor="aiva-lms-type">Type</label>
              <select id="aiva-lms-type" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="aiva-lms-description">Short description (optional)</label>
              <input
                id="aiva-lms-description"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="aiva-lms-content">Content, link or notes (optional)</label>
              <textarea
                id="aiva-lms-content"
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                style={{ minHeight: 70 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSave} className="primary sm">
                {editing.id === "__new__" ? "Create" : "Save"}
              </button>
              <button onClick={() => setEditing(null)} className="ghost sm">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton" style={{ height: 44 }} />
            <div className="skeleton" style={{ height: 44 }} />
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No training items yet</div>
            <div className="empty-state-description">
              Add your first onboarding guide, module or course to get new staff up to speed.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((item) => (
              <div key={item.id} className="panel-sunk" style={{ padding: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--ink)",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      {item.title}
                      <span className={item.isActive ? "lamp lamp-ok" : "lamp lamp-idle"}>
                        {item.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="data" style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>
                      {TYPE_LABELS[item.type] ?? item.type}
                    </div>
                    {item.description && <p className="meta" style={{ margin: "4px 0 0" }}>{item.description}</p>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {item.type === "course" && (
                      <button onClick={() => toggleExpand(item.id)} className="ghost sm">
                        {expanded === item.id ? "Close" : "Lessons and staff"}
                      </button>
                    )}
                    <button onClick={() => handleToggle(item)} className="ghost sm">
                      {item.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button onClick={() => startEdit(item)} className="ghost sm">Edit</button>
                    <button onClick={() => handleDelete(item)} className="danger sm">Delete</button>
                  </div>
                </div>

                {expanded === item.id && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                      marginTop: 14,
                      paddingTop: 14,
                      borderTop: "1px solid var(--line-soft)",
                    }}
                  >
                    <div>
                      <span className="instrument-label">Lessons ({lessons.length})</span>
                      {lessons.length === 0 && (
                        <div className="empty-state">
                          <div className="empty-state-title">No lessons yet</div>
                          <div className="empty-state-description">
                            Add the steps staff should work through in order.
                          </div>
                        </div>
                      )}
                      {lessons.map((lesson, idx) => (
                        <div
                          key={lesson.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            padding: "7px 0",
                            borderBottom: "1px solid var(--line-soft)",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 500, color: "var(--ink)" }}>
                              <span className="data" style={{ color: "var(--ink-4)", marginRight: 6 }}>{idx + 1}</span>
                              {lesson.title}
                            </div>
                            {lesson.content && <p className="meta" style={{ margin: "3px 0 0" }}>{lesson.content}</p>}
                          </div>
                          <button onClick={() => handleDeleteLesson(lesson)} className="danger sm">Remove</button>
                        </div>
                      ))}
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          marginTop: 10,
                          alignItems: "flex-end",
                          flexWrap: "wrap",
                        }}
                      >
                        <div className="field" style={{ flex: "1 1 180px", minWidth: 0 }}>
                          <label className="field-label" htmlFor="aiva-lms-lesson-title">Lesson title</label>
                          <input
                            id="aiva-lms-lesson-title"
                            value={lessonDraft.title}
                            onChange={(e) => setLessonDraft({ ...lessonDraft, title: e.target.value })}
                          />
                        </div>
                        <div className="field" style={{ flex: "1 1 220px", minWidth: 0 }}>
                          <label className="field-label" htmlFor="aiva-lms-lesson-content">Lesson content (optional)</label>
                          <input
                            id="aiva-lms-lesson-content"
                            value={lessonDraft.content}
                            onChange={(e) => setLessonDraft({ ...lessonDraft, content: e.target.value })}
                          />
                        </div>
                        <button onClick={handleAddLesson} className="primary sm">Add lesson</button>
                      </div>
                    </div>

                    <div>
                      <span className="instrument-label">Enrolled staff ({enrollments.length})</span>
                      {enrollments.length === 0 && (
                        <div className="empty-state">
                          <div className="empty-state-title">No staff assigned</div>
                          <div className="empty-state-description">
                            Assign this course to a staff member to start tracking their progress.
                          </div>
                        </div>
                      )}
                      {enrollments.map((enrollment) => (
                        <div
                          key={enrollment.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            padding: "7px 0",
                            borderBottom: "1px solid var(--line-soft)",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 500, color: "var(--ink)" }}>
                              {enrollment.staff?.name ?? "Unknown staff"}
                            </div>
                            <div className="data" style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>
                              {STATUS_LABELS[enrollment.status] ?? enrollment.status}
                              {enrollment.progress > 0 && (
                                <span style={{ marginLeft: 8 }}>{enrollment.progress}%</span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                            <div className="field" style={{ width: 150 }}>
                              <label className="field-label" htmlFor={`aiva-lms-enroll-status-${enrollment.id}`}>
                                Status
                              </label>
                              <select
                                id={`aiva-lms-enroll-status-${enrollment.id}`}
                                value={enrollment.status}
                                onChange={(e) => handleEnrollmentStatus(enrollment, e.target.value)}
                              >
                                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                                  <option key={v} value={v}>{l}</option>
                                ))}
                              </select>
                            </div>
                            <button onClick={() => handleUnenroll(enrollment)} className="danger sm">Remove</button>
                          </div>
                        </div>
                      ))}
                      {availableStaff.length > 0 && (
                        <div className="field" style={{ maxWidth: 260, marginTop: 10 }}>
                          <label className="field-label" htmlFor="aiva-lms-assign">Assign course to staff</label>
                          <select id="aiva-lms-assign" defaultValue="" onChange={(e) => handleEnroll(e.target.value)}>
                            <option value="" disabled>Choose a staff member</option>
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
    </section>
  );
}