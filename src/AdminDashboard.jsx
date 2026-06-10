// ==================== ADMIN DASHBOARD PAGE ====================
import React, { useState, useEffect } from "react";
import PharmacyScheduleImage from "./PharmacyScheduleImage";

// Icon Component
const Icon = ({ name, size = 20, color = "currentColor" }) => {
  const icons = {
    users:         <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
    lock:          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
    bolt:          <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    mail:          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>,
    bell:          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
    bar:           <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>,
    chevronDown:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>,
    chevronUp:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>,
    trash:         <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
    plus:          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    check:         <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
    edit:          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    close:         <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  };
  return icons[name] || null;
};

// ==================== VISITOR STATS ====================
function VisitorStats({ darkMode, supabase }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => { loadStats(); }, []);
  
  async function loadStats() {
    setLoading(true);
    const data = await supabase("visitor_logs", "GET", null, "");
    if (!data) { setLoading(false); return; }
    const now = new Date();
    const today = data.filter(v => new Date(v.visited_at).toDateString() === now.toDateString()).length;
    const month = data.filter(v => {
      const d = new Date(v.visited_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const year = data.filter(v => new Date(v.visited_at).getFullYear() === now.getFullYear()).length;
    setStats({ today, month, year, total: data.length });
    setLoading(false);
  }

  if (loading) return <div style={{ textAlign: "center", padding: "20px", fontFamily: "'Cairo', sans-serif" }}>جاري التحميل...</div>;
  if (!stats) return <div style={{ textAlign: "center", padding: "20px", color: "#e74c3c", fontFamily: "'Cairo', sans-serif" }}>تعذر تحميل البيانات</div>;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "10px",
    }}>
      {[["📅", "اليوم", stats.today, "#27ae60"], ["🗓️", "هذا الشهر", stats.month, "#2980b9"], ["📆", "هذه السنة", stats.year, "#8e44ad"], ["👥", "إجمالي الكل", stats.total, "#c0392b"]].map(([icon, label, val, color]) => (
        <div key={label} style={{
          background: `${color}12`,
          border: `1.5px solid ${color}33`,
          borderRadius: "12px",
          padding: "14px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "22px", marginBottom: "4px" }}>{icon}</div>
          <div style={{ fontWeight: "900", fontSize: "22px", color }}>{val}</div>
          <div style={{ fontSize: "11px", color: "#666", fontFamily: "'Cairo', sans-serif", marginTop: "2px" }}>{label}</div>
        </div>
      ))}
      <button onClick={loadStats} style={{
        gridColumn: "1 / -1",
        padding: "10px",
        background: "#2980b9",
        color: "#fff",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
        fontFamily: "'Cairo', sans-serif",
        fontWeight: "700",
        fontSize: "13px",
      }}>
        🔄 تحديث الإحصائيات
      </button>
    </div>
  );
}

// ==================== EDITOR PERMISSIONS MANAGER ====================
function EditorPermissionsManager({ editorPerms, setEditorPerms, darkMode, supabase }) {
  const permItems = [
    { key: "contacts", label: "إضافة جهات الاتصال", icon: "📞" },
    { key: "news", label: "إضافة الأخبار", icon: "📰" },
    { key: "obituary", label: "إضافة الوفيات", icon: "🕊️" },
    { key: "ads", label: "إدارة الإعلانات", icon: "📢" },
    { key: "lost", label: "إدارة المفقودات", icon: "🔍" },
    { key: "links", label: "إضافة الروابط", icon: "🔗" },
    { key: "transport", label: "إضافة السائقين", icon: "🚗" },
    { key: "mosques", label: "إضافة المساجد", icon: "🕌" },
    { key: "electricity", label: "تغيير حالة الكهرباء", icon: "⚡" },
    { key: "water", label: "جدول توزيع المياه", icon: "💧" },
    { key: "events", label: "إضافة الفعاليات", icon: "🗓️" },
    { key: "gallery", label: "معرض الصور", icon: "📸" },
    { key: "poll", label: "إنشاء استطلاع", icon: "📊" },
    { key: "ticker", label: "تعديل الشريط الإخباري", icon: "📡" },
    { key: "realestate", label: "إدارة العقارات", icon: "🏠" },
    { key: "pharmacy", label: "مناوبة الصيدليات", icon: "💊" },
  ];

  async function togglePerm(key) {
    const newPerms = { ...editorPerms, [key]: !editorPerms[key] };
    setEditorPerms(newPerms);
    const existing = await supabase("settings", "GET", null, "?key=eq.editor_permissions");
    if (existing && existing.length > 0) {
      await supabase("settings", "PATCH", { value: JSON.stringify(newPerms) }, "?key=eq.editor_permissions");
    } else {
      await supabase("settings", "POST", { key: "editor_permissions", value: JSON.stringify(newPerms) });
    }
  }

  return (
    <div>
      <div style={{ fontSize: "12px", color: "#666", fontFamily: "'Cairo', sans-serif", marginBottom: "14px" }}>
        تحكم في ما يستطيع المحررون فعله
      </div>
      {permItems.map(item => {
        const isOn = editorPerms[item.key] !== false;
        return (
          <div key={item.key} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 12px", borderRadius: "10px", marginBottom: "6px",
            background: isOn ? "#f5eef8" : "#f8f8f8",
            border: `1.5px solid ${isOn ? "#d2b4de" : "#e8e8e8"}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "16px" }}>{item.icon}</span>
              <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "600", color: "#2c3e50" }}>
                {item.label}
              </span>
            </div>
            <div onClick={() => togglePerm(item.key)} style={{
              width: "44px", height: "24px", borderRadius: "20px",
              background: isOn ? "#8e44ad" : "#ccc",
              position: "relative", cursor: "pointer", transition: "background 0.3s", flexShrink: 0,
            }}>
              <div style={{
                position: "absolute", top: "3px",
                right: isOn ? "3px" : "20px",
                width: "18px", height: "18px", borderRadius: "50%",
                background: "#fff", transition: "right 0.3s",
                boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==================== AD BANNER MANAGER ====================
function AdBannerManager({ darkMode, supabase }) {
  const [adData, setAdData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    is_active: false, title: "",
    description: "", phone: "", image_url: ""
  });

  useEffect(() => { loadAd(); }, []);

  async function loadAd() {
    setLoading(true);
    const data = await supabase("ads_banner", "GET", null, "?limit=1");
    if (data && data[0]) { setAdData(data[0]); setForm(data[0]); }
    setLoading(false);
  }

  async function saveAd() {
    if (form.is_active && !form.title.trim()) return alert("يجب إدخال عنوان الإعلان!");
    setSaving(true);
    if (adData) {
      await supabase("ads_banner", "PATCH",
        { ...form, updated_at: new Date().toISOString() },
        `?id=eq.${adData.id}`
      );
    } else {
      await supabase("ads_banner", "POST",
        { ...form, updated_at: new Date().toISOString() }
      );
    }
    setSaving(false);
    alert(form.is_active ? "✅ تم تفعيل الإعلان!" : "⏸️ تم إيقاف الإعلان");
    loadAd();
  }

  if (loading) return <div style={{ textAlign: "center", padding: "20px", fontFamily: "'Cairo', sans-serif" }}>جاري التحميل...</div>;

  return (
    <div>
      <div style={{ fontWeight: "800", fontSize: "14px", color: "#e67e22", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>📢 إدارة الإعلان</span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: form.is_active ? "#27ae60" : "#aaa", fontFamily: "'Cairo', sans-serif" }}>
            {form.is_active ? "مفعّل" : "موقوف"}
          </span>
          <div onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
            style={{ width: "44px", height: "24px", borderRadius: "20px", background: form.is_active ? "#27ae60" : "#ccc", position: "relative", cursor: "pointer", transition: "background 0.3s" }}>
            <div style={{ position: "absolute", top: "3px", right: form.is_active ? "3px" : "20px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", transition: "right 0.3s", boxShadow: "0 1px 4px rgba(0,0,0,.3)" }} />
          </div>
        </div>
      </div>
      {[["title", "عنوان الإعلان *"], ["description", "وصف مختصر (اختياري)"], ["phone", "رقم التواصل (اختياري)"], ["image_url", "رابط صورة الإعلان (اختياري)"]].map(([k, ph]) => (
        <input key={k} value={form[k] || ""} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} placeholder={ph}
          style={{ width: "100%", padding: "10px", borderRadius: "8px", border: `1.5px solid ${form.is_active ? "#f0b27a" : "#e8e8e8"}`, fontFamily: "'Cairo', sans-serif", fontSize: "13px", marginBottom: "8px", boxSizing: "border-box", background: "#fafafa" }} />
      ))}
      <button onClick={saveAd} disabled={saving}
        style={{ width: "100%", padding: "12px", background: saving ? "#aaa" : "#e67e22", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: saving ? "not-allowed" : "pointer" }}>
        {saving ? "جاري الحفظ..." : "💾 حفظ الإعلان"}
      </button>
    </div>
  );
}

// ==================== ACCORDION COMPONENT ====================
const AccordionItem = ({ id, icon, title, isOpen, onToggle, children }) => {
  return (
    <div style={{
      marginBottom: "12px",
      border: isOpen ? "2px solid #8e44ad" : "1px solid #ddd",
      borderRadius: "12px",
      overflow: "hidden",
      background: "#fff",
      transition: "all 0.3s",
    }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          padding: "14px",
          background: isOpen ? "#f5eef8" : "#f9fafb",
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          fontFamily: "'Cairo', sans-serif",
          fontWeight: "700",
          fontSize: "14px",
          color: "#2c3e50",
          transition: "all 0.3s",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "18px" }}>{icon}</span>
          {title}
        </span>
        <Icon name={isOpen ? "chevronUp" : "chevronDown"} size={20} color="#8e44ad" />
      </button>
      {isOpen && (
        <div style={{ padding: "14px", borderTop: "1px solid #eee", background: "#fafafa" }}>
          {children}
        </div>
      )}
    </div>
  );
};

// ==================== HELPER: HASH PASSWORD ====================
async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ==================== MAIN ADMIN DASHBOARD ====================
export default function AdminDashboard({ onBack, isAdmin, adminRole, supabase }) {
  const [expandedItem, setExpandedItem] = useState(null);
  const [darkMode] = useState(false);
  const [editorPerms, setEditorPerms] = useState({});
  const [admins, setAdmins] = useState([]);
  const [editors, setEditors] = useState([]);
  const [newAdminForm, setNewAdminForm] = useState({ username: "", password: "" });
  const [newEditorForm, setNewEditorForm] = useState({ username: "", password: "" });
  const [messages, setMessages] = useState([]);
  const [notificationForm, setNotificationForm] = useState({ title: "", body: "" });
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [editingEditor, setEditingEditor] = useState(null);
  const [editForm, setEditForm] = useState({ username: "", password: "" });

  // Load data on mount
  useEffect(() => {
    loadAdmins();
    loadEditors();
    loadMessages();
    loadEditorPerms();
  }, []);

  // Auto-close accordion when opening new one
  const toggleAccordion = (id) => {
    setExpandedItem(expandedItem === id ? null : id);
  };

  // ==================== PERMISSIONS ====================
  async function loadEditorPerms() {
    const data = await supabase("settings", "GET", null, "?key=eq.editor_permissions");
    if (data && data[0]) {
      try {
        setEditorPerms(JSON.parse(data[0].value));
      } catch (e) {
        setEditorPerms({});
      }
    }
  }

  // ==================== ADMINS MANAGEMENT ====================
  async function loadAdmins() {
    const data = await supabase("admins", "GET", null, "");
    if (data) setAdmins(data);
  }

  async function addAdmin() {
    if (!newAdminForm.username.trim() || !newAdminForm.password.trim()) {
      return alert("يجب إدخال اسم مستخدم وكلمة مرور!");
    }
    const hashedPassword = await hashPassword(newAdminForm.password);
    await supabase("admins", "POST", {
      username: newAdminForm.username,
      password: hashedPassword,
      role: "admin",
    });
    setNewAdminForm({ username: "", password: "" });
    loadAdmins();
    alert("✅ تم إضافة المدير بنجاح!");
  }

  async function deleteAdmin(id) {
    if (confirm("هل تريد حقاً حذف هذا المدير؟")) {
      await supabase("admins", "DELETE", null, `?id=eq.${id}`);
      loadAdmins();
      alert("✅ تم حذف المدير!");
    }
  }

  async function updateAdminPassword(id, username) {
    const newPass = prompt(`كلمة المرور الجديدة لـ ${username}:`);
    if (!newPass) return;
    const hashedPassword = await hashPassword(newPass);
    await supabase("admins", "PATCH", { password: hashedPassword }, `?id=eq.${id}`);
    alert("✅ تم تغيير كلمة المرور!");
    loadAdmins();
  }

  async function updateAdmin(admin) {
    if (!editForm.username.trim()) return alert("اسم المستخدم لا يمكن أن يكون فارغاً!");
    
    let updateData = { username: editForm.username };
    if (editForm.password && editForm.password.trim()) {
      updateData.password = await hashPassword(editForm.password);
    }
    
    await supabase("admins", "PATCH", updateData, `?id=eq.${admin.id}`);
    alert("✅ تم تحديث بيانات المدير!");
    setEditingAdmin(null);
    setEditForm({ username: "", password: "" });
    loadAdmins();
  }

  // ==================== EDITORS MANAGEMENT ====================
  async function loadEditors() {
    const data = await supabase("editors", "GET", null, "");
    if (data) setEditors(data);
  }

  async function addEditor() {
    if (!newEditorForm.username.trim() || !newEditorForm.password.trim()) {
      return alert("يجب إدخال اسم مستخدم وكلمة مرور!");
    }
    const hashedPassword = await hashPassword(newEditorForm.password);
    await supabase("editors", "POST", {
      username: newEditorForm.username,
      password: hashedPassword,
      role: "editor",
    });
    setNewEditorForm({ username: "", password: "" });
    loadEditors();
    alert("✅ تم إضافة المحرر بنجاح!");
  }

  async function deleteEditor(id) {
    if (confirm("هل تريد حقاً حذف هذا المحرر؟")) {
      await supabase("editors", "DELETE", null, `?id=eq.${id}`);
      loadEditors();
      alert("✅ تم حذف المحرر!");
    }
  }

  async function updateEditorPassword(id, username) {
    const newPass = prompt(`كلمة المرور الجديدة لـ ${username}:`);
    if (!newPass) return;
    const hashedPassword = await hashPassword(newPass);
    await supabase("editors", "PATCH", { password: hashedPassword }, `?id=eq.${id}`);
    alert("✅ تم تغيير كلمة المرور!");
    loadEditors();
  }

  async function updateEditor(editor) {
    if (!editForm.username.trim()) return alert("اسم المستخدم لا يمكن أن يكون فارغاً!");
    
    let updateData = { username: editForm.username };
    if (editForm.password && editForm.password.trim()) {
      updateData.password = await hashPassword(editForm.password);
    }
    
    await supabase("editors", "PATCH", updateData, `?id=eq.${editor.id}`);
    alert("✅ تم تحديث بيانات المحرر!");
    setEditingEditor(null);
    setEditForm({ username: "", password: "" });
    loadEditors();
  }

  // ==================== MESSAGES ====================
  async function loadMessages() {
    const data = await supabase("contact_messages", "GET", null, "?order=created_at.desc&limit=20");
    if (data) setMessages(data);
  }

  async function deleteMessage(id) {
    if (confirm("حذف الرسالة؟")) {
      await supabase("contact_messages", "DELETE", null, `?id=eq.${id}`);
      loadMessages();
    }
  }

  // ==================== NOTIFICATIONS ====================
  async function sendNotification() {
    if (!notificationForm.title.trim() || !notificationForm.body.trim()) {
      return alert("يجب ملء العنوان والمحتوى!");
    }
    await supabase("notifications", "POST", {
      title: notificationForm.title,
      body: notificationForm.body,
      created_at: new Date().toISOString(),
    });
    setNotificationForm({ title: "", body: "" });
    alert("✅ تم إرسال الإشعار!");
  }

  return (
    <div style={{ padding: "0", background: "#f5f5f5", minHeight: "100vh", direction: "rtl" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #8e44ad 0%, #6c3483 100%)",
        color: "#fff",
        padding: "20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "20px",
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontFamily: "'Cairo', sans-serif" }}>🔐 لوحة تحكم المدير</h1>
          <p style={{ margin: "4px 0 0 0", opacity: 0.9, fontSize: "13px", fontFamily: "'Cairo', sans-serif" }}>إدارة كاملة للنظام</p>
        </div>
        <button onClick={onBack} style={{
          background: "rgba(255,255,255,.2)",
          border: "1px solid rgba(255,255,255,.5)",
          color: "#fff",
          padding: "10px 16px",
          borderRadius: "8px",
          cursor: "pointer",
          fontFamily: "'Cairo', sans-serif",
          fontWeight: "700",
        }}>
          ← رجوع
        </button>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "700px", margin: "0 auto", padding: "0 16px 40px" }}>
        {/* 1. User Management */}
        <AccordionItem
          id="users"
          icon="👥"
          title="إدارة المستخدمين"
          isOpen={expandedItem === "users"}
          onToggle={() => toggleAccordion("users")}
        >
          <div>
            <h4 style={{ margin: "0 0 12px 0", color: "#27ae60", fontSize: "14px", fontFamily: "'Cairo', sans-serif" }}>المديرون</h4>
            {admins.length === 0 ? (
              <div style={{ color: "#aaa", fontSize: "13px", textAlign: "center", padding: "12px", fontFamily: "'Cairo', sans-serif" }}>
                لا يوجد مديرون
              </div>
            ) : (
              admins.map((admin) => (
                <div key={admin.id} style={{
                  background: "#f0f8ff",
                  padding: "12px",
                  borderRadius: "8px",
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "13px",
                  fontFamily: "'Cairo', sans-serif",
                }}>
                  <div>
                    <div style={{ fontWeight: "700", color: "#1f2937" }}>{admin.username}</div>
                    <div style={{ color: "#888", fontSize: "12px" }}>🔑 {admin.role || "admin"}</div>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => {
                      setEditingAdmin(admin);
                      setEditForm({ username: admin.username, password: "" });
                    }} style={{
                      background: "#ebf5fb",
                      border: "1.5px solid #aed6f1",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      cursor: "pointer",
                      color: "#2980b9",
                      fontWeight: "700",
                      fontSize: "12px",
                      fontFamily: "'Cairo', sans-serif",
                    }}>
                      🔑 تغيير
                    </button>
                    <button onClick={() => deleteAdmin(admin.id)} style={{
                      background: "#fdedec",
                      border: "none",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      cursor: "pointer",
                      color: "#c0392b",
                      fontWeight: "700",
                      fontSize: "12px",
                      fontFamily: "'Cairo', sans-serif",
                    }}>
                      حذف
                    </button>
                  </div>
                </div>
              ))
            )}
            <div style={{
              background: "#a9dfbf",
              padding: "12px",
              borderRadius: "8px",
              border: "1px dashed #52be80",
              marginTop: "12px",
            }}>
              <div style={{ fontSize: "12px", color: "#27ae60", fontWeight: "700", marginBottom: "8px", fontFamily: "'Cairo', sans-serif" }}>
                ➕ إضافة مدير جديد
              </div>
              <input
                type="text"
                value={newAdminForm.username}
                onChange={(e) => setNewAdminForm({ ...newAdminForm, username: e.target.value })}
                placeholder="اسم المستخدم"
                style={{
                  width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #52be80",
                  fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box", fontSize: "13px",
                }}
              />
              <input
                type="password"
                value={newAdminForm.password}
                onChange={(e) => setNewAdminForm({ ...newAdminForm, password: e.target.value })}
                placeholder="كلمة المرور"
                style={{
                  width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #52be80",
                  fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box", fontSize: "13px",
                }}
              />
              <button onClick={addAdmin} style={{
                width: "100%", padding: "8px", background: "#27ae60", color: "#fff", border: "none",
                borderRadius: "6px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "12px",
              }}>
                إضافة المدير
              </button>
            </div>

            {/* Edit Modal */}
            {(editingAdmin || editingEditor) && (
              <div style={{
                background: "#fff3cd",
                padding: "12px",
                borderRadius: "8px",
                border: "1.5px solid #ffc107",
                marginTop: "12px",
              }}>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "#856404", marginBottom: "10px", fontFamily: "'Cairo', sans-serif" }}>
                  ✏️ تعديل {editingAdmin ? "المدير" : "المحرر"}: {editingAdmin?.username || editingEditor?.username}
                </div>
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  placeholder="اسم المستخدم"
                  style={{
                    width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ffc107",
                    fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box", fontSize: "13px",
                  }}
                />
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="كلمة المرور الجديدة (اتركها فارغة لعدم التغيير)"
                  style={{
                    width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ffc107",
                    fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box", fontSize: "13px",
                  }}
                />
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => {
                    if (editingAdmin) {
                      updateAdmin(editingAdmin);
                    } else {
                      updateEditor(editingEditor);
                    }
                  }} style={{
                    flex: 1, padding: "8px", background: "#28a745", color: "#fff", border: "none",
                    borderRadius: "6px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "12px",
                  }}>
                    💾 حفظ
                  </button>
                  <button onClick={() => {
                    setEditingAdmin(null);
                    setEditingEditor(null);
                    setEditForm({ username: "", password: "" });
                  }} style={{
                    flex: 1, padding: "8px", background: "#6c757d", color: "#fff", border: "none",
                    borderRadius: "6px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "12px",
                  }}>
                    ❌ إلغاء
                  </button>
                </div>
              </div>
            )}

            {/* Editors Section */}
            <h4 style={{ margin: "16px 0 12px 0", color: "#3b82f6", fontSize: "14px", fontFamily: "'Cairo', sans-serif" }}>المحررون</h4>
            {editors.length === 0 ? (
              <div style={{ color: "#aaa", fontSize: "13px", textAlign: "center", padding: "12px", fontFamily: "'Cairo', sans-serif" }}>
                لا يوجد محررون
              </div>
            ) : (
              editors.map((editor) => (
                <div key={editor.id} style={{
                  background: "#f9fafb", padding: "12px", borderRadius: "8px", marginBottom: "8px",
                  display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "13px", fontFamily: "'Cairo', sans-serif",
                }}>
                  <div>
                    <div style={{ fontWeight: "700", color: "#1f2937" }}>{editor.username}</div>
                    <div style={{ color: "#888", fontSize: "12px" }}>✏️ محرر</div>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => {
                      setEditingEditor(editor);
                      setEditForm({ username: editor.username, password: "" });
                    }} style={{
                      background: "#ebf5fb",
                      border: "1.5px solid #aed6f1",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      cursor: "pointer",
                      color: "#2980b9",
                      fontWeight: "700",
                      fontSize: "12px",
                      fontFamily: "'Cairo', sans-serif",
                    }}>
                      🔑 تغيير
                    </button>
                    <button onClick={() => deleteEditor(editor.id)} style={{
                      background: "#fdedec",
                      border: "none",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      cursor: "pointer",
                      color: "#c0392b",
                      fontWeight: "700",
                      fontSize: "12px",
                      fontFamily: "'Cairo', sans-serif",
                    }}>
                      حذف
                    </button>
                  </div>
                </div>
              ))
            )}
            <div style={{
              background: "#eff6ff", padding: "12px", borderRadius: "8px", border: "1px dashed #bfdbfe", marginTop: "12px",
            }}>
              <div style={{ fontSize: "12px", color: "#0284c7", fontWeight: "700", marginBottom: "8px", fontFamily: "'Cairo', sans-serif" }}>
                ➕ إضافة محرر جديد
              </div>
              <input
                type="text"
                value={newEditorForm.username}
                onChange={(e) => setNewEditorForm({ ...newEditorForm, username: e.target.value })}
                placeholder="اسم المستخدم"
                style={{
                  width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #bfdbfe",
                  fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box", fontSize: "13px",
                }}
              />
              <input
                type="password"
                value={newEditorForm.password}
                onChange={(e) => setNewEditorForm({ ...newEditorForm, password: e.target.value })}
                placeholder="كلمة المرور"
                style={{
                  width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #bfdbfe",
                  fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box", fontSize: "13px",
                }}
              />
              <button onClick={addEditor} style={{
                width: "100%", padding: "8px", background: "#0284c7", color: "#fff", border: "none",
                borderRadius: "6px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "12px",
              }}>
                إضافة المحرر
              </button>
            </div>
          </div>
        </AccordionItem>

        {/* 2. Editor Permissions */}
        <AccordionItem
          id="permissions"
          icon="🔐"
          title="صلاحيات المحررين"
          isOpen={expandedItem === "permissions"}
          onToggle={() => toggleAccordion("permissions")}
        >
          <EditorPermissionsManager
            editorPerms={editorPerms}
            setEditorPerms={setEditorPerms}
            darkMode={darkMode}
            supabase={supabase}
          />
        </AccordionItem>

        {/* 3. Electricity Announcement */}
        <AccordionItem
          id="electricity"
          icon="⚡"
          title="إعلان بطاقة الكهرباء"
          isOpen={expandedItem === "electricity"}
          onToggle={() => toggleAccordion("electricity")}
        >
          <AdBannerManager
            darkMode={darkMode}
            supabase={supabase}
          />
        </AccordionItem>

        {/* 4. Contact Messages */}
        <AccordionItem
          id="messages"
          icon="💬"
          title="رسائل التواصل"
          isOpen={expandedItem === "messages"}
          onToggle={() => toggleAccordion("messages")}
        >
          {messages.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "20px", color: "#aaa", fontSize: "13px", fontFamily: "'Cairo', sans-serif",
            }}>
              لا توجد رسائل
            </div>
          ) : (
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              {messages.map((msg) => (
                <div key={msg.id} style={{
                  background: "#f9fafb", padding: "10px", borderRadius: "8px", marginBottom: "8px",
                  borderRight: "3px solid #3b82f6", fontSize: "12px", fontFamily: "'Cairo', sans-serif",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px",
                  }}>
                    <div style={{ fontWeight: "700", color: "#1f2937" }}>
                      {msg.name || "بدون اسم"}
                    </div>
                    <button onClick={() => deleteMessage(msg.id)} style={{
                      background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: "14px",
                    }}>
                      ✕
                    </button>
                  </div>
                  <div style={{ color: "#666", fontSize: "11px", marginBottom: "4px" }}>
                    📧 {msg.email}
                  </div>
                  <div style={{ color: "#333", lineHeight: "1.4" }}>
                    {msg.message}
                  </div>
                </div>
              ))}
            </div>
          )}
        </AccordionItem>

        {/* 5. Send Notification */}
        <AccordionItem
          id="notifications"
          icon="🔔"
          title="إرسال إشعار"
          isOpen={expandedItem === "notifications"}
          onToggle={() => toggleAccordion("notifications")}
        >
          <input
            type="text"
            value={notificationForm.title}
            onChange={(e) => setNotificationForm({ ...notificationForm, title: e.target.value })}
            placeholder="عنوان الإشعار"
            style={{
              width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ddd",
              fontFamily: "'Cairo', sans-serif", fontSize: "13px", marginBottom: "8px", boxSizing: "border-box",
            }}
          />
          <textarea
            value={notificationForm.body}
            onChange={(e) => setNotificationForm({ ...notificationForm, body: e.target.value })}
            placeholder="محتوى الإشعار"
            rows={3}
            style={{
              width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ddd",
              fontFamily: "'Cairo', sans-serif", fontSize: "13px", marginBottom: "10px",
              boxSizing: "border-box", resize: "none",
            }}
          />
          <button onClick={sendNotification} style={{
            width: "100%", padding: "12px", background: "#8e44ad", color: "#fff", border: "none",
            borderRadius: "6px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "13px",
          }}>
            📤 إرسال الإشعار
          </button>
        </AccordionItem>

        {/* 6. Visitor Statistics */}
        <AccordionItem
          id="statistics"
          icon="📊"
          title="إحصائيات الزوار"
          isOpen={expandedItem === "statistics"}
          onToggle={() => toggleAccordion("statistics")}
        >
          <VisitorStats
            darkMode={darkMode}
            supabase={supabase}
          />
        </AccordionItem>

        {/* 7. Pharmacy Schedule Images */}
        <AccordionItem
          id="pharmacy"
          icon="💊"
          title="مناوبة الصيدليات"
          isOpen={expandedItem === "pharmacy"}
          onToggle={() => toggleAccordion("pharmacy")}
        >
          <PharmacyScheduleImage
            supabase={supabase}
            darkMode={darkMode}
          />
        </AccordionItem>
      </div>
    </div>
  );
}
