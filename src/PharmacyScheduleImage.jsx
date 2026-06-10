// ==================== PHARMACY SCHEDULE IMAGE MANAGER ====================
import React, { useState, useEffect } from "react";

const Icon = ({ name, size = 20, color = "currentColor" }) => {
  const icons = {
    chevronDown:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>,
    chevronUp:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>,
    trash:         <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
    check:         <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
    close:         <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  };
  return icons[name] || null;
};

export default function PharmacyScheduleImage({ supabase, darkMode = false }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newForm, setNewForm] = useState({
    title: "",
    image_url: "",
    is_active: true,
  });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showPreview, setShowPreview] = useState(null);

  // Load schedules on mount
  useEffect(() => {
    loadSchedules();
  }, []);

  async function loadSchedules() {
    setLoading(true);
    try {
      const data = await supabase("pharmacy_schedules", "GET", null, "?order=created_at.desc");
      if (data) {
        setSchedules(data);
      }
    } catch (error) {
      console.error("خطأ في تحميل جداول الصيدليات:", error);
    }
    setLoading(false);
  }

  async function addSchedule() {
    if (!newForm.title.trim()) {
      return alert("يجب إدخال عنوان الجدول!");
    }
    if (!newForm.image_url.trim()) {
      return alert("يجب إدخال رابط الصورة!");
    }

    setSaving(true);
    try {
      await supabase("pharmacy_schedules", "POST", {
        title: newForm.title,
        image_url: newForm.image_url,
        is_active: newForm.is_active,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      
      alert("✅ تم إضافة جدول الصيدليات بنجاح!");
      setNewForm({ title: "", image_url: "", is_active: true });
      loadSchedules();
    } catch (error) {
      alert("❌ حدث خطأ في حفظ الجدول");
      console.error(error);
    }
    setSaving(false);
  }

  async function updateSchedule(id) {
    if (!editForm.title?.trim()) {
      return alert("يجب إدخال عنوان الجدول!");
    }
    if (!editForm.image_url?.trim()) {
      return alert("يجب إدخال رابط الصورة!");
    }

    setSaving(true);
    try {
      await supabase("pharmacy_schedules", "PATCH", {
        title: editForm.title,
        image_url: editForm.image_url,
        is_active: editForm.is_active,
        updated_at: new Date().toISOString(),
      }, `?id=eq.${id}`);
      
      alert("✅ تم تحديث جدول الصيدليات!");
      setEditingId(null);
      loadSchedules();
    } catch (error) {
      alert("❌ حدث خطأ في تحديث الجدول");
      console.error(error);
    }
    setSaving(false);
  }

  async function deleteSchedule(id) {
    if (confirm("هل تريد حقاً حذف هذا الجدول؟")) {
      try {
        await supabase("pharmacy_schedules", "DELETE", null, `?id=eq.${id}`);
        alert("✅ تم حذف جدول الصيدليات!");
        loadSchedules();
      } catch (error) {
        alert("❌ حدث خطأ في حذف الجدول");
        console.error(error);
      }
    }
  }

  async function toggleActive(id, currentStatus) {
    try {
      await supabase("pharmacy_schedules", "PATCH", {
        is_active: !currentStatus,
        updated_at: new Date().toISOString(),
      }, `?id=eq.${id}`);
      loadSchedules();
    } catch (error) {
      console.error("خطأ في تغيير حالة الجدول:", error);
    }
  }

  if (loading) {
    return (
      <div style={{
        textAlign: "center",
        padding: "20px",
        fontFamily: "'Cairo', sans-serif",
        color: "#666",
      }}>
        جاري التحميل...
      </div>
    );
  }

  return (
    <div style={{
      background: darkMode ? "#2c3e50" : "#fff",
      borderRadius: "12px",
      padding: "16px",
      marginBottom: "16px",
    }}>
      {/* Header */}
      <div style={{
        fontSize: "16px",
        fontWeight: "800",
        color: "#c0392b",
        marginBottom: "16px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontFamily: "'Cairo', sans-serif",
      }}>
        💊 جداول مناوبة الصيدليات
        <span style={{
          background: "#c0392b",
          color: "#fff",
          borderRadius: "50%",
          width: "24px",
          height: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "12px",
          fontWeight: "700",
        }}>
          {schedules.filter(s => s.is_active).length}
        </span>
      </div>

      {/* Add New Schedule */}
      <div style={{
        background: darkMode ? "#34495e" : "#f8f9fa",
        borderRadius: "10px",
        padding: "14px",
        marginBottom: "16px",
        border: `1.5px solid ${darkMode ? "#455a64" : "#e0e0e0"}`,
      }}>
        <div style={{
          fontWeight: "700",
          fontSize: "13px",
          color: darkMode ? "#ecf0f1" : "#2c3e50",
          marginBottom: "12px",
          fontFamily: "'Cairo', sans-serif",
        }}>
          ➕ إضافة جدول جديد
        </div>

        <input
          type="text"
          placeholder="عنوان الجدول (مثال: مناوبة الأسبوع الأول)"
          value={newForm.title}
          onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "8px",
            border: `1.5px solid ${darkMode ? "#455a64" : "#ddd"}`,
            fontFamily: "'Cairo', sans-serif",
            fontSize: "13px",
            marginBottom: "10px",
            boxSizing: "border-box",
            background: darkMode ? "#2c3e50" : "#fff",
            color: darkMode ? "#ecf0f1" : "#000",
          }}
        />

        <input
          type="text"
          placeholder="رابط الصورة (URL)"
          value={newForm.image_url}
          onChange={(e) => setNewForm({ ...newForm, image_url: e.target.value })}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "8px",
            border: `1.5px solid ${darkMode ? "#455a64" : "#ddd"}`,
            fontFamily: "'Cairo', sans-serif",
            fontSize: "13px",
            marginBottom: "10px",
            boxSizing: "border-box",
            background: darkMode ? "#2c3e50" : "#fff",
            color: darkMode ? "#ecf0f1" : "#000",
          }}
        />

        {/* Preview Image */}
        {newForm.image_url && (
          <div style={{
            marginBottom: "10px",
            borderRadius: "8px",
            overflow: "hidden",
            border: `1.5px solid ${darkMode ? "#455a64" : "#ddd"}`,
          }}>
            <img
              src={newForm.image_url}
              alt="معاينة"
              style={{
                width: "100%",
                maxHeight: "200px",
                objectFit: "cover",
              }}
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          </div>
        )}

        {/* Active Toggle */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
        }}>
          <span style={{
            fontSize: "13px",
            color: darkMode ? "#bdc3c7" : "#666",
            fontFamily: "'Cairo', sans-serif",
          }}>
            تفعيل الجدول
          </span>
          <div
            onClick={() => setNewForm({ ...newForm, is_active: !newForm.is_active })}
            style={{
              width: "44px",
              height: "24px",
              borderRadius: "20px",
              background: newForm.is_active ? "#27ae60" : "#bdc3c7",
              position: "relative",
              cursor: "pointer",
              transition: "background 0.3s",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "3px",
                right: newForm.is_active ? "3px" : "20px",
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: "#fff",
                transition: "right 0.3s",
                boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
              }}
            />
          </div>
        </div>

        <button
          onClick={addSchedule}
          disabled={saving}
          style={{
            width: "100%",
            padding: "10px",
            background: saving ? "#bdc3c7" : "#27ae60",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontFamily: "'Cairo', sans-serif",
            fontWeight: "700",
            fontSize: "13px",
            cursor: saving ? "not-allowed" : "pointer",
            transition: "background 0.3s",
          }}
        >
          {saving ? "جاري الحفظ..." : "✅ إضافة الجدول"}
        </button>
      </div>

      {/* List of Schedules */}
      <div>
        {schedules.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "20px",
            color: darkMode ? "#95a5a6" : "#999",
            fontSize: "13px",
            fontFamily: "'Cairo', sans-serif",
          }}>
            لا توجد جداول محفوظة
          </div>
        ) : (
          schedules.map((schedule) => (
            <div
              key={schedule.id}
              style={{
                background: darkMode ? "#34495e" : "#f8f9fa",
                borderRadius: "10px",
                padding: "12px",
                marginBottom: "10px",
                border: `1.5px solid ${schedule.is_active ? "#27ae60" : "#bdc3c7"}`,
              }}
            >
              {editingId === schedule.id ? (
                // Edit Mode
                <div>
                  <input
                    type="text"
                    value={editForm.title || ""}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    placeholder="العنوان"
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "6px",
                      border: `1.5px solid ${darkMode ? "#455a64" : "#ddd"}`,
                      fontFamily: "'Cairo', sans-serif",
                      fontSize: "12px",
                      marginBottom: "8px",
                      boxSizing: "border-box",
                      background: darkMode ? "#2c3e50" : "#fff",
                      color: darkMode ? "#ecf0f1" : "#000",
                    }}
                  />
                  <input
                    type="text"
                    value={editForm.image_url || ""}
                    onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value })}
                    placeholder="رابط الصورة"
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "6px",
                      border: `1.5px solid ${darkMode ? "#455a64" : "#ddd"}`,
                      fontFamily: "'Cairo', sans-serif",
                      fontSize: "12px",
                      marginBottom: "8px",
                      boxSizing: "border-box",
                      background: darkMode ? "#2c3e50" : "#fff",
                      color: darkMode ? "#ecf0f1" : "#000",
                    }}
                  />
                  <div style={{
                    display: "flex",
                    gap: "8px",
                    fontSize: "12px",
                  }}>
                    <button
                      onClick={() => updateSchedule(schedule.id)}
                      disabled={saving}
                      style={{
                        flex: 1,
                        padding: "8px",
                        background: saving ? "#bdc3c7" : "#27ae60",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        fontFamily: "'Cairo', sans-serif",
                        fontWeight: "700",
                        cursor: saving ? "not-allowed" : "pointer",
                      }}
                    >
                      💾 حفظ
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{
                        flex: 1,
                        padding: "8px",
                        background: "#bdc3c7",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        fontFamily: "'Cairo', sans-serif",
                        fontWeight: "700",
                        cursor: "pointer",
                      }}
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div>
                  <div style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    marginBottom: "10px",
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontWeight: "700",
                        fontSize: "14px",
                        color: darkMode ? "#ecf0f1" : "#2c3e50",
                        fontFamily: "'Cairo', sans-serif",
                        marginBottom: "4px",
                      }}>
                        {schedule.title}
                      </div>
                      <div style={{
                        fontSize: "11px",
                        color: darkMode ? "#95a5a6" : "#999",
                        fontFamily: "'Cairo', sans-serif",
                      }}>
                        {new Date(schedule.created_at).toLocaleDateString("ar-SA")}
                      </div>
                    </div>
                    <div style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                    }}>
                      <button
                        onClick={() => toggleActive(schedule.id, schedule.is_active)}
                        style={{
                          width: "40px",
                          height: "24px",
                          borderRadius: "20px",
                          background: schedule.is_active ? "#27ae60" : "#bdc3c7",
                          border: "none",
                          cursor: "pointer",
                          transition: "background 0.3s",
                        }}
                      />
                      <button
                        onClick={() => {
                          setEditingId(schedule.id);
                          setEditForm(schedule);
                        }}
                        style={{
                          background: "#3498db",
                          color: "#fff",
                          border: "none",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          cursor: "pointer",
                          fontSize: "11px",
                          fontFamily: "'Cairo', sans-serif",
                          fontWeight: "700",
                        }}
                      >
                        ✏️ تعديل
                      </button>
                      <button
                        onClick={() => deleteSchedule(schedule.id)}
                        style={{
                          background: "#e74c3c",
                          color: "#fff",
                          border: "none",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          cursor: "pointer",
                          fontSize: "11px",
                          fontFamily: "'Cairo', sans-serif",
                          fontWeight: "700",
                        }}
                      >
                        🗑️ حذف
                      </button>
                    </div>
                  </div>

                  {/* Image Preview */}
                  {schedule.image_url && (
                    <div
                      style={{
                        borderRadius: "8px",
                        overflow: "hidden",
                        border: `1px solid ${darkMode ? "#455a64" : "#ddd"}`,
                        marginBottom: "8px",
                        cursor: "pointer",
                      }}
                      onClick={() => setShowPreview(showPreview === schedule.id ? null : schedule.id)}
                    >
                      <img
                        src={schedule.image_url}
                        alt={schedule.title}
                        style={{
                          width: "100%",
                          maxHeight: "150px",
                          objectFit: "cover",
                        }}
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
