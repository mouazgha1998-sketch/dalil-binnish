// ==================== IMPORTS ====================
import React, { useState, useEffect, useRef } from "react";
import AdminDashboard from "./AdminDashboard";

// ==================== ENVIRONMENT VARIABLES ====================
const SITE_URL = import.meta.env.VITE_SITE_URL || "https://dalil-binnish.netlify.app"
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL; 
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

// ==================== CONSTANTS ====================
const CACHE_DURATION = 5 * 60 * 1000;

// OneSignal Configuration
const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = import.meta.env.VITE_ONESIGNAL_API_KEY;

// Mock Data
const MOCK_CATEGORIES = [
  { id: 1, name: "الطوارئ والإسعاف" },
  { id: 2, name: "المشافي والعيادات" },
  { id: 3, name: "الصيدليات" },
  { id: 4, name: "خدمات البلدية" },
];

const MOCK_CONTACTS = [
  { id: 1, name: " ", phone: "", category_id: 1 },
  { id: 2, name: "", phone: "", category_id: 1 },
  { id: 3, name: "  ", phone: "", category_id: 2 },
  { id: 4, name: " ", phone: "", category_id: 2 },
  { id: 5, name: " =", phone: "", category_id: 3 },
  { id: 6, name: " ", phone: "", category_id: 4 },
];

const MOCK_TICKER = "تأكد من إتصالك بالإنترن";

// Default Editor Permissions
const DEFAULT_PERMS = {
  contacts: true, news: true, obituary: true, ads: true, lost: true,
  links: true, transport: true, mosques: true, electricity: true,
  water: true, events: true, gallery: true, poll: true, ticker: false,
  realestate: true, pharmacy: true,
};

// ==================== SERVICE WORKER ====================
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(err => console.log("SW error:", err));
  });
}

// ==================== ERROR HANDLING & LOGGING ====================

// --- Error Logger ---
class ErrorLogger {
  static log(error, context = "") {
    const timestamp = new Date().toISOString();
    const errorInfo = {
      timestamp,
      context,
      message: error?.message || "خطأ غير معروف",
      stack: error?.stack || "",
      type: error?.name || "Error",
    };
    
    // تسجيل في localStorage للأخطاء الهامة
    if (error?.name === "NetworkError" || error?.message?.includes("Supabase")) {
      try {
        const logs = JSON.parse(localStorage.getItem("error_logs") || "[]");
        logs.push(errorInfo);
        if (logs.length > 50) logs.shift(); // احفظ آخر 50 خطأ
        localStorage.setItem("error_logs", JSON.stringify(logs));
      } catch (e) {
        console.warn("خطأ في حفظ السجلات:", e);
      }
    }
    
    console.error(`[${context}] ${errorInfo.type}:`, error);
    return errorInfo;
  }

  static clear() {
    try {
      localStorage.removeItem("error_logs");
    } catch (e) {
      console.warn("خطأ في حذف السجلات:", e);
    }
  }
}

// --- API Error Handler ---
function getErrorMessage(error, defaultMsg = "حدث خطأ. يرجى المحاولة لاحقاً") {
  if (!error) return defaultMsg;
  
  if (typeof error === "string") return error;
  
  // معالجة أخطاء الشبكة
  if (error.message?.includes("Failed to fetch")) {
    return "خطأ في الاتصال بالشبكة. تحقق من اتصالك بالإنترنت";
  }
  
  // معالجة أخطاء Supabase
  if (error.message?.includes("401")) {
    return "جلسة انتهاء صلاحيتها. يرجى تسجيل الدخول مجدداً";
  }
  
  if (error.message?.includes("403")) {
    return "ليس لديك صلاحية للقيام بهذا الإجراء";
  }
  
  if (error.message?.includes("404")) {
    return "البيانات المطلوبة غير موجودة";
  }
  
  if (error.message?.includes("500")) {
    return "خطأ في الخادم. يرجى المحاولة لاحقاً";
  }
  
  return error.message || defaultMsg;
}

// ==================== UTILITY FUNCTIONS ====================

// --- Supabase Functions ---
async function supabase(table, method = "GET", body = null, filter = "") {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${table}${filter}`;
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "return=minimal",
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 ثانية timeout

    const res = await fetch(url, { 
      method, 
      headers, 
      body: body ? JSON.stringify(body) : null,
      signal: controller.signal 
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.text();
      const errorMsg = `Supabase Error [${res.status}]: ${err}`;
      ErrorLogger.log(new Error(errorMsg), `Supabase:${table}`);
      throw new Error(getErrorMessage(new Error(errorMsg)));
    }

    const text = await res.text();
    return text ? JSON.parse(text) : true;
  } catch (e) {
    ErrorLogger.log(e, `Supabase:${table}`);
    
    if (e.name === "AbortError") {
      throw new Error("انتهت مهلة الطلب. حاول مجدداً");
    }
    
    throw new Error(getErrorMessage(e));
  }
}

// --- Cache Functions ---
function getCache(key) {
  try {
    const item = localStorage.getItem("cache_" + key);
    if (!item) return null;
    const { data, timestamp } = JSON.parse(item);
    if (Date.now() - timestamp > CACHE_DURATION) { localStorage.removeItem("cache_" + key); return null; }
    return data;
  } catch { return null; }
}

function setCache(key, data) {
  try { localStorage.setItem("cache_" + key, JSON.stringify({ data, timestamp: Date.now() })); } catch {}
}

function clearCache(key) { localStorage.removeItem("cache_" + key); }

// --- Password/Security Functions ---
async function hashPassword(password) {
  try {
    if (!password || typeof password !== "string") {
      throw new Error("كلمة المرور يجب أن تكون نصاً غير فارغ");
    }
    
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    ErrorLogger.log(e, "hashPassword");
    throw new Error(getErrorMessage(e, "خطأ في تشفير كلمة المرور"));
  }
}

// --- Date/Time Functions ---
function relativeTime(dateStr) {
  try {
    if (!dateStr) return "تاريخ غير صحيح";
    
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error("صيغة التاريخ غير صحيحة");
    }
    
    const diff = Date.now() - date.getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    
    if (mins < 1)   return "الآن";
    if (mins < 60)  return `منذ ${mins} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    if (days < 30)  return `منذ ${days} يوم`;
    return date.toLocaleDateString("ar-SY");
  } catch (e) {
    ErrorLogger.log(e, "relativeTime");
    return "تاريخ غير صحيح";
  }
}

// --- Notification Functions ---
async function sendNotification(title, body, section) {
  try {
    // التحقق من المدخلات
    if (!title || !body) {
      throw new Error("العنوان والمحتوى مطلوبان");
    }

    // حفظ الإشعار في قاعدة البيانات
    await supabase("notifications", "POST", { title, body, section });
    await cleanOldNotifications();

    // إرسال إشعار فوري لجميع المشتركين
    if (ONESIGNAL_APP_ID && ONESIGNAL_API_KEY) {
      await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${ONESIGNAL_API_KEY}`,
        },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          included_segments: ["All"],
          headings: { ar: title, en: title },
          contents: { ar: body, en: body },
          url: SITE_URL,
        }),
      });
    }
  } catch (e) {
    ErrorLogger.log(e, "sendNotification");
    // لا نرمي الخطأ - الإشعارات ليست حرجة
    console.warn("تحذير في الإشعارات:", e.message);
  }
}

async function cleanOldNotifications() {
  try {
    const data = await supabase("notifications", "GET", null, "?order=created_at.asc");
    if (data && Array.isArray(data) && data.length > 10) {
      const toDelete = data.slice(0, data.length - 10);
      for (const n of toDelete) {
        if (n?.id) {
          await supabase("notifications", "DELETE", null, `?id=eq.${n.id}`);
        }
      }
    }
  } catch (e) {
    ErrorLogger.log(e, "cleanOldNotifications");
    // لا نرمي الخطأ - تنظيف البيانات ليس حرجاً
  }
}

async function logVisitor() {
  try {
    const lastVisit = localStorage.getItem("last_visit_date");
    const today = new Date().toDateString();
    if (lastVisit !== today) {
      await supabase("visitor_logs", "POST", { visited_at: new Date().toISOString() });
      localStorage.setItem("last_visit_date", today);
    }
  } catch (e) {
    ErrorLogger.log(e, "logVisitor");
    // لا نرمي الخطأ - تسجيل الزيارات ليس حرجاً
  }
}

// --- Permission Check Function ---
function canDo(section, isAdmin, adminRole, editorPerms) {
  if (!isAdmin) return false;
  if (adminRole === "super") return true;
  return editorPerms?.[section] !== false;
}

// ==================== ERROR BOUNDARY & FALLBACK COMPONENTS ====================

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    ErrorLogger.log(error, "ErrorBoundary");
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: "20px",
          background: "#fadbd8",
          border: "2px solid #c0392b",
          borderRadius: "8px",
          margin: "20px",
          textAlign: "center",
          direction: "rtl"
        }}>
          <h3 style={{ color: "#c0392b", marginBottom: "10px" }}>⚠️ حدث خطأ</h3>
          <p style={{ color: "#922b21", marginBottom: "10px" }}>
            عذراً، حدث خطأ غير متوقع. يرجى تحديث الصفحة أو المحاولة لاحقاً.
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              background: "#c0392b",
              color: "white",
              border: "none",
              padding: "10px 20px",
              borderRadius: "6px",
              cursor: "pointer",
              fontFamily: "'Cairo', sans-serif"
            }}
          >
            تحديث الصفحة
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Error Toast/Alert Component ---
function ErrorAlert({ message, onClose, duration = 5000 }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [message, onClose, duration]);

  if (!message) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: "20px",
      left: "20px",
      right: "20px",
      background: "#c0392b",
      color: "white",
      padding: "16px",
      borderRadius: "8px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      direction: "rtl",
      fontFamily: "'Cairo', sans-serif",
      fontSize: "14px",
      zIndex: 9999,
      animation: "slideIn 0.3s ease-out",
      display: "flex",
      alignItems: "center",
      gap: "12px",
    }}>
      <span style={{ fontSize: "18px" }}>❌</span>
      <div>{message}</div>
      <button
        onClick={onClose}
        style={{
          background: "rgba(255,255,255,0.3)",
          border: "none",
          color: "white",
          cursor: "pointer",
          padding: "4px 8px",
          borderRadius: "4px",
          marginLeft: "auto"
        }}
      >
        ✕
      </button>
    </div>
  );
}

// ==================== ICON COMPONENT ====================
const BanshLogo = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* المفتاح */}
    <g>
      {/* رأس المفتاح */}
      <circle cx="60" cy="80" r="35" stroke="#001f3f" strokeWidth="8" fill="none"/>
      <circle cx="60" cy="50" r="8" fill="#001f3f"/>
      
      {/* جسم المفتاح */}
      <rect x="85" y="70" width="70" height="20" rx="10" fill="#001f3f"/>
      
      {/* الأسنان */}
      <line x1="110" y1="70" x2="110" y2="90" stroke="#001f3f" strokeWidth="6"/>
      <line x1="125" y1="70" x2="125" y2="90" stroke="#001f3f" strokeWidth="6"/>
      <line x1="140" y1="70" x2="140" y2="90" stroke="#001f3f" strokeWidth="6"/>
      
      {/* الحلقات البنية */}
      <circle cx="65" cy="80" r="12" fill="#c97137" opacity="0.7"/>
      <circle cx="95" cy="80" r="10" fill="#c97137" opacity="0.7"/>
    </g>
  </svg>
);

const Icon = ({ name, size = 20, color = "currentColor" }) => {
  const icons = {
    bell:        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
    menu:        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
    close:       <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    phone:       <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01.22 3a2 2 0 012-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.91a16 16 0 006.18 6.18l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>,
    copy:        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
    check:       <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
    bolt:        <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    contacts:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
    news:        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l4 4v10a2 2 0 01-2 2z"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    obituary:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M12 2a5 5 0 00-5 5c0 3 5 9 5 9s5-6 5-9a5 5 0 00-5-5z"/><circle cx="12" cy="7" r="1.5" fill={color}/></svg>,
    lost:        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
    ads:         <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
    links:       <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>,
    transport:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
    settings:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>,
    admin:       <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
    home:        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    plus:        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    trash:       <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
    edit:        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    chevronDown: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>,
    chevronUp:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>,
    mosque:      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><line x1="12" y1="2" x2="12" y2="5"/><path d="M10 5 Q12 3 14 5"/><path d="M6 10 Q12 6 18 10"/><rect x="4" y="10" width="16" height="10"/><rect x="9" y="14" width="6" height="6"/><line x1="4" y1="10" x2="4" y2="7"/><line x1="4" y1="7" x2="6" y2="7"/><line x1="20" y1="10" x2="20" y2="7"/><line x1="20" y1="7" x2="18" y2="7"/></svg>,
    city:        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="3" y="10" width="4" height="11"/><rect x="10" y="6" width="4" height="15"/><rect x="17" y="3" width="4" height="18"/><line x1="1" y1="21" x2="23" y2="21"/></svg>,
    search:      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    currency:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9 14.5s.9 1.5 3 1.5 3-1 3-2.5-1.2-2-3-2.5-3-1-3-2.5S10.1 6 12 6s3 1.5 3 1.5"/><line x1="12" y1="4" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="20"/></svg>,
  };
  return icons[name] || null;
};

// ==================== COMPONENT: NEWS TICKER ====================
function NewsTicker({ text, isAdmin, onEdit }) {
  return (
    <div style={{ background: "linear-gradient(135deg, #ef5350 0%, #dc2626 100%)", color: "#fff", display: "flex", alignItems: "center", overflow: "hidden", height: "44px", boxShadow: "0 6px 20px rgba(220, 38, 38, 0.3)", animation: "glow 3s ease-in-out infinite" }}>
      <div style={{ background: "#dc2626", padding: "0 16px", height: "100%", display: "flex", alignItems: "center", fontFamily: "'Cairo', sans-serif", fontWeight: "800", fontSize: "13px", whiteSpace: "nowrap", flexShrink: 0, backdropFilter: "blur(4px)", letterSpacing: "1px", color: "#fff" }}>🔔 عاجل</div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <style>{`@keyframes ticker{0%{transform:translateX(-100%)}100%{transform:translateX(100vw)}}.ticker-text{display:inline-block;white-space:nowrap;animation:ticker 30s linear infinite;font-family:'Cairo',sans-serif;font-size:14px;font-weight:600;color:#fff}`}</style>
        <span className="ticker-text">{text}</span>
      </div>
      {isAdmin && (
        <button onClick={onEdit} style={{ background: "rgba(255,255,255,0.3)", border: "none", color: "#fff", padding: "8px 12px", cursor: "pointer", flexShrink: 0, marginLeft: "12px", borderRadius: "8px", transition: "all 0.3s" }}>
          <Icon name="edit" size={16} />
        </button>
      )}
    </div>
  );
}

// ==================== COMPONENT: ELECTRICITY STATUS ====================
function ElectricityStatus({ status, isAdmin, onToggle, timer, reason }) {
  const isOn = status === "on";
  return (
    <div style={{ margin: "14px 16px", background: isOn ? "linear-gradient(135deg, #059669 0%, #10b981 100%)" : "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)", borderRadius: "16px", padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: isOn ? "0 8px 25px rgba(5, 150, 105, 0.4)" : "0 8px 25px rgba(59, 130, 246, 0.4)", transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)", transform: "translateZ(0)", backfaceVisibility: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: isOn ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: isOn ? "0 4px 20px rgba(255,255,255,0.2), inset 0 1px 0 rgba(255,255,255,0.2)" : "0 4px 20px rgba(0,0,0,0.2)", transition: "all 0.5s", backdropFilter: "blur(10px)" }}>
          <Icon name="bolt" size={28} color={isOn ? "#FFD700" : "#fff"} />
        </div>
        <div>
          <div style={{ color: "#fff", fontFamily: "'Cairo', sans-serif", fontWeight: "800", fontSize: "16px", letterSpacing: "0.5px" }}>حالة الكهرباء</div>
          <div style={{ color: "rgba(255,255,255,0.9)", fontFamily: "'Cairo', sans-serif", fontSize: "13px", marginTop: "4px", fontWeight: "600" }}>
            {isOn ? "✅ الكهرباء متوفرة حالياً" : "❌ الكهرباء مقطوعة حالياً"}
            {timer && <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", marginTop: "4px", fontWeight: "500" }}>{timer}</div>}
            {!isOn && reason && <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.85)", marginTop: "4px" }}>السبب: {reason}</div>}
          </div>
        </div>
      </div>
      {isAdmin && (
        <button onClick={onToggle} style={{ background: "rgba(255,255,255,0.3)", border: "2px solid rgba(255,255,255,0.5)", color: "#fff", borderRadius: "12px", padding: "10px 18px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "700", transition: "all 0.3s", backdropFilter: "blur(8px)" }}>
          {isOn ? "قطع" : "تشغيل"}
        </button>
      )}
    </div>
  );
}

// ==================== COMPONENT: ELECTRICITY AD CARD ====================
function ElectricityAdCard({ elecStatus, elecTimer, elecReason, isAdmin, onToggle, adData }) {
  const [isFlipped, setIsFlipped] = useState(false);
  const flipRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!adData?.is_active || !adData?.title) return;

    intervalRef.current = setInterval(() => {
      setIsFlipped(true);
      flipRef.current = setTimeout(() => {
        setIsFlipped(false);
      }, 8000);
    }, 12000);

    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(flipRef.current);
      setIsFlipped(false);
    };
  }, [adData?.is_active, adData?.title]);

  return (
    <div className="flip-card">
      <div className={`flip-card-inner ${isFlipped ? "flipped" : ""}`}>

        {/* ── الوجه الأمامي: الكهرباء ── */}
        <div className="flip-card-front">
          <div style={{
            background: elecStatus === "on"
              ? "linear-gradient(135deg,#1a5276,#2980b9)"
              : "linear-gradient(135deg,#4a4a4a,#2c2c2c)",
            borderRadius: "14px",
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: "100%",
            boxSizing: "border-box",
            boxShadow: elecStatus === "on"
              ? "0 4px 20px rgba(41,128,185,.4)"
              : "0 4px 20px rgba(0,0,0,.3)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{
                width: "44px", height: "44px", borderRadius: "50%",
                background: elecStatus === "on" ? "rgba(255,214,0,.2)" : "rgba(255,255,255,.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: elecStatus === "on" ? "0 0 20px rgba(255,214,0,.6)" : "none",
              }}>
                <Icon name="bolt" size={22} color={elecStatus === "on" ? "#FFD600" : "#888"} />
              </div>
              <div>
                <div style={{ color: "#fff", fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "15px" }}>
                  حالة الكهرباء
                </div>
                <div style={{ color: elecStatus === "on" ? "#7fc8f8" : "#aaa", fontFamily: "'Cairo', sans-serif", fontSize: "12px", marginTop: "2px" }}>
  {elecStatus === "on" ? "✅ الكهرباء متوفرة حالياً" : "❌ الكهرباء مقطوعة حالياً"}
</div>
{elecTimer && (
  <div style={{ fontSize: "11px", color: elecStatus === "on" ? "#aed6f1" : "#888", marginTop: "2px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
    <span>{elecTimer}</span>
    {elecStatus === "off" && elecReason && (
      <span style={{ color: "#f0b27a" }}>• {elecReason}</span>
    )}
  </div>
)}
                
              </div>
            </div>
            {isAdmin && (
              <button onClick={onToggle} style={{
                background: elecStatus === "on" ? "#e74c3c" : "#27ae60",
                border: "none", color: "#fff", borderRadius: "8px",
                padding: "8px 14px", cursor: "pointer",
                fontFamily: "'Cairo', sans-serif", fontSize: "12px", fontWeight: "700",
              }}>
                {elecStatus === "on" ? "قطع" : "تشغيل"}
              </button>
            )}
          </div>
        </div>

        {/* ── الوجه الخلفي: الإعلان ── */}
        <div className="flip-card-back">
          <div style={{
            background: "linear-gradient(135deg,#f39c12,#e67e22)",
            borderRadius: "14px",
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            height: "100%",
            boxSizing: "border-box",
            boxShadow: "0 4px 20px rgba(243,156,18,.4)",
          }}>
            {adData?.image_url && (
              <img src={adData.image_url} alt="ad" style={{
                width: "99px", height: "80px",
                borderRadius: "10px", objectFit: "cover", flexShrink: 0,
              }} onError={e => e.target.style.display = "none"} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: "9px", color: "rgba(255,255,255,.7)",
                marginBottom: "2px", fontFamily: "'Cairo', sans-serif",
              }}>إعلان مدفوع</div>
              <div style={{
                color: "#fff", fontWeight: "800", fontSize: "14px",
                fontFamily: "'Cairo', sans-serif", lineHeight: "1.3",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{adData?.title}</div>
              {adData?.description && (
                <div style={{
                  color: "rgba(255,255,255,.85)", fontSize: "11px",
                  marginTop: "2px", fontFamily: "'Cairo', sans-serif",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{adData.description}</div>
              )}
            </div>
            {adData?.phone && (
              <a href={`tel:${adData.phone}`} style={{
                background: "#fff", color: "#e67e22",
                borderRadius: "10px", padding: "8px 12px",
                textDecoration: "none", fontWeight: "800",
                fontSize: "12px", fontFamily: "'Cairo', sans-serif",
                flexShrink: 0, display: "flex", alignItems: "center", gap: "4px",
              }}>
                📞 اتصل
              </a>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
// ==================== HOME GRID ====================
const SECTIONS = [
  { id: "contacts",     label: "جهات الاتصال",   icon: "contacts",   color: "#059669", gradient: "linear-gradient(135deg, #059669 0%, #047857 100%)" },
  { id: "news",         label: "الأخبار",         icon: "news",       color: "#000000", gradient: "linear-gradient(135deg, #3B82F6 0%, #1d4ed8 100%)" },
  { id: "lost",         label: "المفقودات",       icon: "lost",       color: "#0d9488", gradient: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)" },
  { id: "ads",          label: "الإعلانات",       icon: "ads",        color: "#3B82F6", gradient: "linear-gradient(135deg, #3B82F6 0%, #60a5fa 100%)" },
  { id: "links",        label: "روابط مهمة",      icon: "links",      color: "#06b6d4", gradient: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)" },
  { id: "transport",    label: "التوصيل",         icon: "transport",  color: "#14b8a6", gradient: "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)" },
  { id: "mosques",      label: "المساجد",         icon: "mosque",     color: "#059669", gradient: "linear-gradient(135deg, #059669 0%, #10b981 100%)" },
 { id: "cityservices", label: "خدمات المدينة", icon: "city", color: "#1e3a5f", gradient: "linear-gradient(160deg, #1e3a5f 0%, #1d4ed8 60%, #1e40af 100%)" },
{ id: "currency", label: "حاسبة العملات", icon: "currency", color: "#06b6d4", gradient: "linear-gradient(135deg, #06b6d4 0%, #14b8a6 100%)" },
 { id: "realestate", label: "العقارات", icon: "home", color: "#0f766e", gradient: "linear-gradient(135deg, #0f766e 0%, #0d9488 100%)" },
];

function HomeGrid({ onNavigate }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px", padding: "20px", background: "linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.5) 100%)" }}>
      {SECTIONS.map((s, i) => (
        <button key={s.id} onClick={() => onNavigate(s.id)} style={{ 
          background: s.gradient, 
          border: "none", 
          borderRadius: "18px", 
          padding: "20px 12px", 
          cursor: "pointer", 
          display: "flex", 
          flexDirection: "column", 
          alignItems: "center", 
          gap: "12px", 
          transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)", 
          boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
          animation: `fadeInUp 0.5s ease ${i * 0.08}s both`,
          transform: "translateZ(0)",
          backfaceVisibility: "hidden"
        }}
          onMouseDown={e => e.currentTarget.style.transform = "scale(.92) translateZ(0)"} 
          onMouseUp={e => e.currentTarget.style.transform = "scale(1) translateZ(0)"}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-8px) translateZ(0)"; e.currentTarget.style.boxShadow = "0 15px 35px rgba(0,0,0,0.2)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0) translateZ(0)"; e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.12)"; }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "16px", background: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)", backdropFilter: "blur(10px)" }}>
            <Icon name={s.icon} size={28} color="#fff" />
          </div>
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "800", color: "#fff", textAlign: "center", lineHeight: "1.3", textShadow: "0 2px 4px rgba(0,0,0,0.2)", letterSpacing: "0.3px" }}>{s.label}</span>
        </button>
      ))}
    </div>
  );
}

// ==================== CONTACTS PAGE ====================
function ContactsPage({ isAdmin, adminRole, editorPerms }) {
  const [categories, setCategories] = useState([]);
  const [contacts,   setContacts]   = useState([]);
  const [search,     setSearch]     = useState("");
  const [openCats,   setOpenCats]   = useState({});
  const [copied,     setCopied]     = useState(null);
  const [toast,      setToast]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [addingContact, setAddingContact] = useState(null);
  const [newContact, setNewContact] = useState({ name: "", phone: "" });

  const canEdit = canDo("contacts", isAdmin, adminRole, editorPerms);

  useEffect(() => {
    if (search.trim()) {
      const newOpen = {};
      categories.forEach(cat => {
        if (contacts.some(c => c.category_id === cat.id && (c.name.includes(search) || c.phone.includes(search))))
          newOpen[cat.id] = true;
      });
      setOpenCats(newOpen);
    }
  }, [search, contacts, categories]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const cc = getCache("categories"), co = getCache("contacts");
    if (cc && co) { setCategories(cc); setContacts(co); setLoading(false); return; }
    const cats = await supabase("categories", "GET", null, "?order=id");
    const cons = await supabase("contacts",   "GET", null, "");
    if (cats && cats.length > 0) {
      setCategories(cats); setContacts(cons || []);
      setCache("categories", cats); setCache("contacts", cons || []);
    } else { setCategories(MOCK_CATEGORIES); setContacts(MOCK_CONTACTS); }
    setLoading(false);
  }

  const copyNumber = (phone, id) => {
    navigator.clipboard.writeText(phone).then(() => {
      setCopied(id); setToast(phone);
      setTimeout(() => { setCopied(null); setToast(null); }, 2000);
    });
  };

const toggleCat = id => setOpenCats(p => ({ [id]: !p[id] }));
  const addCategory = async () => {
    if (!newCatName.trim()) return;
    const res = await supabase("categories", "POST", { name: newCatName });
    if (res) loadData(); else setCategories(p => [...p, { id: Date.now(), name: newCatName }]);
    setNewCatName(""); setShowAddCat(false);
  };

  const deleteCategory = async id => {
    if (!confirm("حذف القائمة بالكامل؟")) return;
    await supabase("contacts",   "DELETE", null, `?category_id=eq.${id}`);
    await supabase("categories", "DELETE", null, `?id=eq.${id}`);
    loadData();
  };

  const addContact = async catId => {
    if (!newContact.name || !newContact.phone) return;
    const res = await supabase("contacts", "POST", { name: newContact.name, phone: newContact.phone, category_id: catId });
    if (res) loadData(); else setContacts(p => [...p, { id: Date.now(), ...newContact, category_id: catId }]);
    setNewContact({ name: "", phone: "" }); setAddingContact(null);
  };

  const deleteContact = async id => {
    if (!confirm("حذف جهة الاتصال؟")) return;
    await supabase("contacts", "DELETE", null, `?id=eq.${id}`); loadData();
  };

  const filtered = contacts.filter(c => c.name.includes(search) || c.phone.includes(search));

  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>
      {toast && (
        <div style={{ position: "fixed", bottom: "30px", left: "50%", transform: "translateX(-50%)", background: "#27ae60", color: "#fff", padding: "12px 24px", borderRadius: "30px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "14px", zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,.25)", animation: "fadeInUp .3s ease", whiteSpace: "nowrap" }}>
          ✅ تم نسخ الرقم: {toast}
        </div>
      )}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ابحث عن اسم أو رقم..."
        style={{ width: "100%", padding: "12px 16px", borderRadius: "12px", border: "2px solid #e8e8e8", fontFamily: "'Cairo', sans-serif", fontSize: "14px", outline: "none", boxSizing: "border-box", background: "#f8f9fa", marginBottom: "16px" }} />
      {canEdit && (
        <button onClick={() => setShowAddCat(true)} style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg,#059669,#047857)", color: "#fff", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontSize: "14px", fontWeight: "700", cursor: "pointer", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
          <Icon name="plus" size={18} /> إضافة قائمة جديدة
        </button>
      )}
      {showAddCat && (
        <div style={{ background: "#ebf5fb", borderRadius: "12px", padding: "14px", marginBottom: "14px", border: "2px solid #aed6f1" }}>
          <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="اسم القائمة الجديدة"
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #aed6f1", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={addCategory} style={{ flex: 1, padding: "10px", background: "#059669", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", cursor: "pointer", fontWeight: "700" }}>حفظ</button>
            <button onClick={() => setShowAddCat(false)} style={{ flex: 1, padding: "10px", background: "#e8e8e8", color: "#555", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
          </div>
        </div>
      )}
      {loading ? <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>جاري التحميل...</div> :
        categories.map(cat => {
          const catContacts = filtered.filter(c => c.category_id === cat.id);
          const isOpen = openCats[cat.id];
          return (
            <div key={cat.id} style={{ marginBottom: "10px", borderRadius: "14px", overflow: "hidden", border: "1.5px solid #e8e8e8", background: "#fff" }}>
              <div onClick={() => toggleCat(cat.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", cursor: "pointer", background: isOpen ? "#ebf5fb" : "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontWeight: "700", fontSize: "14px", color: "#2c3e50" }}>{cat.name}</span>
                  <span style={{ background: "#2980b9", color: "#fff", borderRadius: "20px", padding: "1px 8px", fontSize: "11px", fontWeight: "700" }}>{catContacts.length}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {canEdit && <>
                    <button onClick={e => { e.stopPropagation(); setAddingContact(cat.id); }} style={{ background: "#d1fae5", border: "none", borderRadius: "8px", padding: "5px 8px", cursor: "pointer" }}><Icon name="plus" size={14} color="#059669" /></button>
                    <button onClick={e => { e.stopPropagation(); deleteCategory(cat.id); }} style={{ background: "#fdedec", border: "none", borderRadius: "8px", padding: "5px 8px", cursor: "pointer" }}><Icon name="trash" size={14} color="#c0392b" /></button>
                  </>}
                  <Icon name={isOpen ? "chevronUp" : "chevronDown"} size={18} color="#888" />
                </div>
              </div>
              {isOpen && (
                <div>
                  {addingContact === cat.id && (
                    <div style={{ padding: "12px 16px", background: "#f0faf5", borderTop: "1px solid #e8e8e8" }}>
                      <input value={newContact.name} onChange={e => setNewContact(p => ({ ...p, name: e.target.value }))} placeholder="الاسم"
                        style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "6px", boxSizing: "border-box" }} />
                      <input value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))} placeholder="رقم الهاتف" type="tel"
                        style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={() => addContact(cat.id)} style={{ flex: 1, padding: "8px", background: "#059669", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", cursor: "pointer", fontWeight: "700" }}>حفظ</button>
                        <button onClick={() => { setAddingContact(null); setNewContact({ name: "", phone: "" }); }} style={{ flex: 1, padding: "8px", background: "#e8e8e8", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
                      </div>
                    </div>
                  )}
                  {catContacts.length === 0
                    ? <div style={{ padding: "16px", textAlign: "center", color: "#aaa", fontSize: "13px" }}>لا توجد جهات اتصال</div>
                    : catContacts.map(c => (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderTop: "1px solid #f0f0f0", background: "#f8f9fa", margin: "8px 0", borderRadius: "8px", transition: "all 0.3s" }}>
                        <div>
                          <div style={{ fontWeight: "800", fontSize: "14px", color: "#2c3e50" }}>{c.name}</div>
                          <div style={{ fontSize: "13px", color: "#059669", marginTop: "4px", direction: "ltr", textAlign: "right", fontFamily: "monospace", fontWeight: "600" }}>{c.phone}</div>
                        </div>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                          <button onClick={() => copyNumber(c.phone, c.id)} style={{ background: copied === c.id ? "linear-gradient(135deg, #059669 0%, #047857 100%)" : "rgba(5, 150, 105, 0.1)", border: `2px solid ${copied === c.id ? "#059669" : "#059669"}`, borderRadius: "10px", padding: "8px 10px", cursor: "pointer", transition: "all 0.3s", boxShadow: copied === c.id ? "0 4px 12px rgba(5, 150, 105, 0.3)" : "none" }}>
                            <Icon name={copied === c.id ? "check" : "copy"} size={16} color={copied === c.id ? "#fff" : "#667eea"} />
                          </button>
                          <a href={`tel:${c.phone}`} style={{ background: "linear-gradient(135deg, #059669 0%, #047857 100%)", border: "none", borderRadius: "10px", padding: "8px 10px", display: "flex", alignItems: "center", textDecoration: "none", boxShadow: "0 4px 12px rgba(5, 150, 105, 0.3)", cursor: "pointer", transition: "all 0.3s" }}>
                            <Icon name="phone" size={16} color="#fff" />
                          </a>
                          {canEdit && <button onClick={() => deleteContact(c.id)} style={{ background: "rgba(238, 90, 111, 0.1)", border: `2px solid #ee5a6f`, borderRadius: "10px", padding: "8px 10px", cursor: "pointer", transition: "all 0.3s" }}><Icon name="trash" size={16} color="#ee5a6f" /></button>}
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          );
        })
      }
    </div>
  );
}

// ==================== NEWS PAGE ====================
function NewsPage({ isAdmin, adminRole, editorPerms }) {
  const [news,         setNews]         = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [form,         setForm]         = useState({ title: "", content: "", image_url: "" });
  const [selectedNewsId, setSelectedNewsId] = useState(null);
  const [editingItem,  setEditingItem]  = useState(null);
  const [editForm,     setEditForm]     = useState({});
  const [externalNews, setExternalNews] = useState([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [newsTab, setNewsTab] = useState("local");

  const canEdit = canDo("news", isAdmin, adminRole, editorPerms);
  const isSuper = adminRole === "super";
  const selectedItem = news.find(n => n.id === selectedNewsId);

 const RSS_SOURCES = [
  { name: "سانا", url: "https://api.rss2json.com/v1/api.json?rss_url=https://sana.sy/feed" },
  { name: "عنب بلدي", url: "https://api.rss2json.com/v1/api.json?rss_url=https://www.enabbaladi.net/feed" },
{ name: "الإخبارية السورية", url: "https://api.rss2json.com/v1/api.json?rss_url=https://alikhbariah.com/feed" },
];

  async function loadExternalNews() {
    setExternalLoading(true);
    let all = [];
    for (const src of RSS_SOURCES) {
      try {
        const res = await fetch(src.url);
        const data = await res.json();
        if (data.items) {
          all = [...all, ...data.items.map(i => ({ ...i, source: src.name }))];
        }
      } catch {}
    }
    all.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    setExternalNews(all.slice(0, 30));
    setExternalLoading(false);
  }

  useEffect(() => {
    if (newsTab === "external" && externalNews.length === 0) loadExternalNews();
  }, [newsTab]);

  useEffect(() => { loadNews(); }, []);

  async function loadNews() {
    setLoading(true);
    const cached = getCache("news");
    if (cached) { setNews(cached); setLoading(false); return; }
    const data = await supabase("news", "GET", null, "?order=created_at.desc");
    setNews(data || []); if (data) setCache("news", data); setLoading(false);
  }

  async function addNews() {
    if (!form.title.trim()) return;
    await supabase("news", "POST", { title: form.title, content: form.content, image_url: form.image_url });
    const sendNotif = window.confirm(`هل تريد إرسال إشعار بخصوص: "${form.title}"؟`);
    if (sendNotif) await sendNotification(`📰 خبر جديد: ${form.title}`, form.content?.substring(0, 80) + "...", "news");
    setForm({ title: "", content: "", image_url: "" }); setShowForm(false);
    clearCache("news"); loadNews();
  }

  async function deleteNews(id) {
    if (!confirm("حذف الخبر؟")) return;
    await supabase("news", "DELETE", null, `?id=eq.${id}`); clearCache("news"); loadNews();
  }

  async function saveEdit() {
    await supabase("news", "PATCH", editForm, `?id=eq.${editingItem}`);
    setEditingItem(null); clearCache("news"); loadNews();
  }

  const formatDate = d => new Date(d).toLocaleDateString("ar-SY", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        {[{ id: "local", label: "📰 أخبار بنش" }, { id: "external", label: "🌐 أخبار سوريا" }].map(t => (
          <button key={t.id} onClick={() => setNewsTab(t.id)}
            style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", cursor: "pointer",
              background: newsTab === t.id ? "#8e44ad" : "#f0f0f0",
              color: newsTab === t.id ? "#fff" : "#555",
              fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "700" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Local News ── */}
      {newsTab === "local" && (
        <>
          {canEdit && (
            <button onClick={() => setShowForm(!showForm)} style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg,#8e44ad,#6c3483)", color: "#fff", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontSize: "14px", fontWeight: "700", cursor: "pointer", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              <Icon name="plus" size={18} /> {showForm ? "إلغاء" : "إضافة خبر جديد"}
            </button>
          )}
          {showForm && (
            <div style={{ background: "#f5eef8", borderRadius: "12px", padding: "16px", marginBottom: "16px", border: "2px solid #d2b4de" }}>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="عنوان الخبر *" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #d2b4de", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
              <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} placeholder="تفاصيل الخبر" rows={4} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #d2b4de", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", resize: "none", boxSizing: "border-box" }} />
              <input value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} placeholder="رابط الصورة (اختياري)" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #d2b4de", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box" }} />
              <button onClick={addNews} style={{ width: "100%", padding: "12px", background: "#8e44ad", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>نشر الخبر</button>
            </div>
          )}
          {loading
            ? <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>جاري التحميل...</div>
            : news.length === 0
              ? <div style={{ textAlign: "center", padding: "40px", color: "#aaa" }}>لا توجد أخبار حالياً</div>
              : news.map(item => (
                <div key={item.id} onClick={() => setSelectedNewsId(item.id)} style={{ background: "#fff", borderRadius: "14px", marginBottom: "12px", overflow: "hidden", border: "1.5px solid #f0f0f0", cursor: "pointer", animation: "fadeInUp .3s ease" }}>
                  {item.image_url && <img src={item.image_url} alt={item.title} style={{ width: "100%", height: "160px", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />}
                  <div style={{ padding: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ fontWeight: "800", fontSize: "15px", color: "#2c3e50", flex: 1, lineHeight: "1.4" }}>{item.title}</div>
                      <div style={{ display: "flex", gap: "6px" }} onClick={e => e.stopPropagation()}>
                        {isSuper && <button onClick={() => { setEditingItem(item.id); setEditForm({ title: item.title, content: item.content, image_url: item.image_url }); }} style={{ background: "#ebf5fb", border: "none", borderRadius: "8px", padding: "5px 7px", cursor: "pointer" }}><Icon name="edit" size={14} color="#2980b9" /></button>}
                        {isSuper && <button onClick={() => deleteNews(item.id)} style={{ background: "#fdedec", border: "none", borderRadius: "8px", padding: "5px 7px", cursor: "pointer" }}><Icon name="trash" size={14} color="#c0392b" /></button>}
                      </div>
                    </div>
                    <div style={{ fontSize: "11px", color: "#aaa", marginTop: "6px" }}>{formatDate(item.created_at)}</div>
                    {item.content && <div style={{ fontSize: "13px", color: "#555", marginTop: "8px", lineHeight: "1.7", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.content}</div>}
                    <div style={{ fontSize: "12px", color: "#8e44ad", marginTop: "8px", fontWeight: "700" }}>اضغط لقراءة المزيد ▼</div>
                  </div>
                </div>
              ))
          }
        </>
      )}

      {/* ── External News ── */}
      {newsTab === "external" && (
        <div>
          <button onClick={loadExternalNews}
            style={{ width: "100%", padding: "10px", background: "#f5eef8", border: "1.5px solid #d2b4de",
              borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700",
              color: "#8e44ad", cursor: "pointer", marginBottom: "14px" }}>
            🔄 تحديث الأخبار
          </button>
          {externalLoading
            ? <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>جاري تحميل الأخبار...</div>
            : externalNews.length === 0
              ? <div style={{ textAlign: "center", padding: "40px", color: "#aaa" }}>لا توجد أخبار حالياً</div>
              : externalNews.map((item, i) => (
                <a key={i} href={item.link} target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", background: "#fff", borderRadius: "14px", marginBottom: "12px",
                    overflow: "hidden", border: "1.5px solid #f0f0f0", textDecoration: "none" }}>
                  {item.thumbnail && (
                    <img src={item.thumbnail} alt={item.title}
                      style={{ width: "100%", height: "160px", objectFit: "cover" }}
                      onError={e => e.target.style.display = "none"} />
                  )}
                  <div style={{ padding: "14px" }}>
                    <div style={{ fontWeight: "800", fontSize: "14px", color: "#2c3e50", lineHeight: "1.5", marginBottom: "8px" }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "8px" }}>
                      {new Date(item.pubDate).toLocaleDateString("ar-SY", { year: "numeric", month: "long", day: "numeric" })}
                    </div>
                    <div style={{ background: "#f5eef8", borderRadius: "8px", padding: "6px 10px",
                      fontSize: "11px", color: "#8e44ad", fontWeight: "700", display: "inline-flex",
                      alignItems: "center", gap: "4px" }}>
                      🤖 نُشر تلقائياً من {item.source}
                    </div>
                  </div>
                </a>
              ))
          }
        </div>
      )}

      {/* ── News Detail Page ── */}
      {selectedItem && (
        <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 2000, overflowY: "auto", fontFamily: "'Cairo', sans-serif" }}>
          {/* Header */}
          <div style={{ position: "sticky", top: 0, background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 2001 }}>
            <button onClick={() => setSelectedNewsId(null)} style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#059669" }}>←</button>
            <div style={{ fontWeight: "700", fontSize: "16px", color: "#1f2937" }}>📰 الخبر الكامل</div>
            <div style={{ width: "24px" }}></div>
          </div>

          {/* Content */}
          <div style={{ maxWidth: "600px", margin: "0 auto", padding: "20px 16px" }}>
            {/* Image */}
            {selectedItem.image_url && (
              <div style={{ marginBottom: "20px", borderRadius: "12px", overflow: "hidden", backgroundColor: "#f3f4f6" }}>
                <img 
                  src={selectedItem.image_url} 
                  alt={selectedItem.title} 
                  style={{ width: "100%", height: "auto", maxHeight: "400px", objectFit: "cover", display: "block" }}
                  onError={e => e.target.parentElement.style.display = "none"} 
                />
              </div>
            )}

            {/* Title */}
<h1 style={{ fontSize: "22px", fontWeight: "900", color: "#1f2937", lineHeight: "1.6", marginBottom: "12px", textAlign: "right" }}>
            </h1>

            {/* Date & Metadata */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid #e5e7eb" }}>
              <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: "500" }}>📅</span>
              <span style={{ fontSize: "12px", color: "#6b7280" }}>
                {new Date(selectedItem.created_at).toLocaleDateString("ar-SY", { 
                  year: "numeric", 
                  month: "long", 
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </span>
            </div>

            {/* Content */}
            {selectedItem.content && (
              <div style={{ 
                fontSize: "15px", 
                color: "#374151", 
                lineHeight: "1.9",
                marginBottom: "24px",
                whiteSpace: "pre-wrap",
                wordWrap: "break-word",
                overflowWrap: "break-word",
                textAlign: "right",
                
              }}>
                {selectedItem.content}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "8px", marginTop: "24px", paddingBottom: "40px" }}>
              <a 
                href={`https://wa.me/?text=${encodeURIComponent(`📰 ${selectedItem.title}\n\n${selectedItem.content || ""}\n\n🔗 ${SITE_URL}`)}`} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ 
                  flex: 1,
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  gap: "6px", 
                  background: "#25D366", 
                  color: "#fff", 
                  borderRadius: "10px", 
                  padding: "12px 16px", 
                  textDecoration: "none", 
                  fontFamily: "'Cairo', sans-serif", 
                  fontSize: "13px", 
                  fontWeight: "700" 
                }}>
                📤 واتساب
              </a>
              <button 
                onClick={() => {
  navigator.clipboard.writeText(`${selectedItem.title}\n\n${selectedItem.content || ""}\n\n🔗 ${SITE_URL}`);
  alert("تم نسخ الخبر!");
}}

                style={{ 
                  flex: 1,
                  background: "#f3f4f6", 
                  color: "#374151", 
                  border: "none",
                  borderRadius: "10px", 
                  padding: "12px 16px", 
                  fontFamily: "'Cairo', sans-serif", 
                  fontSize: "13px", 
                  fontWeight: "700", 
                  cursor: "pointer" 
                }}>
                📋 نسخ
              </button>
            </div>

            {/* Admin Actions */}
            {isSuper && (
              <div style={{ paddingBottom: "20px", borderTop: "1px solid #e5e7eb", paddingTop: "20px", display: "flex", gap: "8px" }}>
                <button 
                  onClick={() => { 
                    setEditingItem(selectedItem.id); 
                    setEditForm({ title: selectedItem.title, content: selectedItem.content, image_url: selectedItem.image_url }); 
                    setSelectedNewsId(null);
                  }}
                  style={{ flex: 1, background: "#eff6ff", color: "#0284c7", border: "none", borderRadius: "8px", padding: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>
                  ✏️ تعديل
                </button>
                <button 
                  onClick={() => { 
                    if (confirm("حذف الخبر؟")) { 
                      deleteNews(selectedItem.id); 
                      setSelectedNewsId(null);
                    }
                  }}
                  style={{ flex: 1, background: "#fef2f2", color: "#dc2626", border: "none", borderRadius: "8px", padding: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>
                  🗑️ حذف
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editingItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "20px", width: "100%" }}>
            <div style={{ fontWeight: "800", fontSize: "16px", marginBottom: "14px", color: "#8e44ad" }}>✏️ تعديل الخبر</div>
            <input value={editForm.title || ""} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} placeholder="العنوان" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
            <textarea value={editForm.content || ""} onChange={e => setEditForm(p => ({ ...p, content: e.target.value }))} placeholder="المحتوى" rows={4} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", resize: "none", boxSizing: "border-box" }} />
            <input value={editForm.image_url || ""} onChange={e => setEditForm(p => ({ ...p, image_url: e.target.value }))} placeholder="رابط الصورة" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "12px", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={saveEdit} style={{ flex: 1, padding: "12px", background: "#8e44ad", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>حفظ</button>
              <button onClick={() => setEditingItem(null)} style={{ flex: 1, padding: "12px", background: "#f0f0f0", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
// ==================== OBITUARY PAGE ====================
function ObituaryPage({ isAdmin, adminRole, editorPerms }) {
  const [records,     setRecords]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState({ name: "", death_date: "", funeral_time: "", condolence_place: "", image_url: "" });
  const [editingItem, setEditingItem] = useState(null);
  const [editForm,    setEditForm]    = useState({});

  const canEdit = canDo("obituary", isAdmin, adminRole, editorPerms);
  const isSuper = adminRole === "super";

  useEffect(() => { loadRecords(); }, []);

  async function loadRecords() {
    setLoading(true);
    const cached = getCache("obituaries");
    if (cached) { setRecords(cached); setLoading(false); return; }
    const data = await supabase("obituaries", "GET", null, "?order=created_at.desc");
    setRecords(data || []); if (data) setCache("obituaries", data); setLoading(false);
  }

  async function addRecord() {
    if (!form.name.trim()) return;
    const res = await supabase("obituaries", "POST", { name: form.name, death_date: form.death_date || null, funeral_time: form.funeral_time, condolence_place: form.condolence_place, image_url: form.image_url });
    if (res) {
      const s = window.confirm(`هل تريد إرسال إشعار بوفاة: "${form.name}"؟`);
      if (s) await sendNotification(`ببالغ الأسى: وفاة ${form.name}`, `إنا لله وإنا إليه راجعون. الدفن: ${form.funeral_time || ""}`, "obituary");
    }
    setForm({ name: "", death_date: "", funeral_time: "", condolence_place: "", image_url: "" });
    clearCache("obituaries"); loadRecords();
  }

  async function deleteRecord(id) {
    if (!confirm("حذف السجل؟")) return;
    await supabase("obituaries", "DELETE", null, `?id=eq.${id}`); clearCache("obituaries"); loadRecords();
  }

  async function saveEdit() {
    await supabase("obituaries", "PATCH", editForm, `?id=eq.${editingItem}`);
    setEditingItem(null); clearCache("obituaries"); loadRecords();
  }

  const fmt = d => d ? new Date(d).toLocaleDateString("ar-SY", { year: "numeric", month: "long", day: "numeric" }) : "";

  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg,#2c3e50,#4a4a4a)", borderRadius: "12px", padding: "14px 16px", marginBottom: "16px", color: "#fff", textAlign: "center" }}>
        <div style={{ fontSize: "13px", opacity: .85, lineHeight: "1.8" }}>إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ</div>
      </div>
      {canEdit && (
        <button onClick={() => setShowForm(!showForm)} style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg,#2c3e50,#4a4a4a)", color: "#fff", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontSize: "14px", fontWeight: "700", cursor: "pointer", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
          <Icon name="plus" size={18} /> {showForm ? "إلغاء" : "إضافة سجل وفاة"}
        </button>
      )}
      {showForm && (
        <div style={{ background: "#eaecee", borderRadius: "12px", padding: "16px", marginBottom: "16px", border: "2px solid #bdc3c7" }}>
          {[["name","اسم المتوفى *","text"],["death_date","","date"],["funeral_time","موعد الدفن","text"],["condolence_place","مكان التعزية","text"],["image_url","رابط الصورة (اختياري)","text"]].map(([k,ph,t]) => (
            <input key={k} type={t} value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} placeholder={ph}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #bdc3c7", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          ))}
          <button onClick={addRecord} style={{ width: "100%", padding: "12px", background: "#2c3e50", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>حفظ</button>
        </div>
      )}
      {loading ? <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>جاري التحميل...</div> :
        records.length === 0 ? <div style={{ textAlign: "center", padding: "40px", color: "#aaa" }}>لا توجد سجلات</div> :
        records.map(r => (
          <div key={r.id} style={{ background: "#fff", borderRadius: "14px", marginBottom: "12px", overflow: "hidden", border: "2px solid #eaecee", animation: "fadeInUp .3s ease" }}>
            <div style={{ background: "linear-gradient(135deg,#2c3e50,#4a4a4a)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {r.image_url ? <img src={r.image_url} alt={r.name} style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,.3)" }} onError={e => e.target.style.display = "none"} /> :
                  <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>🕊️</div>}
                <div>
                  <div style={{ color: "#fff", fontWeight: "800", fontSize: "15px" }}>{r.name}</div>
                  {r.death_date && <div style={{ color: "rgba(255,255,255,.7)", fontSize: "11px", marginTop: "2px" }}>{fmt(r.death_date)}</div>}
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                {isSuper && <button onClick={() => { setEditingItem(r.id); setEditForm({ name: r.name, death_date: r.death_date, funeral_time: r.funeral_time, condolence_place: r.condolence_place, image_url: r.image_url }); }} style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: "8px", padding: "6px 8px", cursor: "pointer" }}><Icon name="edit" size={14} color="#fff" /></button>}
                {isSuper && <button onClick={() => deleteRecord(r.id)} style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: "8px", padding: "6px 8px", cursor: "pointer" }}><Icon name="trash" size={14} color="#fff" /></button>}
              </div>
            </div>
            <div style={{ padding: "12px 16px" }}>
              {r.funeral_time    && <div style={{ fontSize: "13px", color: "#555", marginBottom: "6px" }}>🕐 موعد الدفن: <strong>{r.funeral_time}</strong></div>}
              {r.condolence_place && <div style={{ fontSize: "13px", color: "#555", marginBottom: "10px" }}>📍 مكان التعزية: <strong>{r.condolence_place}</strong></div>}
              <a href={`https://wa.me/?text=${encodeURIComponent(`🕊️ إنا لله وإنا إليه راجعون\n\nانتقل إلى رحمة الله: ${r.name}\n${r.funeral_time ? `الدفن: ${r.funeral_time}\n` : ""}${r.condolence_place ? `التعزية: ${r.condolence_place}` : ""}\n\n🔗 ${SITE_URL}`)}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#25D366", color: "#fff", borderRadius: "8px", padding: "7px 12px", textDecoration: "none", fontFamily: "'Cairo', sans-serif", fontSize: "12px", fontWeight: "700" }}>
                <span>📤</span> مشاركة على واتساب
              </a>
            </div>
          </div>
        ))
      }
      {editingItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "20px", width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ fontWeight: "800", fontSize: "16px", marginBottom: "14px", color: "#2c3e50" }}>✏️ تعديل سجل الوفاة</div>
            {[["name","الاسم","text"],["death_date","","date"],["funeral_time","موعد الدفن","text"],["condolence_place","مكان التعزية","text"],["image_url","رابط الصورة","text"]].map(([k,ph,t]) => (
              <input key={k} type={t} value={editForm[k] || ""} onChange={e => setEditForm(p => ({ ...p, [k]: e.target.value }))} placeholder={ph}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
            ))}
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={saveEdit} style={{ flex: 1, padding: "12px", background: "#2c3e50", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>حفظ</button>
              <button onClick={() => setEditingItem(null)} style={{ flex: 1, padding: "12px", background: "#f0f0f0", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== ADS PAGE ====================
function AdsPage({ isAdmin, adminRole, editorPerms }) {
  const [ads,          setAds]         = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [showForm,     setShowForm]    = useState(false);
  const [form,         setForm]        = useState({ title: "", description: "", image_url: "", phone: "" });
  const [tab,          setTab]         = useState("approved");
  const [selectedAd,   setSelectedAd]  = useState(null);
  const [editingItem,  setEditingItem]  = useState(null);
  const [editForm,     setEditForm]    = useState({});

  const canEdit = canDo("ads", isAdmin, adminRole, editorPerms);
  const isSuper = adminRole === "super";

  useEffect(() => { loadAds(); }, []);

  async function loadAds() {
    setLoading(true);
    const cached = getCache("ads");
    if (cached) {
      setAds(cached);
      if (isAdmin && cached.filter(a => a.status === "pending").length > 0) setTab("pending");
      setLoading(false); return;
    }
    const data = await supabase("ads", "GET", null, "?order=created_at.desc");
    const loaded = data || []; setAds(loaded); if (data) setCache("ads", loaded);
    if (isAdmin && loaded.filter(a => a.status === "pending").length > 0) setTab("pending");
    setLoading(false);
  }

  async function submitAd() {
    if (!form.title.trim() || !form.phone.trim()) return alert("العنوان ورقم التواصل مطلوبان!");
    const res = await supabase("ads", "POST", { ...form, status: "pending" });
    if (res) { setForm({ title: "", description: "", image_url: "", phone: "" }); setShowForm(false); await loadAds(); alert("تم إرسال إعلانك! سيظهر بعد مراجعة الإدارة ✅"); }
    else alert("حدث خطأ في الإرسال.");
  }

  async function updateStatus(id, status) {
    await supabase("ads", "PATCH", { status }, `?id=eq.${id}`); clearCache("ads"); loadAds();
  }

  async function deleteAd(id) {
    if (!confirm("حذف الإعلان؟")) return;
    await supabase("ads", "DELETE", null, `?id=eq.${id}`); clearCache("ads"); loadAds();
  }

  async function saveEdit() {
    await supabase("ads", "PATCH", editForm, `?id=eq.${editingItem}`);
    setEditingItem(null); clearCache("ads"); loadAds();
  }

  const approved = ads.filter(a => a.status === "approved");
  const pending  = ads.filter(a => a.status === "pending");
  const displayed = isAdmin ? (tab === "approved" ? approved : pending) : approved;

  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>
      <button onClick={() => setShowForm(!showForm)} style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg,#27ae60,#1e8449)", color: "#fff", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontSize: "14px", fontWeight: "700", cursor: "pointer", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
        <Icon name="plus" size={18} /> {showForm ? "إلغاء" : "أضف إعلانك مجاناً"}
      </button>
      {showForm && (
        <div style={{ background: "#eafaf1", borderRadius: "12px", padding: "16px", marginBottom: "16px", border: "2px solid #a9dfbf" }}>
          <div style={{ fontSize: "12px", color: "#888", marginBottom: "12px", textAlign: "center" }}>سيظهر إعلانك بعد مراجعة الإدارة ✅</div>
          <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="عنوان الإعلان *" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #a9dfbf", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="وصف الإعلان" rows={3} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #a9dfbf", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", resize: "none", boxSizing: "border-box" }} />
          <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="رقم التواصل *" type="tel" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #a9dfbf", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          <input value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} placeholder="رابط الصورة (اختياري)" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #a9dfbf", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box" }} />
          <button onClick={submitAd} style={{ width: "100%", padding: "12px", background: "#27ae60", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>إرسال الإعلان</button>
        </div>
      )}
      {isAdmin && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          {[{ id: "approved", label: "المنشورة" }, { id: "pending", label: `بانتظار الموافقة (${pending.length})` }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", cursor: "pointer", background: tab === t.id ? "#27ae60" : "#f0f0f0", color: tab === t.id ? "#fff" : "#555", fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "700" }}>{t.label}</button>
          ))}
        </div>
      )}
      {loading ? <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>جاري التحميل...</div> :
        displayed.map(ad => (
          <div key={ad.id} onClick={() => setSelectedAd(ad)} style={{ background: "#fff", borderRadius: "14px", marginBottom: "12px", overflow: "hidden", border: "1.5px solid #f0f0f0", cursor: "pointer" }}>
            {ad.image_url && <img src={ad.image_url} alt={ad.title} style={{ width: "100%", height: "160px", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />}
            <div style={{ padding: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontWeight: "800", fontSize: "15px", color: "#2c3e50", flex: 1 }}>{ad.title}</div>
                <div style={{ display: "flex", gap: "6px" }} onClick={e => e.stopPropagation()}>
                  {isSuper && <button onClick={() => { setEditingItem(ad.id); setEditForm({ title: ad.title, description: ad.description, phone: ad.phone, image_url: ad.image_url }); }} style={{ background: "#ebf5fb", border: "none", borderRadius: "8px", padding: "5px 7px", cursor: "pointer" }}><Icon name="edit" size={14} color="#2980b9" /></button>}
                  {canEdit && <button onClick={() => deleteAd(ad.id)} style={{ background: "#fdedec", border: "none", borderRadius: "8px", padding: "5px 7px", cursor: "pointer" }}><Icon name="trash" size={14} color="#c0392b" /></button>}
                </div>
              </div>
              {ad.description && <div style={{ fontSize: "13px", color: "#666", marginTop: "6px", lineHeight: "1.6", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{ad.description}</div>}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "10px" }} onClick={e => e.stopPropagation()}>
                <a href={`tel:${ad.phone}`} style={{ display: "flex", alignItems: "center", gap: "6px", background: "#eafaf1", border: "1.5px solid #a9dfbf", borderRadius: "8px", padding: "8px 12px", color: "#27ae60", textDecoration: "none", fontSize: "13px", fontWeight: "700", fontFamily: "'Cairo', sans-serif" }}>
                  <Icon name="phone" size={14} color="#27ae60" /> {ad.phone}
                </a>
                {canEdit && ad.status === "pending" && <button onClick={() => updateStatus(ad.id, "approved")} style={{ background: "#27ae60", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "700" }}>✅ موافقة</button>}
              </div>
              <div style={{ fontSize: "12px", color: "#27ae60", marginTop: "8px", fontWeight: "700" }}>اضغط لعرض التفاصيل ▼</div>
            </div>
          </div>
        ))
      }
      {!loading && displayed.length === 0 && <div style={{ textAlign: "center", padding: "40px", color: "#aaa" }}>{tab === "pending" ? "لا توجد إعلانات بانتظار الموافقة" : "لا توجد إعلانات حالياً"}</div>}

      {/* Ad Detail Modal */}
      {selectedAd && (
        <div onClick={() => setSelectedAd(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 2000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: "430px", maxHeight: "85vh", overflowY: "auto" }}>
            {selectedAd.image_url && <img src={selectedAd.image_url} alt={selectedAd.title} style={{ width: "100%", height: "220px", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />}
            <div style={{ padding: "20px" }}>
              <div style={{ fontWeight: "800", fontSize: "17px", color: "#2c3e50", marginBottom: "12px" }}>{selectedAd.title}</div>
              {selectedAd.description && <div style={{ fontSize: "14px", color: "#555", lineHeight: "1.9", marginBottom: "16px" }}>{selectedAd.description}</div>}
              <a href={`tel:${selectedAd.phone}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "#eafaf1", border: "1.5px solid #a9dfbf", borderRadius: "12px", padding: "12px", color: "#27ae60", textDecoration: "none", fontSize: "15px", fontWeight: "700", fontFamily: "'Cairo', sans-serif", marginBottom: "10px" }}>
                <Icon name="phone" size={18} color="#27ae60" /> {selectedAd.phone}
              </a>
              <a href={`https://wa.me/?text=${encodeURIComponent(`📢 ${selectedAd.title}\n\n${selectedAd.description || ""}\n📞 ${selectedAd.phone}\n\n🔗 ${SITE_URL}`)}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: "#25D366", color: "#fff", borderRadius: "10px", padding: "10px 16px", textDecoration: "none", fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "700", marginBottom: "12px" }}>
                <span>📤</span> مشاركة على واتساب
              </a>
              <button onClick={() => setSelectedAd(null)} style={{ width: "100%", padding: "12px", background: "#f0f0f0", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Modal */}
      {editingItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "20px", width: "100%" }}>
            <div style={{ fontWeight: "800", fontSize: "16px", marginBottom: "14px", color: "#27ae60" }}>✏️ تعديل الإعلان</div>
            <input value={editForm.title || ""} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} placeholder="العنوان" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
            <textarea value={editForm.description || ""} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} placeholder="الوصف" rows={3} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", resize: "none", boxSizing: "border-box" }} />
            <input value={editForm.phone || ""} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} placeholder="رقم التواصل" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
            <input value={editForm.image_url || ""} onChange={e => setEditForm(p => ({ ...p, image_url: e.target.value }))} placeholder="رابط الصورة" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "12px", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={saveEdit} style={{ flex: 1, padding: "12px", background: "#27ae60", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>حفظ</button>
              <button onClick={() => setEditingItem(null)} style={{ flex: 1, padding: "12px", background: "#f0f0f0", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== LOST & FOUND PAGE ====================
function LostFoundPage({ isAdmin, adminRole, editorPerms }) {
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState({ title: "", description: "", image_url: "", phone: "", type: "lost" });
  const [tab,        setTab]        = useState("approved");
  const [typeFilter, setTypeFilter] = useState("all");

  const canEdit = canDo("lost", isAdmin, adminRole, editorPerms);

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    setLoading(true);
    const cached = getCache("lost_found");
    if (cached) { setItems(cached); setLoading(false); return; }
    const data = await supabase("lost_found", "GET", null, "?order=created_at.desc");
    setItems(data || []); if (data) setCache("lost_found", data); setLoading(false);
  }

  async function submitItem() {
    if (!form.title.trim() || !form.phone.trim()) return alert("العنوان ورقم التواصل مطلوبان!");
    await supabase("lost_found", "POST", { ...form, status: "pending" });
    setForm({ title: "", description: "", image_url: "", phone: "", type: "lost" }); setShowForm(false);
    loadItems(); alert("تم إرسال طلبك! سيظهر بعد مراجعة الإدارة.");
  }

  async function updateStatus(id, status) {
    await supabase("lost_found", "PATCH", { status }, `?id=eq.${id}`); clearCache("lost_found"); loadItems();
  }

  async function deleteItem(id) {
    if (!confirm("حذف؟")) return;
    await supabase("lost_found", "DELETE", null, `?id=eq.${id}`); clearCache("lost_found"); loadItems();
  }

  const approved  = items.filter(i => i.status === "approved");
  const pending   = items.filter(i => i.status === "pending");
  const displayed = (isAdmin ? (tab === "approved" ? approved : pending) : approved).filter(i => typeFilter === "all" || i.type === typeFilter);

  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>
      <button onClick={() => setShowForm(!showForm)} style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg,#d35400,#a04000)", color: "#fff", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontSize: "14px", fontWeight: "700", cursor: "pointer", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
        <Icon name="plus" size={18} /> {showForm ? "إلغاء" : "أضف مفقود أو موجود"}
      </button>
      {showForm && (
        <div style={{ background: "#fdf2e9", borderRadius: "12px", padding: "16px", marginBottom: "16px", border: "2px solid #f0b27a" }}>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            {[{ v: "lost", l: "🔍 مفقود" }, { v: "found", l: "✅ موجود" }].map(t => (
              <button key={t.v} onClick={() => setForm(p => ({ ...p, type: t.v }))} style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "none", cursor: "pointer", background: form.type === t.v ? "#d35400" : "#f0f0f0", color: form.type === t.v ? "#fff" : "#555", fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "13px" }}>{t.l}</button>
            ))}
          </div>
          <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="اسم أو وصف مختصر *" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #f0b27a", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="تفاصيل إضافية" rows={3} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #f0b27a", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", resize: "none", boxSizing: "border-box" }} />
          <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="رقم التواصل *" type="tel" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #f0b27a", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          <input value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} placeholder="رابط الصورة (اختياري)" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #f0b27a", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box" }} />
          <button onClick={submitItem} style={{ width: "100%", padding: "12px", background: "#d35400", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>إرسال</button>
        </div>
      )}
      {isAdmin && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          {[{ id: "approved", label: "المنشورة" }, { id: "pending", label: `انتظار (${pending.length})` }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "none", cursor: "pointer", background: tab === t.id ? "#d35400" : "#f0f0f0", color: tab === t.id ? "#fff" : "#555", fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "700" }}>{t.label}</button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        {[{ v: "all", l: "الكل" }, { v: "lost", l: "🔍 مفقود" }, { v: "found", l: "✅ موجود" }].map(t => (
          <button key={t.v} onClick={() => setTypeFilter(t.v)} style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "none", cursor: "pointer", background: typeFilter === t.v ? "#2c3e50" : "#f0f0f0", color: typeFilter === t.v ? "#fff" : "#555", fontFamily: "'Cairo', sans-serif", fontSize: "12px", fontWeight: "700" }}>{t.l}</button>
        ))}
      </div>
      {loading ? <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>جاري التحميل...</div> :
        displayed.length === 0 ? <div style={{ textAlign: "center", padding: "40px", color: "#aaa" }}> لا توجد سجلات</div> :
        displayed.map(item => (
          <div key={item.id} style={{ background: "#fff", borderRadius: "14px", marginBottom: "12px", overflow: "hidden", border: `2px solid ${item.type === "lost" ? "#f0b27a" : "#a9dfbf"}` }}>
            {item.image_url && <img src={item.image_url} alt={item.title} style={{ width: "100%", height: "150px", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />}
            <div style={{ padding: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <span style={{ background: item.type === "lost" ? "#fdf2e9" : "#eafaf1", color: item.type === "lost" ? "#d35400" : "#27ae60", border: `1.5px solid ${item.type === "lost" ? "#f0b27a" : "#a9dfbf"}`, borderRadius: "20px", padding: "2px 10px", fontSize: "11px", fontWeight: "700" }}>{item.type === "lost" ? "🔍 مفقود" : "✅ موجود"}</span>
                <span style={{ fontWeight: "800", fontSize: "14px", color: "#2c3e50" }}>{item.title}</span>
              </div>
              {item.description && <div style={{ fontSize: "13px", color: "#666", lineHeight: "1.6", marginBottom: "10px" }}>{item.description}</div>}
              <div style={{ fontSize: "11px", color: "#aaa", marginBottom: "10px" }}>🕐 {new Date(item.created_at).toLocaleDateString("ar-SY", { year: "numeric", month: "long", day: "numeric" })}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <a href={`tel:${item.phone}`} style={{ display: "flex", alignItems: "center", gap: "6px", background: item.type === "lost" ? "#fdf2e9" : "#eafaf1", border: `1.5px solid ${item.type === "lost" ? "#f0b27a" : "#a9dfbf"}`, borderRadius: "8px", padding: "8px 12px", color: item.type === "lost" ? "#d35400" : "#27ae60", textDecoration: "none", fontSize: "13px", fontWeight: "700", fontFamily: "'Cairo', sans-serif" }}>
                  <Icon name="phone" size={14} color={item.type === "lost" ? "#65432c" : "#27ae60"} /> {item.phone}
                </a>
                <div style={{ display: "flex", gap: "6px" }}>
                  {canEdit && item.status === "pending" && <button onClick={() => updateStatus(item.id, "approved")} style={{ background: "#27ae60", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 12px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontSize: "12px", fontWeight: "700" }}>✅ موافقة</button>}
                  {canEdit && <button onClick={() => deleteItem(item.id)} style={{ background: "#fdedec", border: "none", borderRadius: "8px", padding: "8px", cursor: "pointer" }}><Icon name="trash" size={14} color="#c0392b" /></button>}
                </div>
              </div>
            </div>
          </div>
        ))
      }
    </div>
  );
}

// ==================== LINKS PAGE ====================
function LinksPage({ isAdmin, adminRole, editorPerms }) {
  const [categories,   setCategories]  = useState([]);
  const [links,        setLinks]       = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [showCatForm,  setShowCatForm] = useState(false);
  const [showLinkForm, setShowLinkForm]= useState(false);
  const [catForm,      setCatForm]     = useState({ name: "", icon: "🔗" });
  const [linkForm,     setLinkForm]    = useState({ title: "", url: "", category_id: "" });
  const [expandedCat,  setExpandedCat] = useState(null);

  const canEdit = canDo("links", isAdmin, adminRole, editorPerms);
  const ICONS = ["🔗","🏛️","🏥","🚒","📚","🏫","💼","🌐","📞","⚡","🏗️","🚜","💰","📋","🕌"];

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const cc = getCache("link_categories"), cl = getCache("links");
    if (cc && cl) { setCategories(cc); setLinks(cl); if (cc.length > 0) setExpandedCat(cc[0].id); setLoading(false); return; }
    const cats = await supabase("link_categories", "GET", null, "?order=id");
    const lnks = await supabase("links", "GET", null, "?order=created_at.desc");
    setCategories(cats || []); setLinks(lnks || []);
if (cats && cats.length > 0) setExpandedCat(null);
    if (cats) setCache("link_categories", cats); if (lnks) setCache("links", lnks);
    setLoading(false);
  }

  async function addCategory() {
    if (!catForm.name.trim()) return alert("اسم الفئة مطلوب!");
    const res = await supabase("link_categories", "POST", catForm);
    if (res) { setCatForm({ name: "", icon: "🔗" }); setShowCatForm(false); clearCache("link_categories"); clearCache("links"); await loadAll(); }
    else alert("حدث خطأ.");
  }

  async function deleteCategory(id) {
    if (!confirm("سيتم حذف الفئة وجميع روابطها!")) return;
    await supabase("links", "DELETE", null, `?category_id=eq.${id}`);
    await supabase("link_categories", "DELETE", null, `?id=eq.${id}`);
    clearCache("link_categories"); clearCache("links"); await loadAll();
  }

  async function addLink() {
    if (!linkForm.title.trim() || !linkForm.url.trim() || !linkForm.category_id) return alert("جميع الحقول مطلوبة!");
    let url = linkForm.url.trim();
    if (!url.startsWith("http")) url = "https://" + url;
    const res = await supabase("links", "POST", { ...linkForm, url });
    if (res) { setLinkForm({ title: "", url: "", category_id: "" }); setShowLinkForm(false); clearCache("link_categories"); clearCache("links"); await loadAll(); }
    else alert("حدث خطأ.");
  }

  async function deleteLink(id) {
    if (!confirm("حذف الرابط؟")) return;
    await supabase("links", "DELETE", null, `?id=eq.${id}`); clearCache("link_categories"); clearCache("links"); await loadAll();
  }

  if (loading) return <div style={{ textAlign: "center", padding: "60px 20px", color: "#888", fontFamily: "'Cairo', sans-serif" }}>جاري التحميل...</div>;

  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>
      {canEdit && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <button onClick={() => { setShowCatForm(!showCatForm); setShowLinkForm(false); }} style={{ flex: 1, padding: "11px", background: "linear-gradient(135deg,#8e44ad,#6c3483)", color: "#fff", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}><Icon name="plus" size={16} /> فئة جديدة</button>
          <button onClick={() => { setShowLinkForm(!showLinkForm); setShowCatForm(false); }} style={{ flex: 1, padding: "11px", background: "linear-gradient(135deg,#c0392b,#922b21)", color: "#fff", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}><Icon name="links" size={16} /> رابط جديد</button>
        </div>
      )}
      {canEdit && showCatForm && (
        <div style={{ background: "#f5eef8", borderRadius: "12px", padding: "16px", marginBottom: "16px", border: "2px solid #d7bde2" }}>
          <input placeholder="اسم الفئة" value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1.5px solid #d7bde2", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box" }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
            {ICONS.map(ic => <button key={ic} onClick={() => setCatForm(p => ({ ...p, icon: ic }))} style={{ width: "36px", height: "36px", fontSize: "18px", border: catForm.icon === ic ? "2px solid #8e44ad" : "2px solid #ddd", borderRadius: "8px", background: catForm.icon === ic ? "#f5eef8" : "#fff", cursor: "pointer" }}>{ic}</button>)}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={addCategory} style={{ flex: 1, padding: "11px", background: "#8e44ad", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>إضافة</button>
            <button onClick={() => setShowCatForm(false)} style={{ flex: 1, padding: "11px", background: "#f0f0f0", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
          </div>
        </div>
      )}
      {canEdit && showLinkForm && (
        <div style={{ background: "#fdedec", borderRadius: "12px", padding: "16px", marginBottom: "16px", border: "2px solid #f1948a" }}>
          <select value={linkForm.category_id} onChange={e => setLinkForm(p => ({ ...p, category_id: e.target.value }))} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1.5px solid #f1948a", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box" }}>
            <option value="">-- اختر الفئة --</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <input placeholder="عنوان الرابط" value={linkForm.title} onChange={e => setLinkForm(p => ({ ...p, title: e.target.value }))} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1.5px solid #f1948a", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box" }} />
          <input placeholder="الرابط" value={linkForm.url} onChange={e => setLinkForm(p => ({ ...p, url: e.target.value }))} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1.5px solid #f1948a", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box", direction: "ltr" }} />
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={addLink} style={{ flex: 1, padding: "11px", background: "#c0392b", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>إضافة</button>
            <button onClick={() => setShowLinkForm(false)} style={{ flex: 1, padding: "11px", background: "#f0f0f0", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
          </div>
        </div>
      )}
      {categories.length === 0 && <div style={{ textAlign: "center", padding: "60px 20px", color: "#aaa" }}><div style={{ fontSize: "48px", marginBottom: "12px" }}>🔗</div><div style={{ fontWeight: "700" }}>لا توجد روابط بعد</div></div>}
      {categories.map(cat => {
        const catLinks = links.filter(l => String(l.category_id) === String(cat.id));
        const isOpen   = expandedCat === cat.id;
        return (
          <div key={cat.id} style={{ marginBottom: "12px", borderRadius: "14px", overflow: "hidden", border: "1.5px solid #e8e8e8", background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
            <div onClick={() => setExpandedCat(isOpen ? null : cat.id)} style={{ display: "flex", alignItems: "center", padding: "14px 16px", cursor: "pointer", background: isOpen ? "linear-gradient(135deg,#c0392b,#922b21)" : "#f8f8f8" }}>
              <span style={{ fontSize: "22px", marginLeft: "10px" }}>{cat.icon}</span>
              <span style={{ flex: 1, fontWeight: "700", fontSize: "15px", color: isOpen ? "#fff" : "#333" }}>{cat.name}</span>
              <span style={{ fontSize: "12px", color: isOpen ? "rgba(255,255,255,.7)" : "#aaa", marginLeft: "8px" }}>{catLinks.length} رابط</span>
              <Icon name={isOpen ? "chevronUp" : "chevronDown"} size={18} color={isOpen ? "#fff" : "#999"} />
              {canEdit && <button onClick={e => { e.stopPropagation(); deleteCategory(cat.id); }} style={{ marginRight: "8px", background: "rgba(255,255,255,.2)", border: "none", borderRadius: "6px", padding: "4px 6px", cursor: "pointer" }}><Icon name="trash" size={14} color={isOpen ? "#fff" : "#e74c3c"} /></button>}
            </div>
            {isOpen && (
              <div style={{ padding: "8px" }}>
                {catLinks.length === 0 && <div style={{ textAlign: "center", padding: "16px", color: "#bbb", fontSize: "13px" }}>لا توجد روابط في هذه الفئة</div>}
                {catLinks.map(link => (
                  <div key={link.id} style={{ display: "flex", alignItems: "center", padding: "10px 12px", borderRadius: "10px", marginBottom: "6px", background: "#fafafa", border: "1px solid #f0f0f0" }}>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: "#c0392b", fontWeight: "600", fontSize: "14px", textDecoration: "none" }}>🔗 {link.title}</a>
                    {canEdit && <button onClick={() => deleteLink(link.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px" }}><Icon name="trash" size={15} color="#e74c3c" /></button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ==================== TRANSPORT PAGE ====================
function TransportPage({ isAdmin, adminRole, editorPerms }) {
  const [categories,    setCategories]   = useState([]);
  const [drivers,       setDrivers]      = useState([]);
  const [loading,       setLoading]      = useState(true);
  const [showCatForm,   setShowCatForm]  = useState(false);
  const [showDrvForm,   setShowDrvForm]  = useState(false);
  const [catForm,       setCatForm]      = useState({ name: "", icon: "🚗", sort_order: 0 });
  const [driverForm,    setDriverForm]   = useState({ name: "", phone: "", image_url: "", category_id: "" });
  const [expandedCat,   setExpandedCat]  = useState(null);

  const canEdit = canDo("transport", isAdmin, adminRole, editorPerms);
  const ICONS   = ["🚗","🚐","🛻","🚌","🏍️","🚜","🚛","🚑","🔧","📦"];

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
  setLoading(true);
 

  const cats = await supabase("transport_categories", "GET", null, "?order=sort_order.asc,id.asc");
  const drvs = await supabase("transport_drivers", "GET", null, "?order=created_at.desc");
  const likesData = await supabase("driver_likes", "GET", null, "");

  setCategories(cats || []);

  if (drvs) {
    const drvsWithLikes = drvs.map(d => ({
      ...d,
      likes_count: likesData 
        ? likesData.filter(l => l.driver_id === String(d.id)).length 
        : 0
    }));
    drvsWithLikes.sort((a, b) => b.likes_count - a.likes_count);
    setDrivers(drvsWithLikes);
  }

if (cats && cats.length > 0) setExpandedCat(null);
  setLoading(false);
}

  async function addCategory() {
    if (!catForm.name.trim()) return alert("اسم الفئة مطلوب!");
    const res = await supabase("transport_categories", "POST", catForm);
    if (res) { setCatForm({ name: "", icon: "🚗", sort_order: 0 }); setShowCatForm(false); clearCache("transport_categories"); clearCache("transport_drivers"); await loadAll(); }
    else alert("حدث خطأ.");
  }

  async function deleteCategory(id) {
    if (!confirm("سيتم حذف الفئة وجميع سائقيها!")) return;
    await supabase("transport_drivers",    "DELETE", null, `?category_id=eq.${id}`);
    await supabase("transport_categories", "DELETE", null, `?id=eq.${id}`);
    clearCache("transport_categories"); clearCache("transport_drivers"); await loadAll();
  }

  async function addDriver() {
    if (!driverForm.name.trim() || !driverForm.phone.trim() || !driverForm.category_id) return alert("الاسم والهاتف والفئة مطلوبة!");
    const res = await supabase("transport_drivers", "POST", driverForm);
    if (res) { setDriverForm({ name: "", phone: "", image_url: "", category_id: "" }); setShowDrvForm(false); clearCache("transport_categories"); clearCache("transport_drivers"); await loadAll(); }
    else alert("حدث خطأ.");
  }

  async function deleteDriver(id) {
    if (!confirm("حذف السائق؟")) return;
    await supabase("transport_drivers", "DELETE", null, `?id=eq.${id}`); clearCache("transport_categories"); clearCache("transport_drivers"); await loadAll();
  }

  if (loading) return <div style={{ textAlign: "center", padding: "60px", color: "#888", fontFamily: "'Cairo', sans-serif" }}>جاري التحميل...</div>;

  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>
      {canEdit && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <button onClick={() => { setShowCatForm(!showCatForm); setShowDrvForm(false); }} style={{ flex: 1, padding: "11px", background: "linear-gradient(135deg,#1a5276,#154360)", color: "#fff", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}><Icon name="plus" size={16} /> فئة جديدة</button>
          <button onClick={() => { setShowDrvForm(!showDrvForm); setShowCatForm(false); }} style={{ flex: 1, padding: "11px", background: "linear-gradient(135deg,#c0392b,#922b21)", color: "#fff", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}><Icon name="plus" size={16} /> سائق جديد</button>
        </div>
      )}
      {canEdit && showCatForm && (
        <div style={{ background: "#eaf2ff", borderRadius: "12px", padding: "16px", marginBottom: "16px", border: "2px solid #aed6f1" }}>
          <input placeholder="اسم الفئة" value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1.5px solid #aed6f1", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box" }} />
          <input placeholder="الترتيب" type="number" value={catForm.sort_order} onChange={e => setCatForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1.5px solid #aed6f1", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box" }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
            {ICONS.map(ic => <button key={ic} onClick={() => setCatForm(p => ({ ...p, icon: ic }))} style={{ width: "38px", height: "38px", fontSize: "20px", border: catForm.icon === ic ? "2px solid #1a5276" : "2px solid #ddd", borderRadius: "8px", background: catForm.icon === ic ? "#d6eaf8" : "#fff", cursor: "pointer" }}>{ic}</button>)}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={addCategory} style={{ flex: 1, padding: "11px", background: "#1a5276", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>إضافة</button>
            <button onClick={() => setShowCatForm(false)} style={{ flex: 1, padding: "11px", background: "#f0f0f0", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
          </div>
        </div>
      )}
      {canEdit && showDrvForm && (
        <div style={{ background: "#fdedec", borderRadius: "12px", padding: "16px", marginBottom: "16px", border: "2px solid #f1948a" }}>
          <select value={driverForm.category_id} onChange={e => setDriverForm(p => ({ ...p, category_id: e.target.value }))} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1.5px solid #f1948a", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box" }}>
            <option value="">-- اختر الفئة --</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <input placeholder="الاسم" value={driverForm.name} onChange={e => setDriverForm(p => ({ ...p, name: e.target.value }))} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1.5px solid #f1948a", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box" }} />
          <input placeholder="رقم الهاتف" value={driverForm.phone} onChange={e => setDriverForm(p => ({ ...p, phone: e.target.value }))} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1.5px solid #f1948a", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box", direction: "ltr" }} />
          <input placeholder="رابط صورة (اختياري)" value={driverForm.image_url} onChange={e => setDriverForm(p => ({ ...p, image_url: e.target.value }))} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1.5px solid #f1948a", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={addDriver} style={{ flex: 1, padding: "11px", background: "#c0392b", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>إضافة</button>
            <button onClick={() => setShowDrvForm(false)} style={{ flex: 1, padding: "11px", background: "#f0f0f0", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
          </div>
        </div>
      )}
      {categories.length === 0 && <div style={{ textAlign: "center", padding: "60px 20px", color: "#aaa" }}><div style={{ fontSize: "48px", marginBottom: "12px" }}>🚗</div><div style={{ fontWeight: "700" }}>لا توجد فئات بعد</div></div>}
      {categories.map(cat => {
        const catDrivers = drivers
  .filter(d => String(d.category_id) === String(cat.id))
  .sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
        const isOpen     = expandedCat === cat.id;
        return (
          <div key={cat.id} style={{ marginBottom: "14px", borderRadius: "16px", overflow: "hidden", border: "1.5px solid #e8e8e8", background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,.07)" }}>
            <div onClick={() => setExpandedCat(isOpen ? null : cat.id)} style={{ display: "flex", alignItems: "center", padding: "14px 16px", cursor: "pointer", background: isOpen ? "linear-gradient(135deg,#c0392b,#922b21)" : "#f8f8f8" }}>
              <span style={{ fontSize: "24px", marginLeft: "10px" }}>{cat.icon}</span>
              <span style={{ flex: 1, fontWeight: "800", fontSize: "15px", color: isOpen ? "#fff" : "#333" }}>{cat.name}</span>
              <span style={{ fontSize: "12px", color: isOpen ? "rgba(255,255,255,.7)" : "#aaa", marginLeft: "8px" }}>{catDrivers.length} سائق</span>
              <Icon name={isOpen ? "chevronUp" : "chevronDown"} size={18} color={isOpen ? "#fff" : "#999"} />
              {canEdit && <button onClick={e => { e.stopPropagation(); deleteCategory(cat.id); }} style={{ marginRight: "8px", background: "rgba(255,255,255,.2)", border: "none", borderRadius: "6px", padding: "4px 6px", cursor: "pointer" }}><Icon name="trash" size={14} color={isOpen ? "#fff" : "#e74c3c"} /></button>}
            </div>
            {isOpen && (
              <div style={{ padding: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {catDrivers.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "20px", color: "#bbb", fontSize: "13px" }}>لا يوجد سائقون في هذه الفئة</div>}
                {catDrivers.map(driver => (
                  <div key={driver.id} style={{ borderRadius: "12px", border: "1.5px solid #f0f0f0", overflow: "hidden", background: "#fafafa", position: "relative" }}>
                    {driver.image_url ? <img src={driver.image_url} alt={driver.name} style={{ width: "100%", height: "100px", objectFit: "cover" }} onError={e => e.target.style.display = "none"} /> :
                      <div style={{ width: "100%", height: "100px", background: "linear-gradient(135deg,#2c3e50,#1a2634)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "40px" }}>{cat.icon}</div>}
                    <div style={{ padding: "8px" }}>
                      <div style={{ fontWeight: "700", fontSize: "13px", color: "#2c3e50", marginBottom: "6px" }}>{driver.name}</div>
                      <a href={`tel:${driver.phone}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", padding: "7px", background: "linear-gradient(135deg,#27ae60,#1e8449)", color: "#fff", borderRadius: "8px", textDecoration: "none", fontSize: "12px", fontWeight: "700", fontFamily: "'Cairo', sans-serif" }}>
                        <Icon name="phone" size={13} color="#fff" /> {driver.phone}
                      </a>
                    </div>
                    <DriverLikeButton driverId={driver.id} />
                    {canEdit && <button onClick={() => deleteDriver(driver.id)} style={{ position: "absolute", top: "6px", left: "6px", background: "rgba(231,76,60,.9)", border: "none", borderRadius: "6px", padding: "4px 6px", cursor: "pointer" }}><Icon name="trash" size={13} color="#fff" /></button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ==================== DRIVER LIKE BUTTON ====================
function DriverLikeButton({ driverId }) {
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);
  const [loading, setLoading] = useState(false);

  function getUserToken() {
    let token = localStorage.getItem("user_token");
    if (!token) {
      token = Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem("user_token", token);
    }
    return token;
  }

  useEffect(() => { loadLikes(); }, [driverId]);

  async function loadLikes() {
    const token = getUserToken();
    const data = await supabase("driver_likes", "GET", null, `?driver_id=eq.${driverId}`);
    console.log("likes data:", data);
    if (data && Array.isArray(data)) {
      setLikes(data.length);
      setLiked(data.some(like => like.user_token === token));
    }
  }

  async function toggleLike() {
    if (loading) return;
    setLoading(true);
    const token = getUserToken();
    console.log("token:", token, "driverId:", driverId, "liked:", liked);

    if (!liked) {
      const res = await supabase("driver_likes", "POST", { 
        driver_id: String(driverId), 
        user_token: token 
      });
      console.log("POST result:", res);
      setLiked(true);
      setLikes(prev => prev + 1);
    } else {
      const res = await supabase("driver_likes", "DELETE", null, 
        `?driver_id=eq.${driverId}&user_token=eq.${token}`
      );
      console.log("DELETE result:", res);
      setLiked(false);
      setLikes(prev => Math.max(0, prev - 1));
    }
    setLoading(false);
  }

  return (
    <button onClick={toggleLike} disabled={loading}
      style={{ 
        position: "absolute", top: "8px", right: "8px", 
        background: liked ? "#e8f0fe" : "#fff", 
        border: liked ? "1.5px solid #1877f2" : "1.5px solid #ddd", 
        borderRadius: "20px", padding: "6px 12px", 
        cursor: loading ? "wait" : "pointer", 
        display: "flex", alignItems: "center", gap: "5px", 
        fontSize: "13px", fontWeight: "700", 
        fontFamily: "'Cairo', sans-serif", 
        color: liked ? "#1877f2" : "#65676b", 
        boxShadow: "0 2px 8px rgba(0,0,0,.2)", 
        userSelect: "none", zIndex: 10,
        transition: "all 0.2s",
        opacity: loading ? 0.7 : 1,
      }}>
      <span style={{ 
        fontSize: "18px", 
        transform: liked ? "scale(1.2)" : "scale(1)", 
        transition: "transform .2s" 
      }}>
        {loading ? "⏳" : liked ? "👍" : "👍🏻"}
      </span>
      <span style={{ fontSize: "13px", fontWeight: "600", minWidth: "16px", textAlign: "center" }}>
        {likes}
      </span>
    </button>
  );
}

// ==================== MOSQUES PAGE ====================
function MosquesPage({ isAdmin, adminRole, editorPerms }) {
  const [mosques,     setMosques]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [selected,    setSelected]    = useState(null);
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState({ name: "", image_url: "", imam: "", khatib: "", location: "", notes: "" });
  const [editingItem, setEditingItem] = useState(null);
  const [editForm,    setEditForm]    = useState({});
  const [comments,    setComments]    = useState([]);
  const [commLoading, setCommLoading] = useState(false);
  const [newComment,  setNewComment]  = useState({ author: "", text: "" });
  const [submitting,  setSubmitting]  = useState(false);
  const [deletingId,  setDeletingId]  = useState(null);
  const [orderChanged, setOrderChanged] = useState(false);
  const [saving,      setSaving]      = useState(false);

  const canEdit = canDo("mosques", isAdmin, adminRole, editorPerms);
  const isSuper = adminRole === "super";

  useEffect(() => { loadMosques(); }, []);

  async function loadMosques() {
    setLoading(true);
    const cached = getCache("mosques");
    if (cached) { setMosques(cached); setLoading(false); return; }
    const data = await supabase("mosques", "GET", null, "?order=display_order.asc,created_at.desc");
    setMosques(data || []); if (data) setCache("mosques", data); setLoading(false);
  }

  async function moveUp(index) {
    if (index === 0) return;
    const newMosques = [...mosques];
    [newMosques[index], newMosques[index - 1]] = [newMosques[index - 1], newMosques[index]];
    setMosques(newMosques);
    setOrderChanged(true);
  }

  async function moveDown(index) {
    if (index === mosques.length - 1) return;
    const newMosques = [...mosques];
    [newMosques[index], newMosques[index + 1]] = [newMosques[index + 1], newMosques[index]];
    setMosques(newMosques);
    setOrderChanged(true);
  }

  async function confirmSaveOrder() {
    if (!orderChanged) return;
    setSaving(true);
    try {
      for (let i = 0; i < mosques.length; i++) {
        await supabase("mosques", "PATCH", { display_order: i }, `?id=eq.${mosques[i].id}`);
      }
      clearCache("mosques");
      await loadMosques();
      setOrderChanged(false);
      alert("✅ تم حفظ ترتيب المساجد بنجاح!");
    } catch (err) {
      alert("❌ حدث خطأ في حفظ الترتيب");
    } finally {
      setSaving(false);
    }
  }

  async function addMosque() {
    if (!form.name.trim()) return alert("اسم المسجد مطلوب!");
    await supabase("mosques", "POST", form);
    setForm({ name: "", image_url: "", imam: "", khatib: "", location: "", notes: "" });
    setShowForm(false); clearCache("mosques"); loadMosques();
  }

  async function deleteMosque(id) {
    if (!confirm("حذف المسجد؟")) return;
    await supabase("mosques", "DELETE", null, `?id=eq.${id}`);
    clearCache("mosques"); loadMosques();
  }

  async function saveEdit() {
    await supabase("mosques", "PATCH", editForm, `?id=eq.${editingItem}`);
    setEditingItem(null); clearCache("mosques"); loadMosques();
  }

  async function openMosque(m) {
    setSelected(m);
    setComments([]);
    setCommLoading(true);
    const data = await supabase("mosque_comments", "GET", null, `?mosque_id=eq.${m.id}&order=created_at.asc`);
    setComments(data || []);
    setCommLoading(false);
  }

  async function submitComment() {
    if (!newComment.author.trim() || !newComment.text.trim()) return alert("الاسم والتعليق مطلوبان!");
    setSubmitting(true);
    await supabase("mosque_comments", "POST", {
      mosque_id: selected.id,
      author: newComment.author,
      text: newComment.text
    });
    setNewComment({ author: "", text: "" });
    const data = await supabase("mosque_comments", "GET", null, `?mosque_id=eq.${selected.id}&order=created_at.asc`);
    setComments(data || []);
    setSubmitting(false);
  }

  async function deleteComment(id) {
    if (!confirm("حذف التعليق؟")) return;
    setDeletingId(id);
    await supabase("mosque_comments", "DELETE", null, `?id=eq.${id}`);
    setComments(prev => prev.filter(c => c.id !== id));
    setDeletingId(null);
  }

  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>
      {canEdit && (
        <button onClick={() => setShowForm(!showForm)}
          style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg,#1a8a4a,#145a32)", color: "#fff", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontSize: "14px", fontWeight: "700", cursor: "pointer", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
          <Icon name="plus" size={18} /> {showForm ? "إلغاء" : "إضافة مسجد جديد"}
        </button>
      )}

      {orderChanged && isSuper && (
        <button onClick={confirmSaveOrder} disabled={saving}
          style={{ width: "100%", padding: "12px", background: saving ? "rgba(10,140,105,.5)" : "linear-gradient(135deg,#10b981,#059669)", color: "#fff", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontSize: "14px", fontWeight: "700", cursor: saving ? "not-allowed" : "pointer", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
          💾 {saving ? "جاري الحفظ..." : "حفظ الترتيب الجديد"}
        </button>
      )}

      {showForm && (
        <div style={{ background: "#eafaf1", borderRadius: "12px", padding: "16px", marginBottom: "16px", border: "2px solid #a9dfbf" }}>
          {[["name","اسم المسجد *"],["image_url","رابط صورة المسجد"],["imam","اسم الإمام"],["khatib","اسم الخطيب"],["location","موقع المسجد أو الحي"]].map(([k,ph]) => (
            <input key={k} value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} placeholder={ph}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #a9dfbf", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          ))}
          <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات إضافية" rows={3}
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #a9dfbf", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", resize: "none", boxSizing: "border-box" }} />
          <button onClick={addMosque}
            style={{ width: "100%", padding: "12px", background: "#1a8a4a", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>
            حفظ المسجد
          </button>
        </div>
      )}

      {loading
        ? <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>جاري التحميل...</div>
        : mosques.length === 0
          ? <div style={{ textAlign: "center", padding: "40px", color: "#aaa" }}>
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>🕌</div>
              <div style={{ fontWeight: "700" }}>لا توجد مساجد مضافة بعد</div>
            </div>
          : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {mosques.map((m, idx) => (
                <div key={m.id}
                  style={{ borderRadius: "14px", overflow: "hidden", border: "1.5px solid #e8e8e8", background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,.07)", cursor: "pointer", position: "relative" }}
                  onClick={() => openMosque(m)}>
                  {m.image_url
                    ? <img src={m.image_url} alt={m.name} style={{ width: "100%", height: "120px", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />
                    : <div style={{ width: "100%", height: "120px", background: "linear-gradient(135deg,#1a8a4a,#145a32)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "48px" }}>🕌</div>
                  }
                  <div style={{ padding: "10px" }}>
                    <div style={{ fontWeight: "800", fontSize: "13px", color: "#2c3e50", textAlign: "center" }}>{m.name}</div>
                    {m.location && <div style={{ fontSize: "11px", color: "#888", textAlign: "center", marginTop: "4px" }}>📍 {m.location}</div>}
                  </div>
                  <div style={{ position: "absolute", top: "6px", left: "6px", display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {isSuper && (
                      <>
                        <button onClick={e => { e.stopPropagation(); moveUp(idx); }} disabled={idx === 0}
                          style={{ background: idx === 0 ? "rgba(0,0,0,.2)" : "rgba(52,152,219,.9)", border: "none", borderRadius: "6px", padding: "4px 6px", cursor: idx === 0 ? "not-allowed" : "pointer" }}>
                          <Icon name="arrow" size={13} color="#fff" /> ⬆️
                        </button>
                        <button onClick={e => { e.stopPropagation(); moveDown(idx); }} disabled={idx === mosques.length - 1}
                          style={{ background: idx === mosques.length - 1 ? "rgba(0,0,0,.2)" : "rgba(52,152,219,.9)", border: "none", borderRadius: "6px", padding: "4px 6px", cursor: idx === mosques.length - 1 ? "not-allowed" : "pointer" }}>
                          ⬇️
                        </button>
                        <button onClick={e => { e.stopPropagation(); setEditingItem(m.id); setEditForm({ name: m.name, image_url: m.image_url || "", imam: m.imam || "", khatib: m.khatib || "", location: m.location || "", notes: m.notes || "" }); }}
                          style={{ background: "rgba(41,128,185,.9)", border: "none", borderRadius: "6px", padding: "4px 6px", cursor: "pointer" }}>
                          <Icon name="edit" size={13} color="#fff" />
                        </button>
                      </>
                    )}
                    {canEdit && (
                      <button onClick={e => { e.stopPropagation(); deleteMosque(m.id); }}
                        style={{ background: "rgba(231,76,60,.9)", border: "none", borderRadius: "6px", padding: "4px 6px", cursor: "pointer" }}>
                        <Icon name="trash" size={13} color="#fff" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
      }

      {/* ── تفاصيل المسجد + التعليقات ── */}
      {selected && (
        <div onClick={() => setSelected(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: "20px", width: "100%", maxWidth: "390px", overflow: "hidden", maxHeight: "90vh", overflowY: "auto" }}>

            {selected.image_url
              ? <img src={selected.image_url} alt={selected.name} style={{ width: "100%", height: "200px", objectFit: "cover" }} />
              : <div style={{ width: "100%", height: "200px", background: "linear-gradient(135deg,#1a8a4a,#145a32)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "80px" }}>🕌</div>
            }

            <div style={{ padding: "18px" }}>
              <div style={{ fontWeight: "800", fontSize: "18px", color: "#2c3e50", marginBottom: "14px", textAlign: "center" }}>{selected.name}</div>

              {selected.location && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", background: "#f8f9fa", borderRadius: "10px", padding: "10px" }}>
                  <span>📍</span>
                  <div>
                    <div style={{ fontSize: "11px", color: "#888" }}>الموقع</div>
                    <div style={{ fontWeight: "700", fontSize: "13px" }}>{selected.location}</div>
                  </div>
                </div>
              )}
              {selected.imam && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", background: "#eafaf1", borderRadius: "10px", padding: "10px" }}>
                  <span>👳</span>
                  <div>
                    <div style={{ fontSize: "11px", color: "#888" }}>الإمام</div>
                    <div style={{ fontWeight: "700", fontSize: "13px" }}>{selected.imam}</div>
                  </div>
                </div>
              )}
              {selected.khatib && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", background: "#ebf5fb", borderRadius: "10px", padding: "10px" }}>
                  <span>🎙️</span>
                  <div>
                    <div style={{ fontSize: "11px", color: "#888" }}>الخطيب</div>
                    <div style={{ fontWeight: "700", fontSize: "13px" }}>{selected.khatib}</div>
                  </div>
                </div>
              )}
              {selected.notes && (
                <div style={{ background: "#fdf2e9", borderRadius: "10px", padding: "12px", marginBottom: "10px" }}>
                  <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>معلومات</div>
                  <div style={{ fontSize: "13px", color: "#555", lineHeight: "1.7" }}>{selected.notes}</div>
                </div>
              )}

              {/* ── التعليقات ── */}
              <div style={{ marginTop: "16px", borderTop: "1.5px solid #f0f0f0", paddingTop: "14px" }}>
                <div style={{ fontWeight: "800", fontSize: "14px", color: "#1a8a4a", marginBottom: "12px" }}>
                  💬 التعليقات {comments.length > 0 && `(${comments.length})`}
                </div>

                {commLoading
                  ? <div style={{ textAlign: "center", padding: "16px", color: "#aaa", fontSize: "13px" }}>جاري تحميل التعليقات...</div>
                  : comments.length === 0
                    ? <div style={{ textAlign: "center", padding: "16px", color: "#bbb", fontSize: "13px" }}>لا توجد تعليقات — كن أول من يعلّق!</div>
                    : comments.map(c => (
                      <div key={c.id} style={{ background: "#f8f9fa", borderRadius: "10px", padding: "10px 12px", marginBottom: "8px", border: "1px solid #eee" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                          <span style={{ fontWeight: "700", fontSize: "13px", color: "#2c3e50" }}>👤 {c.author}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "11px", color: "#aaa" }}>{relativeTime(c.created_at)}</span>
                            {isSuper && (
                              <button onClick={() => deleteComment(c.id)} disabled={deletingId === c.id}
                                style={{ background: "#fdedec", border: "none", borderRadius: "6px", padding: "3px 6px", cursor: "pointer" }}>
                                <Icon name="trash" size={12} color="#c0392b" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div style={{ fontSize: "13px", color: "#555", lineHeight: "1.6" }}>{c.text}</div>
                      </div>
                    ))
                }

                {/* نموذج تعليق جديد */}
                <div style={{ marginTop: "12px", background: "#eafaf1", borderRadius: "12px", padding: "12px", border: "1.5px solid #a9dfbf" }}>
                  <div style={{ fontWeight: "700", fontSize: "13px", color: "#1a8a4a", marginBottom: "8px" }}>✍️ أضف تعليقاً</div>
                  <input value={newComment.author} onChange={e => setNewComment(p => ({ ...p, author: e.target.value }))} placeholder="اسمك *"
                    style={{ width: "100%", padding: "9px", borderRadius: "8px", border: "1px solid #a9dfbf", fontFamily: "'Cairo', sans-serif", fontSize: "13px", marginBottom: "8px", boxSizing: "border-box" }} />
                  <textarea value={newComment.text} onChange={e => setNewComment(p => ({ ...p, text: e.target.value }))} placeholder="تعليقك *" rows={3}
                    style={{ width: "100%", padding: "9px", borderRadius: "8px", border: "1px solid #a9dfbf", fontFamily: "'Cairo', sans-serif", fontSize: "13px", marginBottom: "8px", resize: "none", boxSizing: "border-box" }} />
                  <button onClick={submitComment} disabled={submitting}
                    style={{ width: "100%", padding: "10px", background: submitting ? "#aaa" : "#1a8a4a", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "13px", cursor: submitting ? "not-allowed" : "pointer" }}>
                    {submitting ? "جاري الإرسال..." : "إرسال التعليق 💬"}
                  </button>
                </div>
              </div>

              <button onClick={() => setSelected(null)}
                style={{ width: "100%", marginTop: "14px", padding: "12px", background: "#1a8a4a", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "14px", cursor: "pointer" }}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── تعديل المسجد (المدير الرئيسي) ── */}
      {editingItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "20px", width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ fontWeight: "800", fontSize: "16px", marginBottom: "14px", color: "#1a8a4a" }}>✏️ تعديل المسجد</div>

            {editForm.image_url ? (
              <img src={editForm.image_url} alt="معاينة"
                style={{ width: "100%", height: "140px", objectFit: "cover", borderRadius: "10px", marginBottom: "10px" }}
                onError={e => e.target.style.display = "none"} />
            ) : (
              <div style={{ width: "100%", height: "100px", background: "#eafaf1", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "40px", marginBottom: "10px" }}>🕌</div>
            )}

            {[["name","اسم المسجد"],["image_url","رابط الصورة"],["imam","الإمام"],["khatib","الخطيب"],["location","الموقع"]].map(([k,ph]) => (
              <input key={k} value={editForm[k] || ""} onChange={e => setEditForm(p => ({ ...p, [k]: e.target.value }))} placeholder={ph}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
            ))}
            <textarea value={editForm.notes || ""} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" rows={3}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "12px", resize: "none", boxSizing: "border-box" }} />

            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={saveEdit}
                style={{ flex: 1, padding: "12px", background: "#1a8a4a", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>
                حفظ
              </button>
              <button onClick={() => setEditingItem(null)}
                style={{ flex: 1, padding: "12px", background: "#f0f0f0", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== PHARMACY DUTY PAGE ====================
function PharmacyDutyPage({ isAdmin, adminRole, editorPerms, onBack }) {
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState({ image_url: "", note: "" });
  const [saving,    setSaving]    = useState(false);

  const canEdit = canDo("pharmacy", isAdmin, adminRole, editorPerms);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const res = await supabase("pharmacy_duty", "GET", null, "?limit=1");
    if (res && res[0]) {
      setData(res[0]);
      setForm({ image_url: res[0].image_url || "", note: res[0].note || "" });
    }
    setLoading(false);
  }

  async function saveData() {
    if (!form.image_url.trim()) return alert("رابط الصورة مطلوب!");
    setSaving(true);
    await supabase("pharmacy_duty", "PATCH",
      { image_url: form.image_url, note: form.note, updated_at: new Date().toISOString() },
      `?id=eq.${data.id}`
    );
    setSaving(false);
    setShowForm(false);
    loadData();
  }

  const formatDate = (d) => {
    if (!d) return "";
    return new Date(d).toLocaleString("ar-SY", {
      weekday: "long", day: "numeric", month: "long",
      hour: "2-digit", minute: "2-digit"
    });
  };

  return (
    <div style={{ fontFamily: "'Cairo', sans-serif", minHeight: "100vh", background: "#000" }}>

      {/* زر الرجوع */}
      <div style={{ position: "absolute", top: "12px", right: "12px", zIndex: 10 }}>
        <button onClick={onBack} style={{
          background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "10px",
          padding: "8px 16px", color: "#fff", fontFamily: "'Cairo', sans-serif",
          fontWeight: "700", fontSize: "13px", cursor: "pointer",
          backdropFilter: "blur(8px)"
        }}>← رجوع</button>
      </div>

      {/* زر التعديل للمحرر */}
      {canEdit && (
        <div style={{ position: "absolute", top: "12px", left: "12px", zIndex: 10 }}>
          <button onClick={() => setShowForm(true)} style={{
            background: "rgba(8,145,178,0.85)", border: "none", borderRadius: "10px",
            padding: "8px 16px", color: "#fff", fontFamily: "'Cairo', sans-serif",
            fontWeight: "700", fontSize: "13px", cursor: "pointer",
            backdropFilter: "blur(8px)"
          }}>✏️ تعديل</button>
        </div>
      )}

      {loading ? (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          height: "100vh", color: "#fff", fontSize: "16px"
        }}>جاري التحميل...</div>

      ) : !data?.image_url ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100vh", color: "#fff", textAlign: "center", padding: "20px"
        }}>
          <div style={{ fontSize: "64px", marginBottom: "16px" }}>💊</div>
          <div style={{ fontWeight: "800", fontSize: "18px", marginBottom: "8px" }}>
            لم يتم تحديث المناوبة بعد
          </div>
          <div style={{ fontSize: "13px", opacity: 0.7 }}>
            تواصل مع الإدارة للاستفسار
          </div>
        </div>

      ) : (
        <div style={{ position: "relative" }}>

          {/* الصورة تملأ الشاشة */}
          <img
            src={data.image_url}
            alt="مناوبة الصيدليات"
            style={{
              width: "100%",
              minHeight: "100vh",
              objectFit: "cover",
              display: "block"
            }}
            onError={e => {
              e.target.style.display = "none";
            }}
          />

          {/* شريط المعلومات في الأسفل */}
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0,
            background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
            padding: "30px 16px 16px",
            zIndex: 5
          }}>

            {/* الملاحظة */}
            {data.note && (
              <div style={{
                background: "rgba(8,145,178,0.9)",
                borderRadius: "12px", padding: "12px 16px",
                marginBottom: "10px", color: "#fff",
                fontSize: "14px", fontWeight: "600", lineHeight: "1.7",
                backdropFilter: "blur(8px)"
              }}>
                📝 {data.note}
              </div>
            )}

            {/* آخر تحديث */}
            <div style={{
              color: "rgba(255,255,255,0.75)",
              fontSize: "12px", textAlign: "center"
            }}>
              🕐 آخر تحديث: {formatDate(data.updated_at)}
            </div>

          </div>
        </div>
      )}

      {/* مودال التعديل */}
      {showForm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          zIndex: 2000, display: "flex", alignItems: "center",
          justifyContent: "center", padding: "20px"
        }}>
          <div style={{
            background: "#fff", borderRadius: "16px",
            padding: "20px", width: "100%"
          }}>
            <div style={{
              fontWeight: "800", fontSize: "16px",
              color: "#0891b2", marginBottom: "16px"
            }}>💊 تحديث مناوبة الصيدليات</div>

            <input
              value={form.image_url}
              onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))}
              placeholder="رابط صورة جدول المناوبة *"
              style={{
                width: "100%", padding: "10px", borderRadius: "8px",
                border: "1.5px solid #0891b2", fontFamily: "'Cairo', sans-serif",
                marginBottom: "10px", boxSizing: "border-box", fontSize: "13px"
              }}
            />

            <textarea
              value={form.note}
              onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
              placeholder="ملاحظة (اختياري) — مثال: الصيدليات المناوبة من 10م حتى 6ص"
              rows={3}
              style={{
                width: "100%", padding: "10px", borderRadius: "8px",
                border: "1.5px solid #0891b2", fontFamily: "'Cairo', sans-serif",
                marginBottom: "14px", boxSizing: "border-box",
                resize: "none", fontSize: "13px"
              }}
            />

            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={saveData} disabled={saving} style={{
                flex: 1, padding: "12px", background: saving ? "#aaa" : "#0891b2",
                color: "#fff", border: "none", borderRadius: "10px",
                fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: saving ? "not-allowed" : "pointer"
              }}>
                {saving ? "جاري الحفظ..." : "💾 حفظ"}
              </button>
              <button onClick={() => setShowForm(false)} style={{
                flex: 1, padding: "12px", background: "#f0f0f0",
                border: "none", borderRadius: "10px",
                fontFamily: "'Cairo', sans-serif", cursor: "pointer"
              }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== CITY SERVICES PAGE ====================
function CityServicesPage({ isAdmin, adminRole, editorPerms }) {
  const [currentService, setCurrentService] = useState(null);

useEffect(() => {
  const handleBack = (e) => {
    if (currentService !== null) {
      e.preventDefault();
      setCurrentService(null);
    }
  };

  window.addEventListener("popstate", handleBack);

  if (currentService !== null) {
    window.history.pushState({ service: currentService }, "");
  }

  return () => {
    window.removeEventListener("popstate", handleBack);
  };
}, [currentService]);
  const services = [
    { id: "prayer",  label: "أوقات الصلاة", icon: "🕐", color: "#1a8a4a", bg: "#eafaf1" },
    { id: "pharmacy", label: "مناوبة الصيدليات", icon: "💊", color: "#0891b2", bg: "#ecfeff" },
    { id: "water",   label: "جدول المياه",  icon: "💧", color: "#2980b9", bg: "#ebf5fb" },
    { id: "poll",    label: "استطلاع رأي",  icon: "📊", color: "#8e44ad", bg: "#f5eef8" },
    { id: "events",  label: "الفعاليات",    icon: "🗓️", color: "#d35400", bg: "#fdf2e9" },
    { id: "weather", label: "الطقس",        icon: "🌤️", color: "#1a5276", bg: "#eaf2ff" },
    { id: "gallery", label: "معرض الصور",   icon: "📸", color: "#c0392b", bg: "#fdedec" },
    { id: "obituary", label: "الوفيات",    icon: "🕊️", color: "#10b981", bg: "#eafaf1" },
  ];
  if (currentService === "prayer")  return <PrayerTimesPage isAdmin={isAdmin} adminRole={adminRole} onBack={() => setCurrentService(null)} />;
  if (currentService === "water")   return <WaterSchedulePage isAdmin={isAdmin} adminRole={adminRole} editorPerms={editorPerms} onBack={() => setCurrentService(null)} />;
  if (currentService === "poll")    return <PollPage isAdmin={isAdmin} adminRole={adminRole} onBack={() => setCurrentService(null)} />;
  if (currentService === "events")  return <EventsPage isAdmin={isAdmin} adminRole={adminRole} editorPerms={editorPerms} onBack={() => setCurrentService(null)} />;
  if (currentService === "weather") return <WeatherPage onBack={() => setCurrentService(null)} />;
  if (currentService === "gallery") return <GalleryPage isAdmin={isAdmin} adminRole={adminRole} editorPerms={editorPerms} onBack={() => setCurrentService(null)} />;
  if (currentService === "obituary") return <ObituaryPage isAdmin={isAdmin} adminRole={adminRole} editorPerms={editorPerms} onBack={() => setCurrentService(null)} />;
  if (currentService === "pharmacy") return <PharmacyDutyPage isAdmin={isAdmin} adminRole={adminRole} editorPerms={editorPerms} onBack={() => setCurrentService(null)} />;
  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {services.map((s, i) => (
          <button key={s.id} onClick={() => setCurrentService(s.id)} style={{ background: s.bg, border: `2px solid ${s.color}22`, borderRadius: "16px", padding: "24px 8px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", animation: `fadeInUp .4s ease ${i * .07}s both` }}
            onMouseDown={e => e.currentTarget.style.transform = "scale(.95)"} onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
            onTouchStart={e => e.currentTarget.style.transform = "scale(.95)"} onTouchEnd={e => e.currentTarget.style.transform = "scale(1)"}>
            <span style={{ fontSize: "36px" }}>{s.icon}</span>
            <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "700", color: "#2c3e50", textAlign: "center" }}>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ==================== PRAYER TIMES PAGE ====================
function PrayerTimesPage({ isAdmin, adminRole, onBack }) {
  const [times,    setTimes]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [showDuas, setShowDuas] = useState(false);

  useEffect(() => {
    fetch("https://api.aladhan.com/v1/timingsByCity?city=Idlib&country=Syria&method=3&school=1")
      .then(r => r.json()).then(d => { setTimes(d.data.timings); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const prayers = [
    { name: "الفجر",   key: "Fajr",    icon: "🌙" },
    { name: "الشروق",  key: "Sunrise", icon: "🌅" },
    { name: "الظهر",   key: "Dhuhr",   icon: "☀️" },
    { name: "العصر",   key: "Asr",     icon: "🌤️" },
    { name: "المغرب",  key: "Maghrib", icon: "🌇" },
    { name: "العشاء",  key: "Isha",    icon: "🌃" },
  ];

  if (showDuas) return <DuasPage isAdmin={isAdmin} adminRole={adminRole} onBack={() => setShowDuas(false)} />;

  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>
      <button onClick={onBack} style={{ background: "#f0f0f0", border: "none", borderRadius: "10px", padding: "8px 16px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", marginBottom: "16px", fontWeight: "700" }}>← رجوع</button>
      <div style={{ background: "linear-gradient(135deg,#1a5276,#2980b9)", borderRadius: "14px", padding: "16px", marginBottom: "16px", color: "#fff", textAlign: "center" }}>
        <div style={{ fontSize: "13px", opacity: .8 }}>{new Date().toLocaleDateString("ar-SY", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
        <div style={{ fontWeight: "800", fontSize: "18px", marginTop: "4px" }}>🕌 أوقات الصلاة - بنش</div>
      </div>
      {loading ? <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>جاري التحميل...</div> :
        !times ? <div style={{ textAlign: "center", padding: "40px", color: "#e74c3c" }}>تعذر تحميل الأوقات، تحقق من الاتصال</div> :
        prayers.map(p => (
          <div key={p.key} style={{ background: "#fff", borderRadius: "12px", padding: "14px 16px", marginBottom: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1.5px solid #f0f0f0", boxShadow: "0 2px 8px rgba(0,0,0,.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "24px" }}>{p.icon}</span>
              <span style={{ fontWeight: "700", fontSize: "15px", color: "#2c3e50" }}>{p.name}</span>
            </div>
            <span style={{ fontWeight: "800", fontSize: "18px", color: "#1a5276", direction: "ltr" }}>{times[p.key]}</span>
          </div>
        ))
      }
      {/* زر الأدعية */}
      <button onClick={() => setShowDuas(true)} style={{ width: "100%", marginTop: "16px", padding: "14px", background: "linear-gradient(135deg,#1a8a4a,#145a32)", color: "#fff", border: "none", borderRadius: "14px", fontFamily: "'Cairo', sans-serif", fontSize: "15px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: "0 4px 15px rgba(26,138,74,.35)" }}>
        <span style={{ fontSize: "22px" }}>🤲</span> أدعية
      </button>
    </div>
  );
}

// ==================== DUAS PAGE ====================
function DuasPage({ isAdmin, adminRole, onBack }) {
  const [duas,        setDuas]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState({ title: "", text: "", source: "" });
  const [editingItem, setEditingItem] = useState(null);
  const [editForm,    setEditForm]    = useState({});
  const [expanded,    setExpanded]    = useState(null);

  const isSuper = adminRole === "super";

  useEffect(() => { loadDuas(); }, []);

  async function loadDuas() {
    setLoading(true);
    const data = await supabase("duas", "GET", null, "?order=created_at.asc");
    setDuas(data || []); setLoading(false);
  }

  async function addDua() {
    if (!form.title.trim() || !form.text.trim()) return alert("العنوان والنص مطلوبان!");
    await supabase("duas", "POST", form);
    setForm({ title: "", text: "", source: "" }); setShowForm(false); loadDuas();
  }

  async function deleteDua(id) {
    if (!confirm("حذف الدعاء؟")) return;
    await supabase("duas", "DELETE", null, `?id=eq.${id}`); loadDuas();
  }

  async function saveEdit() {
    await supabase("duas", "PATCH", editForm, `?id=eq.${editingItem}`);
    setEditingItem(null); loadDuas();
  }

  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>
      <button onClick={onBack} style={{ background: "#f0f0f0", border: "none", borderRadius: "10px", padding: "8px 16px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", marginBottom: "16px", fontWeight: "700" }}>← رجوع</button>
      <div style={{ background: "linear-gradient(135deg,#1a8a4a,#145a32)", borderRadius: "14px", padding: "16px", marginBottom: "16px", color: "#fff", textAlign: "center" }}>
        <div style={{ fontSize: "32px", marginBottom: "4px" }}>🤲</div>
        <div style={{ fontWeight: "800", fontSize: "18px" }}>الأدعية</div>
        <div style={{ fontSize: "12px", opacity: .8, marginTop: "4px" }}>ادعُ الله وهو يستجيب</div>
      </div>
      {isAdmin && (
        <button onClick={() => setShowForm(!showForm)} style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg,#1a8a4a,#145a32)", color: "#fff", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontSize: "14px", fontWeight: "700", cursor: "pointer", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
          <Icon name="plus" size={18} /> {showForm ? "إلغاء" : "إضافة دعاء جديد"}
        </button>
      )}
      {showForm && (
        <div style={{ background: "#eafaf1", borderRadius: "12px", padding: "16px", marginBottom: "16px", border: "2px solid #a9dfbf" }}>
          <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="عنوان الدعاء *" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #a9dfbf", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          <textarea value={form.text} onChange={e => setForm(p => ({ ...p, text: e.target.value }))} placeholder="نص الدعاء *" rows={5} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #a9dfbf", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", resize: "vertical", boxSizing: "border-box", fontSize: "15px", lineHeight: "1.9" }} />
          <input value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} placeholder="المصدر (مثال: رواه البخاري)" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #a9dfbf", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box" }} />
          <button onClick={addDua} style={{ width: "100%", padding: "12px", background: "#1a8a4a", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>حفظ الدعاء</button>
        </div>
      )}
      {loading ? <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>جاري التحميل...</div> :
        duas.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#aaa" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>🤲</div>
            <div style={{ fontWeight: "700" }}>لا توجد أدعية بعد</div>
            {isAdmin && <div style={{ fontSize: "13px", marginTop: "6px" }}>ابدأ بإضافة أدعية</div>}
          </div>
        ) :
        duas.map(dua => (
          <div key={dua.id} style={{ background: "#fff", borderRadius: "14px", marginBottom: "12px", border: "1.5px solid #a9dfbf22", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
            <div style={{ background: "linear-gradient(135deg,#1a8a4a,#145a32)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
              onClick={() => setExpanded(expanded === dua.id ? null : dua.id)}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "18px" }}>🤲</span>
                <span style={{ color: "#fff", fontWeight: "700", fontSize: "14px" }}>{dua.title}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {isSuper && <>
                  <button onClick={e => { e.stopPropagation(); setEditingItem(dua.id); setEditForm({ title: dua.title, text: dua.text, source: dua.source }); }} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: "6px", padding: "4px 6px", cursor: "pointer" }}><Icon name="edit" size={13} color="#fff" /></button>
                  <button onClick={e => { e.stopPropagation(); deleteDua(dua.id); }} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: "6px", padding: "4px 6px", cursor: "pointer" }}><Icon name="trash" size={13} color="#fff" /></button>
                </>}
                <Icon name={expanded === dua.id ? "chevronUp" : "chevronDown"} size={16} color="#fff" />
              </div>
            </div>
            {expanded === dua.id && (
              <div style={{ padding: "16px" }}>
                <div style={{ fontSize: "17px", color: "#2c3e50", lineHeight: "2.2", fontFamily: "'Cairo', sans-serif", textAlign: "right", marginBottom: "12px", background: "#f8fdf8", padding: "16px", borderRadius: "10px", border: "1px solid #a9dfbf44" }}>{dua.text}</div>
                {dua.source && <div style={{ fontSize: "12px", color: "#888", textAlign: "left", marginBottom: "10px" }}>— {dua.source}</div>}
                <button onClick={() => { navigator.clipboard.writeText(dua.text); alert("تم نسخ الدعاء!"); }}
                  style={{ background: "#eafaf1", border: "1.5px solid #a9dfbf", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "700", color: "#1a8a4a" }}>📋 نسخ الدعاء</button>
              </div>
            )}
          </div>
        ))
      }
      {editingItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "20px", width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ fontWeight: "800", fontSize: "16px", marginBottom: "14px", color: "#1a8a4a" }}>✏️ تعديل الدعاء</div>
            <input value={editForm.title || ""} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} placeholder="العنوان" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
            <textarea value={editForm.text || ""} onChange={e => setEditForm(p => ({ ...p, text: e.target.value }))} placeholder="نص الدعاء" rows={5} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", resize: "vertical", boxSizing: "border-box", fontSize: "15px" }} />
            <input value={editForm.source || ""} onChange={e => setEditForm(p => ({ ...p, source: e.target.value }))} placeholder="المصدر" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "12px", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={saveEdit} style={{ flex: 1, padding: "12px", background: "#1a8a4a", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>حفظ</button>
              <button onClick={() => setEditingItem(null)} style={{ flex: 1, padding: "12px", background: "#f0f0f0", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== WATER SCHEDULE PAGE ====================
function WaterSchedulePage({ isAdmin, adminRole, editorPerms, onBack }) {
  const [schedule,    setSchedule]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState({ neighborhood: "", days: "", time: "", notes: "" });
  const [editingItem, setEditingItem] = useState(null);
  const [editForm,    setEditForm]    = useState({});

  const canEdit = canDo("water", isAdmin, adminRole, editorPerms);
  const isSuper = adminRole === "super";

  useEffect(() => { loadSchedule(); }, []);

  async function loadSchedule() {
    setLoading(true);
    const data = await supabase("water_schedule", "GET", null, "?order=created_at.asc");
    setSchedule(data || []); setLoading(false);
  }

  async function addEntry() {
    if (!form.neighborhood.trim()) return alert("اسم الحي مطلوب!");
    await supabase("water_schedule", "POST", form);
    setForm({ neighborhood: "", days: "", time: "", notes: "" }); setShowForm(false); loadSchedule();
  }

  async function deleteEntry(id) {
    if (!confirm("حذف؟")) return;
    await supabase("water_schedule", "DELETE", null, `?id=eq.${id}`); loadSchedule();
  }

  async function saveEdit() {
    await supabase("water_schedule", "PATCH", editForm, `?id=eq.${editingItem}`);
    setEditingItem(null); loadSchedule();
  }

  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>
      <button onClick={onBack} style={{ background: "#f0f0f0", border: "none", borderRadius: "10px", padding: "8px 16px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", marginBottom: "16px", fontWeight: "700" }}>← رجوع</button>
      <div style={{ background: "linear-gradient(135deg,#1a5276,#2980b9)", borderRadius: "14px", padding: "16px", marginBottom: "16px", color: "#fff", textAlign: "center" }}>
        <div style={{ fontWeight: "800", fontSize: "18px" }}>💧 جدول توزيع المياه</div>
      </div>
      {canEdit && <button onClick={() => setShowForm(!showForm)} style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg,#2980b9,#1a5276)", color: "#fff", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontSize: "14px", fontWeight: "700", cursor: "pointer", marginBottom: "16px" }}>+ إضافة موعد</button>}
      {showForm && (
        <div style={{ background: "#ebf5fb", borderRadius: "12px", padding: "16px", marginBottom: "16px", border: "2px solid #aed6f1" }}>
          {[["neighborhood","اسم الحي *"],["days","أيام الوصول"],["time","وقت الوصول"],["notes","ملاحظات"]].map(([k,ph]) => (
            <input key={k} value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} placeholder={ph}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #aed6f1", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          ))}
          <button onClick={addEntry} style={{ width: "100%", padding: "12px", background: "#2980b9", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>حفظ</button>
        </div>
      )}
      {loading ? <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>جاري التحميل...</div> :
        schedule.length === 0 ? <div style={{ textAlign: "center", padding: "40px", color: "#aaa" }}>لا يوجد جدول بعد</div> :
        schedule.map(s => (
          <div key={s.id} style={{ background: "#fff", borderRadius: "12px", padding: "14px 16px", marginBottom: "10px", border: "1.5px solid #aed6f1", boxShadow: "0 2px 8px rgba(0,0,0,.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontWeight: "800", fontSize: "15px", color: "#1a5276" }}>📍 {s.neighborhood}</div>
              <div style={{ display: "flex", gap: "6px" }}>
                {isSuper && <button onClick={() => { setEditingItem(s.id); setEditForm({ neighborhood: s.neighborhood, days: s.days, time: s.time, notes: s.notes }); }} style={{ background: "#ebf5fb", border: "none", borderRadius: "8px", padding: "5px 7px", cursor: "pointer" }}><Icon name="edit" size={14} color="#2980b9" /></button>}
                {canEdit  && <button onClick={() => deleteEntry(s.id)} style={{ background: "#fdedec", border: "none", borderRadius: "8px", padding: "5px 7px", cursor: "pointer" }}><Icon name="trash" size={14} color="#c0392b" /></button>}
              </div>
            </div>
            {s.days  && <div style={{ fontSize: "13px", color: "#555", marginTop: "6px" }}>📅 {s.days}</div>}
            {s.time  && <div style={{ fontSize: "13px", color: "#555", marginTop: "4px" }}>🕐 {s.time}</div>}
            {s.notes && <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>📝 {s.notes}</div>}
          </div>
        ))
      }
      {editingItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "20px", width: "100%" }}>
            <div style={{ fontWeight: "800", fontSize: "16px", marginBottom: "14px", color: "#2980b9" }}>✏️ تعديل جدول المياه</div>
            {[["neighborhood","الحي"],["days","أيام الوصول"],["time","وقت الوصول"],["notes","ملاحظات"]].map(([k,ph]) => (
              <input key={k} value={editForm[k] || ""} onChange={e => setEditForm(p => ({ ...p, [k]: e.target.value }))} placeholder={ph}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
            ))}
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={saveEdit} style={{ flex: 1, padding: "12px", background: "#2980b9", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>حفظ</button>
              <button onClick={() => setEditingItem(null)} style={{ flex: 1, padding: "12px", background: "#f0f0f0", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== POLL PAGE ====================
function PollPage({ isAdmin, adminRole, onBack }) {
  const [poll,     setPoll]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [voted,    setVoted]    = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ question: "", option1: "", option2: "", option3: "", option4: "" });

  useEffect(() => { loadPoll(); }, []);

  async function loadPoll() {
    setLoading(true);
    const data = await supabase("polls", "GET", null, "?order=created_at.desc&limit=1");
    if (data && data.length > 0) {
      setPoll(data[0]);
      if (localStorage.getItem("voted_poll_" + data[0].id)) setVoted(true);
    }
    setLoading(false);
  }

  async function createPoll() {
    if (!form.question.trim() || !form.option1.trim() || !form.option2.trim()) return alert("السؤال وخيارين على الأقل مطلوبان!");
    const options = [form.option1, form.option2, form.option3, form.option4].filter(o => o.trim());
    await supabase("polls", "POST", { question: form.question, options: JSON.stringify(options), votes: JSON.stringify(options.map(() => 0)) });
    setForm({ question: "", option1: "", option2: "", option3: "", option4: "" }); setShowForm(false); loadPoll();
  }

  async function vote(index) {
    if (voted || !poll) return;
    const votes = JSON.parse(poll.votes || "[]");
    votes[index] = (votes[index] || 0) + 1;
    await supabase("polls", "PATCH", { votes: JSON.stringify(votes) }, `?id=eq.${poll.id}`);
    localStorage.setItem("voted_poll_" + poll.id, "1"); setVoted(true); loadPoll();
  }

  async function deletePoll() {
    if (!confirm("حذف الاستطلاع؟")) return;
    await supabase("polls", "DELETE", null, `?id=eq.${poll.id}`); setPoll(null);
  }

  const options = poll ? JSON.parse(poll.options || "[]") : [];
  const votes   = poll ? JSON.parse(poll.votes   || "[]") : [];
  const total   = votes.reduce((a, b) => a + b, 0);

  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>
      <button onClick={onBack} style={{ background: "#f0f0f0", border: "none", borderRadius: "10px", padding: "8px 16px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", marginBottom: "16px", fontWeight: "700" }}>← رجوع</button>
      <div style={{ background: "linear-gradient(135deg,#8e44ad,#6c3483)", borderRadius: "14px", padding: "16px", marginBottom: "16px", color: "#fff", textAlign: "center" }}>
        <div style={{ fontWeight: "800", fontSize: "18px" }}>📊 استطلاع الرأي</div>
      </div>
      {isAdmin && <button onClick={() => setShowForm(!showForm)} style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg,#8e44ad,#6c3483)", color: "#fff", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontSize: "14px", fontWeight: "700", cursor: "pointer", marginBottom: "16px" }}>+ إنشاء استطلاع جديد</button>}
      {showForm && (
        <div style={{ background: "#f5eef8", borderRadius: "12px", padding: "16px", marginBottom: "16px", border: "2px solid #d2b4de" }}>
          <input value={form.question} onChange={e => setForm(p => ({ ...p, question: e.target.value }))} placeholder="السؤال *" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #d2b4de", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          {["option1","option2","option3","option4"].map((k,i) => (
            <input key={k} value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} placeholder={`الخيار ${i+1} ${i < 2 ? "*" : "(اختياري)"}`}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #d2b4de", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          ))}
          <button onClick={createPoll} style={{ width: "100%", padding: "12px", background: "#8e44ad", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>نشر الاستطلاع</button>
        </div>
      )}
      {loading ? <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>جاري التحميل...</div> :
        !poll ? <div style={{ textAlign: "center", padding: "40px", color: "#aaa" }}>لا يوجد استطلاع حالياً</div> : (
          <div style={{ background: "#fff", borderRadius: "14px", padding: "16px", border: "1.5px solid #d2b4de" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div style={{ fontWeight: "800", fontSize: "15px", color: "#2c3e50", flex: 1 }}>{poll.question}</div>
              {adminRole === "super" && <button onClick={deletePoll} style={{ background: "#fdedec", border: "none", borderRadius: "8px", padding: "5px 7px", cursor: "pointer" }}><Icon name="trash" size={14} color="#c0392b" /></button>}
            </div>
            {options.map((opt, i) => {
              const pct = total > 0 ? Math.round((votes[i] || 0) / total * 100) : 0;
              return (
                <div key={i} style={{ marginBottom: "10px" }}>
                  <button onClick={() => vote(i)} disabled={voted} style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", border: "2px solid #8e44ad", background: voted ? "#f5eef8" : "#fff", cursor: voted ? "default" : "pointer", fontFamily: "'Cairo', sans-serif", fontSize: "14px", fontWeight: "600", color: "#2c3e50", textAlign: "right", position: "relative", overflow: "hidden" }}>
                    {voted && <div style={{ position: "absolute", right: 0, top: 0, height: "100%", width: `${pct}%`, background: "#d2b4de", opacity: .4, transition: "width .5s" }} />}
                    <span style={{ position: "relative" }}>{opt}</span>
                    {voted && <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontWeight: "800", color: "#8e44ad" }}>{pct}%</span>}
                  </button>
                </div>
              );
            })}
            <div style={{ textAlign: "center", fontSize: "12px", color: "#888", marginTop: "8px" }}>{voted ? `إجمالي الأصوات: ${total}` : "اضغط على خيارك للتصويت"}</div>
          </div>
        )
      }
    </div>
  );
}

// ==================== EVENTS PAGE ====================
function EventsPage({ isAdmin, adminRole, editorPerms, onBack }) {
  const [events,      setEvents]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState({ title: "", date: "", time: "", location: "", description: "" });
  const [editingItem, setEditingItem] = useState(null);
  const [editForm,    setEditForm]    = useState({});

  const canEdit = canDo("events", isAdmin, adminRole, editorPerms);
  const isSuper = adminRole === "super";

  useEffect(() => { loadEvents(); }, []);

  async function loadEvents() {
    setLoading(true);
    const data = await supabase("events", "GET", null, "?order=date.asc");
    setEvents(data || []); setLoading(false);
  }

  async function addEvent() {
    if (!form.title.trim() || !form.date) return alert("العنوان والتاريخ مطلوبان!");
    await supabase("events", "POST", form);
    setForm({ title: "", date: "", time: "", location: "", description: "" }); setShowForm(false); loadEvents();
  }

  async function deleteEvent(id) {
    if (!confirm("حذف الفعالية؟")) return;
    await supabase("events", "DELETE", null, `?id=eq.${id}`); loadEvents();
  }

  async function saveEdit() {
    await supabase("events", "PATCH", editForm, `?id=eq.${editingItem}`);
    setEditingItem(null); loadEvents();
  }

  const fmt = d => new Date(d).toLocaleDateString("ar-SY", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>
      <button onClick={onBack} style={{ background: "#f0f0f0", border: "none", borderRadius: "10px", padding: "8px 16px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", marginBottom: "16px", fontWeight: "700" }}>← رجوع</button>
      <div style={{ background: "linear-gradient(135deg,#d35400,#a04000)", borderRadius: "14px", padding: "16px", marginBottom: "16px", color: "#fff", textAlign: "center" }}>
        <div style={{ fontWeight: "800", fontSize: "18px" }}>🗓️ الفعاليات والمناسبات</div>
      </div>
      {canEdit && <button onClick={() => setShowForm(!showForm)} style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg,#d35400,#a04000)", color: "#fff", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontSize: "14px", fontWeight: "700", cursor: "pointer", marginBottom: "16px" }}>+ إضافة فعالية</button>}
      {showForm && (
        <div style={{ background: "#fdf2e9", borderRadius: "12px", padding: "16px", marginBottom: "16px", border: "2px solid #f0b27a" }}>
          <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="عنوان الفعالية *" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #f0b27a", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #f0b27a", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          <input value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} placeholder="الوقت" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #f0b27a", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="المكان" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #f0b27a", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="وصف الفعالية" rows={3} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #f0b27a", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", resize: "none", boxSizing: "border-box" }} />
          <button onClick={addEvent} style={{ width: "100%", padding: "12px", background: "#d35400", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>حفظ</button>
        </div>
      )}
      {loading ? <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>جاري التحميل...</div> :
        events.length === 0 ? <div style={{ textAlign: "center", padding: "40px", color: "#aaa" }}>لا توجد فعاليات قادمة</div> :
        events.map(ev => (
          <div key={ev.id} style={{ background: "#fff", borderRadius: "14px", marginBottom: "12px", overflow: "hidden", border: "1.5px solid #f0b27a" }}>
            <div style={{ background: "linear-gradient(135deg,#d35400,#a04000)", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: "#fff", fontWeight: "800", fontSize: "15px" }}>{ev.title}</div>
              <div style={{ display: "flex", gap: "6px" }}>
                {isSuper && <button onClick={() => { setEditingItem(ev.id); setEditForm({ title: ev.title, date: ev.date, time: ev.time, location: ev.location, description: ev.description }); }} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: "8px", padding: "5px 7px", cursor: "pointer" }}><Icon name="edit" size={14} color="#fff" /></button>}
                {canEdit  && <button onClick={() => deleteEvent(ev.id)} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: "8px", padding: "5px 7px", cursor: "pointer" }}><Icon name="trash" size={14} color="#fff" /></button>}
              </div>
            </div>
            <div style={{ padding: "12px 16px" }}>
              <div style={{ fontSize: "13px", color: "#555", marginBottom: "4px" }}>📅 {fmt(ev.date)}</div>
              {ev.time        && <div style={{ fontSize: "13px", color: "#555", marginBottom: "4px" }}>🕐 {ev.time}</div>}
              {ev.location    && <div style={{ fontSize: "13px", color: "#555", marginBottom: "4px" }}>📍 {ev.location}</div>}
              {ev.description && <div style={{ fontSize: "13px", color: "#777", marginTop: "8px", lineHeight: "1.6" }}>{ev.description}</div>}
            </div>
          </div>
        ))
      }
      {editingItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "20px", width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ fontWeight: "800", fontSize: "16px", marginBottom: "14px", color: "#d35400" }}>✏️ تعديل الفعالية</div>
            <input value={editForm.title || ""} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} placeholder="العنوان" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
            <input type="date" value={editForm.date || ""} onChange={e => setEditForm(p => ({ ...p, date: e.target.value }))} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
            <input value={editForm.time || ""} onChange={e => setEditForm(p => ({ ...p, time: e.target.value }))} placeholder="الوقت" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
            <input value={editForm.location || ""} onChange={e => setEditForm(p => ({ ...p, location: e.target.value }))} placeholder="المكان" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
            <textarea value={editForm.description || ""} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} placeholder="الوصف" rows={3} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontFamily: "'Cairo', sans-serif", marginBottom: "12px", resize: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={saveEdit} style={{ flex: 1, padding: "12px", background: "#d35400", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>حفظ</button>
              <button onClick={() => setEditingItem(null)} style={{ flex: 1, padding: "12px", background: "#f0f0f0", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== WEATHER PAGE ====================
function WeatherPage({ onBack }) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    fetch("https://wttr.in/Binnish,Syria?format=j1")
      .then(r => r.json())
      .then(d => {
        setWeather(d);
        setLoading(false);
        generateAiSummary(d.current_condition?.[0]);
      })
      .catch(() => setLoading(false));
  }, []);

  async function generateAiSummary(current) {
    if (!current) return;
    setAiLoading(true);

    const desc = current.weatherDesc?.[0]?.value || "";
    const today = new Date().toLocaleDateString("ar-SY", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",

  },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 300,
          messages: [{
            role: "user",
            content: `أنت مذيع نشرة الأحوال الجوية لمدينة بنش السورية. اكتب ملخصاً يومياً للطقس بأسلوب ودي ومحلي بالعربية الفصحى البسيطة. لا تزيد عن 4 جمل. ابدأ بتحية مناسبة لليوم.

البيانات:
- التاريخ: ${today}
- درجة الحرارة: ${current.temp_C}°م
- الإحساس: ${current.FeelsLikeC}°م
- الرطوبة: ${current.humidity}%
- سرعة الرياح: ${current.windspeedKmph} كم/ساعة
- الرؤية: ${current.visibility} كم
- الحالة: ${desc}`
          }]
        })
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || "";
      setAiSummary(text);
    } catch (e) {
      setAiSummary("تعذر تحميل الملخص الذكي.");
    }

    setAiLoading(false);
  }

  const current = weather?.current_condition?.[0];
  const desc = current?.weatherDesc?.[0]?.value || "";

  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>
      <button onClick={onBack} style={{ background: "#f0f0f0", border: "none", borderRadius: "10px", padding: "8px 16px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", marginBottom: "16px", fontWeight: "700" }}>← رجوع</button>
      <div style={{ background: "linear-gradient(135deg,#1a5276,#2980b9)", borderRadius: "14px", padding: "16px", marginBottom: "16px", color: "#fff", textAlign: "center" }}>
        <div style={{ fontWeight: "800", fontSize: "18px" }}>🌤️ طقس بنش</div>
      </div>

      {loading
        ? <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>جاري التحميل...</div>
        : !current
          ? <div style={{ textAlign: "center", padding: "40px", color: "#e74c3c" }}>تعذر تحميل بيانات الطقس</div>
          : (
            <>
              {/* بطاقة الأرقام */}
              <div style={{ background: "#fff", borderRadius: "16px", padding: "24px", border: "1.5px solid #aed6f1", textAlign: "center", marginBottom: "16px" }}>
                <div style={{ fontSize: "72px", marginBottom: "8px" }}>
                  {current.weatherCode <= 113 ? "☀️" : current.weatherCode <= 176 ? "⛅" : current.weatherCode <= 248 ? "🌫️" : current.weatherCode <= 314 ? "🌧️" : "⛈️"}
                </div>
                <div style={{ fontSize: "48px", fontWeight: "900", color: "#1a5276" }}>{current.temp_C}°</div>
                <div style={{ fontSize: "16px", color: "#555", marginBottom: "16px" }}>{desc}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {[
                    ["الرطوبة",  current.humidity + "%"],
                    ["الرياح",   current.windspeedKmph + " km/h"],
                    ["الإحساس", current.FeelsLikeC + "°"],
                    ["الرؤية",   current.visibility + " km"]
                  ].map(([label, val]) => (
                    <div key={label} style={{ background: "#ebf5fb", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "11px", color: "#888" }}>{label}</div>
                      <div style={{ fontWeight: "800", color: "#1a5276", fontSize: "16px" }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ملخص الذكاء الاصطناعي */}
              <div style={{ background: "linear-gradient(135deg,#1a8a4a,#145a32)", borderRadius: "16px", padding: "18px", color: "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <span style={{ fontSize: "22px" }}>🤖</span>
                  <span style={{ fontWeight: "800", fontSize: "15px" }}>ملخص الطقس بالذكاء الاصطناعي</span>
                </div>
                <div style={{ fontSize: "14px", lineHeight: "1.9", opacity: .95 }}>
  {current.weatherCode <= 113 
    ? "☀️ الجو صافٍ ومشمس، يوم مناسب للخروج!"
    : current.weatherCode <= 176 
    ? "⛅ غيوم جزئية، الجو لطيف."
    : current.weatherCode <= 248 
    ? "🌫️ ضباب أو غيوم كثيفة، انتبه عند القيادة."
    : current.weatherCode <= 314 
    ? `🌧️ أمطار متوقعة، درجة الحرارة ${current.temp_C}° والرطوبة ${current.humidity}%.`
    : `⛈️ عواصف رعدية، يُنصح بالبقاء في المنزل.`
  }
</div>
              </div>
            </>
          )
      }
    </div>
  );
}

// ==================== GALLERY PAGE ====================
function GalleryPage({ isAdmin, adminRole, editorPerms, onBack }) {
  const [photos,   setPhotos]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ title: "", image_url: "" });
  const [selected, setSelected] = useState(null);

  const canEdit = canDo("gallery", isAdmin, adminRole, editorPerms);

  useEffect(() => { loadPhotos(); }, []);
  async function loadPhotos() { setLoading(true); const data = await supabase("gallery", "GET", null, "?order=created_at.desc"); setPhotos(data || []); setLoading(false); }
  async function addPhoto() { if (!form.image_url.trim()) return alert("رابط الصورة مطلوب!"); await supabase("gallery", "POST", form); setForm({ title: "", image_url: "" }); setShowForm(false); loadPhotos(); }
  async function deletePhoto(id) { if (!confirm("حذف الصورة؟")) return; await supabase("gallery", "DELETE", null, `?id=eq.${id}`); loadPhotos(); }

  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>
      <button onClick={onBack} style={{ background: "#f0f0f0", border: "none", borderRadius: "10px", padding: "8px 16px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", marginBottom: "16px", fontWeight: "700" }}>← رجوع</button>
      <div style={{ background: "linear-gradient(135deg,#c0392b,#922b21)", borderRadius: "14px", padding: "16px", marginBottom: "16px", color: "#fff", textAlign: "center" }}>
        <div style={{ fontWeight: "800", fontSize: "18px" }}>📸 معرض صور بنش</div>
      </div>
      {canEdit && <button onClick={() => setShowForm(!showForm)} style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg,#c0392b,#922b21)", color: "#fff", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontSize: "14px", fontWeight: "700", cursor: "pointer", marginBottom: "16px" }}>+ إضافة صورة</button>}
      {showForm && (
        <div style={{ background: "#fdedec", borderRadius: "12px", padding: "16px", marginBottom: "16px", border: "2px solid #f1948a" }}>
          <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="عنوان الصورة" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #f1948a", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          <input value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} placeholder="رابط الصورة *" style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #f1948a", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box" }} />
          <button onClick={addPhoto} style={{ width: "100%", padding: "12px", background: "#c0392b", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>حفظ</button>
        </div>
      )}
      {loading ? <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>جاري التحميل...</div> :
        photos.length === 0 ? <div style={{ textAlign: "center", padding: "40px", color: "#aaa" }}>لا توجد صور بعد</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {photos.map(p => (
              <div key={p.id} style={{ borderRadius: "12px", overflow: "hidden", position: "relative", cursor: "pointer" }} onClick={() => setSelected(p)}>
                <img src={p.image_url} alt={p.title} style={{ width: "100%", height: "130px", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />
                {p.title && <div style={{ position: "absolute", bottom: 0, right: 0, left: 0, background: "linear-gradient(transparent,rgba(0,0,0,.7))", padding: "8px", color: "#fff", fontSize: "11px", fontWeight: "700" }}>{p.title}</div>}
                {canEdit && <button onClick={e => { e.stopPropagation(); deletePhoto(p.id); }} style={{ position: "absolute", top: "6px", left: "6px", background: "rgba(231,76,60,.9)", border: "none", borderRadius: "6px", padding: "4px 6px", cursor: "pointer" }}><Icon name="trash" size={13} color="#fff" /></button>}
              </div>
            ))}
          </div>
        )
      }
      {selected && (
        <div onClick={() => setSelected(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "400px" }}>
            <img src={selected.image_url} alt={selected.title} style={{ width: "100%", borderRadius: "14px", maxHeight: "70vh", objectFit: "contain" }} />
            {selected.title && <div style={{ color: "#fff", textAlign: "center", marginTop: "12px", fontWeight: "700", fontSize: "15px" }}>{selected.title}</div>}
            <button onClick={() => setSelected(null)} style={{ width: "100%", marginTop: "12px", padding: "12px", background: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>إغلاق</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== VISITOR STATS ====================
function VisitorStats({ darkMode }) {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const cardBg    = darkMode ? "#16213e" : "#fff";
  const borderColor = darkMode ? "#2a2a4a" : "#f0f0f0";
  const textColor = darkMode ? "#e0e0e0" : "#2c3e50";
  useEffect(() => { loadStats(); }, []);
  async function loadStats() {
    setLoading(true);
    const data = await supabase("visitor_logs", "GET", null, "");
    if (!data) { setLoading(false); return; }
    const now   = new Date();
    const today = data.filter(v => new Date(v.visited_at).toDateString() === now.toDateString()).length;
    const month = data.filter(v => { const d = new Date(v.visited_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
    const year  = data.filter(v => new Date(v.visited_at).getFullYear() === now.getFullYear()).length;
    setStats({ today, month, year, total: data.length }); setLoading(false);
  }
  return (
    <div style={{ background: cardBg, borderRadius: "14px", padding: "16px", marginBottom: "10px", border: `1.5px solid ${borderColor}` }}>
      <div style={{ fontWeight: "800", fontSize: "14px", color: "#2980b9", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>👁️ إحصائيات الزوار</span>
        <button onClick={loadStats} style={{ background: "none", border: "1.5px solid #2980b9", borderRadius: "8px", padding: "4px 10px", color: "#2980b9", fontFamily: "'Cairo', sans-serif", fontSize: "12px", cursor: "pointer" }}>تحديث</button>
      </div>
      {loading ? <div style={{ textAlign: "center", padding: "20px", color: "#aaa", fontSize: "13px", fontFamily: "'Cairo', sans-serif" }}>جاري التحميل...</div> :
        !stats ? <div style={{ textAlign: "center", padding: "20px", color: "#e74c3c", fontSize: "13px" }}>تعذر تحميل البيانات</div> :
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          {[["📅","اليوم",stats.today,"#27ae60"],["🗓️","هذا الشهر",stats.month,"#2980b9"],["📆","هذه السنة",stats.year,"#8e44ad"],["👥","إجمالي الكل",stats.total,"#c0392b"]].map(([icon,label,val,color]) => (
            <div key={label} style={{ background: `${color}12`, border: `1.5px solid ${color}33`, borderRadius: "12px", padding: "14px", textAlign: "center" }}>
              <div style={{ fontSize: "22px", marginBottom: "4px" }}>{icon}</div>
              <div style={{ fontWeight: "900", fontSize: "22px", color }}>{val}</div>
              <div style={{ fontSize: "11px", color: textColor, fontFamily: "'Cairo', sans-serif", marginTop: "2px" }}>{label}</div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}

// ==================== NOTIF BELL ====================
function NotifBell({ isAdmin, onNavigate }) {
  const [notifs, setNotifs] = useState([]);
  const [open,   setOpen]   = useState(false);
  const [seen,   setSeen]   = useState(() => { try { return JSON.parse(localStorage.getItem("notif_seen") || "[]"); } catch { return []; } });

  useEffect(() => { loadNotifs(); }, []);

  async function loadNotifs() {
    const data = await supabase("notifications", "GET", null, "?order=created_at.desc&limit=20");
    setNotifs(data || []);
  }

  const unseen = notifs.filter(n => !seen.includes(n.id)).length;

  function markAllSeen() {
    const allIds = notifs.map(n => n.id);
    setSeen(allIds); localStorage.setItem("notif_seen", JSON.stringify(allIds));
  }

  const SECTION_LABELS = { contacts: "جهات الاتصال", news: "الأخبار", obituary: "الوفيات", lost: "المفقودات", ads: "الإعلانات", links: "روابط مهمة", transport: "التوصيل", electricity: "الكهرباء" };
  const SECTION_NAV    = { contacts: "contacts", news: "news", obituary: "obituary", lost: "lost", ads: "ads", links: "links", transport: "transport", electricity: "home" };

  function handleNotifClick(n) {
    setOpen(false);
    const target = SECTION_NAV[n.section];
    if (target && n.section !== "general") onNavigate(target);
  }

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => { setOpen(!open); if (!open) { markAllSeen(); loadNotifs(); } }} style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: "10px", padding: "8px", cursor: "pointer", position: "relative" }}>
        <Icon name="bell" size={20} color="#fff" />
        {unseen > 0 && <span style={{ position: "absolute", top: "2px", left: "2px", background: "#e74c3c", color: "#fff", borderRadius: "50%", width: "17px", height: "17px", fontSize: "10px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center" }}>{unseen}</span>}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 999 }} />
          <div style={{ position: "absolute", top: "44px", left: "-10px", width: "290px", background: "#fff", borderRadius: "14px", boxShadow: "0 8px 30px rgba(0,0,0,.15)", zIndex: 1000, overflow: "hidden", border: "1px solid #eee" }}>
            <div style={{ padding: "12px 16px", background: "linear-gradient(135deg,#1a5276,#2980b9)", color: "#fff", fontWeight: "800", fontSize: "14px", fontFamily: "'Cairo', sans-serif" }}>🔔 الإشعارات</div>
            <div style={{ maxHeight: "350px", overflowY: "auto" }}>
              {notifs.length === 0 ? <div style={{ padding: "30px", textAlign: "center", color: "#aaa", fontSize: "13px", fontFamily: "'Cairo', sans-serif" }}>لا توجد إشعارات</div> :
                notifs.map(n => (
                  <div key={n.id} onClick={() => handleNotifClick(n)} style={{ padding: "12px 16px", borderBottom: "1px solid #f5f5f5", background: seen.includes(n.id) ? "#fff" : "#ebf5fb", fontFamily: "'Cairo', sans-serif", cursor: SECTION_NAV[n.section] ? "pointer" : "default" }}>
                    <div style={{ fontWeight: "700", fontSize: "13px", color: "#2c3e50", marginBottom: "3px" }}>{n.title}</div>
                    {n.body && <div style={{ fontSize: "12px", color: "#666", lineHeight: "1.5", marginBottom: "4px" }}>{n.body}</div>}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "11px", color: "#aaa" }}>{relativeTime(n.created_at)}</span>
                      {n.section && SECTION_LABELS[n.section] && <span style={{ background: "#ebf5fb", color: "#2980b9", borderRadius: "20px", padding: "1px 8px", fontSize: "10px" }}>{SECTION_LABELS[n.section]}</span>}
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ==================== ADMIN USERS MANAGER ====================
function AdminUsersManager({ darkMode }) {
  const [admins,   setAdmins]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ username: "", password: "", role: "editor" });
  const cardBg    = darkMode ? "#16213e" : "#fff";
  const borderColor = darkMode ? "#2a2a4a" : "#f0f0f0";
  const textColor = darkMode ? "#e0e0e0" : "#2c3e50";
  useEffect(() => { loadAdmins(); }, []);
  async function loadAdmins() { setLoading(true); const data = await supabase("admins", "GET", null, "?order=id.asc"); setAdmins(data || []); setLoading(false); }
  async function addAdmin() {
    if (!form.username.trim() || !form.password.trim()) return alert("الاسم وكلمة المرور مطلوبان!");
    const hp  = await hashPassword(form.password);
    const res = await supabase("admins", "POST", { ...form, password: hp });
    if (res) { setForm({ username: "", password: "", role: "editor" }); setShowForm(false); loadAdmins(); }
    else alert("حدث خطأ! ربما اسم المستخدم مكرر.");
  }
  async function deleteAdmin(id) { if (!confirm("حذف هذا المستخدم؟")) return; await supabase("admins", "DELETE", null, `?id=eq.${id}`); loadAdmins(); }
  async function updatePassword(id, username) {
    const newPass = prompt(`كلمة المرور الجديدة لـ ${username}:`);
    if (!newPass) return;
    await supabase("admins", "PATCH", { password: await hashPassword(newPass) }, `?id=eq.${id}`);
    alert("✅ تم تغيير كلمة المرور!"); loadAdmins();
  }
  return (
    <div style={{ background: cardBg, borderRadius: "14px", padding: "16px", marginBottom: "10px", border: `1.5px solid ${borderColor}` }}>
      <div style={{ fontWeight: "800", fontSize: "14px", color: "#c0392b", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>👥 إدارة المستخدمين</span>
        <button onClick={() => setShowForm(!showForm)} style={{ background: "#c0392b", color: "#fff", border: "none", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", gap: "4px" }}><Icon name="plus" size={14} color="#fff" /> إضافة</button>
      </div>
      {showForm && ( // ====== تكملة من AdminUsersManager ======
// ضع هذا الكود بعد السطر الذي يبدأ بـ:
// {showForm && (

        <div style={{ background: "#fdedec", borderRadius: "12px", padding: "14px", marginBottom: "12px", border: "1.5px solid #f1948a" }}>
          <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} placeholder="اسم المستخدم"
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #f1948a", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          <input value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="كلمة المرور"
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #f1948a", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
          <div style={{ marginBottom: "10px" }}>
            <div style={{ fontSize: "13px", color: "#666", marginBottom: "6px", fontFamily: "'Cairo', sans-serif" }}>الصلاحية:</div>
            <div style={{ display: "flex", gap: "8px" }}>
              {[{ v: "editor", l: "محرر" }, { v: "super", l: "مدير رئيسي" }].map(r => (
                <button key={r.v} onClick={() => setForm(p => ({ ...p, role: r.v }))} style={{
                  flex: 1, padding: "8px", borderRadius: "8px", border: "none", cursor: "pointer",
                  background: form.role === r.v ? "#c0392b" : "#f0f0f0",
                  color: form.role === r.v ? "#fff" : "#555",
                  fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "13px",
                }}>{r.l}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={addAdmin} style={{ flex: 1, padding: "10px", background: "#c0392b", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>حفظ</button>
            <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "10px", background: "#f0f0f0", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
          </div>
        </div>
      )}
      {loading ? (
        <div style={{ textAlign: "center", padding: "20px", color: "#aaa", fontSize: "13px", fontFamily: "'Cairo', sans-serif" }}>جاري التحميل...</div>
      ) : (
        admins.map(admin => (
          <div key={admin.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px", borderRadius: "10px", marginBottom: "8px",
            background: admin.role === "super" ? "#fdedec" : "#f8f9fa",
            border: `1.5px solid ${admin.role === "super" ? "#f1948a" : "#e8e8e8"}`,
          }}>
            <div>
              <div style={{ fontWeight: "700", fontSize: "13px", color: textColor, fontFamily: "'Cairo', sans-serif" }}>
                {admin.role === "super" ? "👑" : "✏️"} {admin.username}
              </div>
              <div style={{ fontSize: "11px", color: "#888", marginTop: "2px", fontFamily: "'Cairo', sans-serif" }}>
                {admin.role === "super" ? "مدير رئيسي" : "محرر"}
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button onClick={() => updatePassword(admin.id, admin.username)} style={{
                background: "#ebf5fb", border: "1.5px solid #aed6f1", borderRadius: "8px",
                padding: "6px 10px", cursor: "pointer", fontFamily: "'Cairo', sans-serif",
                fontSize: "11px", fontWeight: "700", color: "#2980b9",
              }}>🔑 تغيير</button>
              {admin.role !== "super" && (
                <button onClick={() => deleteAdmin(admin.id)} style={{
                  background: "#fdedec", border: "1.5px solid #f1948a", borderRadius: "8px",
                  padding: "6px 8px", cursor: "pointer",
                }}>
                  <Icon name="trash" size={13} color="#c0392b" />
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ==================== EDITOR PERMISSIONS MANAGER ====================
function EditorPermissionsManager({ editorPerms, setEditorPerms, darkMode }) {
  const cardBg = darkMode ? "#16213e" : "#fff";
  const borderColor = darkMode ? "#2a2a4a" : "#f0f0f0";
  const textColor = darkMode ? "#e0e0e0" : "#2c3e50";

  const permItems = [
    { key: "contacts",    label: "إضافة جهات الاتصال",       icon: "📞" },
    { key: "news",        label: "إضافة الأخبار",             icon: "📰" },
    { key: "obituary",   label: "إضافة الوفيات",             icon: "🕊️" },
    { key: "ads",         label: "إدارة الإعلانات",           icon: "📢" },
    { key: "lost",        label: "إدارة المفقودات",           icon: "🔍" },
    { key: "links",       label: "إضافة الروابط",             icon: "🔗" },
    { key: "transport",   label: "إضافة السائقين",            icon: "🚗" },
    { key: "mosques",     label: "إضافة المساجد",             icon: "🕌" },
    { key: "electricity", label: "تغيير حالة الكهرباء",       icon: "⚡" },
    { key: "water",       label: "جدول توزيع المياه",         icon: "💧" },
    { key: "events",      label: "إضافة الفعاليات",           icon: "🗓️" },
    { key: "gallery",     label: "معرض الصور",                icon: "📸" },
    { key: "poll",        label: "إنشاء استطلاع",             icon: "📊" },
    { key: "ticker",      label: "تعديل الشريط الإخباري",     icon: "📡" },
    { key: "realestate", label: "إدارة العقارات", icon: "🏠" },
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
    <div style={{ background: cardBg, borderRadius: "14px", padding: "16px", marginBottom: "10px", border: `1.5px solid ${borderColor}` }}>
      <div style={{ fontWeight: "800", fontSize: "14px", color: "#8e44ad", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
        🛡️ صلاحيات المحررين
      </div>
      <div style={{ fontSize: "12px", color: "#aaa", fontFamily: "'Cairo', sans-serif", marginBottom: "14px" }}>
        تحكم في ما يستطيع المحررون فعله — المدير الرئيسي يملك كامل الصلاحيات دائماً
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
              <span style={{ fontSize: "18px" }}>{item.icon}</span>
              <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "600", color: textColor }}>
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
function AdBannerManager({ darkMode }) {
  const [adData, setAdData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    is_active: false, title: "",
    description: "", phone: "", image_url: ""
  });

  const cardBg = darkMode ? "#16213e" : "#fff";
  const border = darkMode ? "#2a2a4a" : "#f0f0f0";

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

  if (loading) return null;

  return (
    <div style={{ background: cardBg, borderRadius: "14px", padding: "16px", marginBottom: "10px", border: `1.5px solid ${border}` }}>
      <div style={{ fontWeight: "800", fontSize: "14px", color: "#e67e22", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>📢 إعلان بطاقة الكهرباء</span>
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
      {[["title","عنوان الإعلان *"],["description","وصف مختصر (اختياري)"],["phone","رقم التواصل (اختياري)"],["image_url","رابط صورة الإعلان (اختياري)"]].map(([k, ph]) => (
        <input key={k} value={form[k] || ""} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} placeholder={ph}
          style={{ width: "100%", padding: "10px", borderRadius: "8px", border: `1.5px solid ${form.is_active ? "#f0b27a" : "#e8e8e8"}`, fontFamily: "'Cairo', sans-serif", fontSize: "13px", marginBottom: "8px", boxSizing: "border-box", background: darkMode ? "#0f3460" : "#fafafa", color: darkMode ? "#e0e0e0" : "#2c3e50" }} />
      ))}
      {form.title && (
        <div style={{ background: "linear-gradient(135deg,#f39c12,#e67e22)", borderRadius: "10px", padding: "10px 14px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,.7)", fontFamily: "'Cairo', sans-serif" }}>معاينة — إعلان مدفوع</div>
            <div style={{ color: "#fff", fontWeight: "800", fontSize: "13px", fontFamily: "'Cairo', sans-serif" }}>{form.title}</div>
            {form.description && <div style={{ color: "rgba(255,255,255,.85)", fontSize: "11px", fontFamily: "'Cairo', sans-serif" }}>{form.description}</div>}
          </div>
          {form.phone && <div style={{ background: "#fff", color: "#e67e22", borderRadius: "8px", padding: "6px 10px", fontSize: "11px", fontWeight: "800", fontFamily: "'Cairo', sans-serif" }}>📞 اتصل</div>}
        </div>
      )}
      <button onClick={saveAd} disabled={saving}
        style={{ width: "100%", padding: "12px", background: saving ? "#aaa" : "#e67e22", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: saving ? "not-allowed" : "pointer" }}>
        {saving ? "جاري الحفظ..." : "💾 حفظ الإعلان"}
      </button>
    </div>
  );
}

// ==================== SETTINGS PAGE ====================
function SettingsPage({ isAdmin, adminRole, darkMode, setDarkMode, editorPerms, setEditorPerms, onNavigate }) {
  const [activeSection, setActiveSection] = useState(null);
  const [contactMsg, setContactMsg] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [sending, setSending] = useState(false);

  const bg = darkMode ? "#1a1a2e" : "#f5f6fa";
  const cardBg = darkMode ? "#16213e" : "#fff";
  const textColor = darkMode ? "#e0e0e0" : "#2c3e50";
  const subColor = darkMode ? "#aaa" : "#888";
  const borderColor = darkMode ? "#2a2a4a" : "#f0f0f0";

  async function sendMessage() {
    if (!contactMsg.trim()) return alert("الرسالة مطلوبة!");
    setSending(true);
    await supabase("contact_messages", "POST", { name: contactName, phone: contactPhone, message: contactMsg });
    setSending(false);
    setContactMsg(""); setContactName(""); setContactPhone("");
    setActiveSection(null);
    alert("تم إرسال رسالتك! شكراً لك ✅");
  }

  const toggle = (key) => setActiveSection(activeSection === key ? null : key);

  return (
    <div style={{ padding: "20px", fontFamily: "'Cairo', sans-serif", background: bg, minHeight: "80vh" }}>

      {/* Dark Mode */}
      <div style={{ background: cardBg, borderRadius: "14px", padding: "16px", marginBottom: "10px", border: `1.5px solid ${borderColor}`, display: "flex", alignItems: "center", gap: "14px" }}>
        <span style={{ fontSize: "24px" }}>{darkMode ? "🌙" : "☀️"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: "700", fontSize: "14px", color: textColor }}>{darkMode ? "المود الليلي" : "المود النهاري"}</div>
          <div style={{ fontSize: "12px", color: subColor, marginTop: "2px" }}>اضغط للتبديل</div>
        </div>
        <div onClick={() => setDarkMode(!darkMode)} style={{ width: "50px", height: "27px", borderRadius: "20px", background: darkMode ? "#c0392b" : "#ddd", position: "relative", cursor: "pointer", transition: "background 0.3s" }}>
          <div style={{ position: "absolute", top: "3px", right: darkMode ? "3px" : "23px", width: "21px", height: "21px", borderRadius: "50%", background: "#fff", transition: "right 0.3s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
        </div>
      </div>

      {/* About */}
      <div onClick={() => toggle("about")} style={{ background: cardBg, borderRadius: "14px", padding: "16px", marginBottom: "10px", border: `1.5px solid ${borderColor}`, display: "flex", alignItems: "center", gap: "14px", cursor: "pointer" }}>
        <span style={{ fontSize: "24px" }}>📱</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: "700", fontSize: "14px", color: textColor }}>حول التطبيق</div>
          <div style={{ fontSize: "12px", color: subColor, marginTop: "2px" }}>الإصدار 1.0 - دليل بنش الخدمي</div>
        </div>
        <Icon name={activeSection === "about" ? "chevronUp" : "chevronDown"} size={18} color={subColor} />
      </div>
      {activeSection === "about" && (
        <div style={{ background: cardBg, borderRadius: "14px", padding: "16px", marginBottom: "10px", border: `1.5px solid ${borderColor}`, fontSize: "13px", color: textColor, lineHeight: "1.8" }}>
          <div style={{ fontWeight: "800", marginBottom: "8px", color: "#c0392b" }}><BanshLogo size={20} /> دليل بنش الخدمي</div>
          دليل بنش هو تطبيق مجتمعي يهدف إلى تسهيل الحياة اليومية لأبناء مدينة بنش.<br /><br />
          <span style={{ color: subColor }}>الإصدار: 1.0.0</span>
        </div>
      )}

      {/* Privacy */}
      <div onClick={() => toggle("privacy")} style={{ background: cardBg, borderRadius: "14px", padding: "16px", marginBottom: "10px", border: `1.5px solid ${borderColor}`, display: "flex", alignItems: "center", gap: "14px", cursor: "pointer" }}>
        <span style={{ fontSize: "24px" }}>🔒</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: "700", fontSize: "14px", color: textColor }}>سياسة الخصوصية</div>
          <div style={{ fontSize: "12px", color: subColor, marginTop: "2px" }}>اقرأ سياسة الخصوصية</div>
        </div>
        <Icon name={activeSection === "privacy" ? "chevronUp" : "chevronDown"} size={18} color={subColor} />
      </div>
      {activeSection === "privacy" && (
        <div style={{ background: cardBg, borderRadius: "14px", padding: "16px", marginBottom: "10px", border: `1.5px solid ${borderColor}`, fontSize: "13px", color: textColor, lineHeight: "1.9" }}>
          <div style={{ fontWeight: "800", marginBottom: "10px", color: "#c0392b" }}>🔒 سياسة الخصوصية</div>
          <b>جمع البيانات:</b> نجمع فقط البيانات التي تقدمها طوعاً.<br /><br />
          <b>استخدام البيانات:</b> تُستخدم حصراً لتقديم الخدمة ولا تُشارك مع أطراف ثالثة.<br /><br />
          <b>الأمان:</b> نستخدم قواعد بيانات آمنة لحماية معلوماتك.
        </div>
      )}

      {/* Contact */}
      <div onClick={() => toggle("contact")} style={{ background: cardBg, borderRadius: "14px", padding: "16px", marginBottom: "10px", border: `1.5px solid ${borderColor}`, display: "flex", alignItems: "center", gap: "14px", cursor: "pointer" }}>
        <span style={{ fontSize: "24px" }}>📩</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: "700", fontSize: "14px", color: textColor }}>تواصل معنا</div>
          <div style={{ fontSize: "12px", color: subColor, marginTop: "2px" }}>أرسل اقتراحاتك وملاحظاتك</div>
        </div>
        <Icon name={activeSection === "contact" ? "chevronUp" : "chevronDown"} size={18} color={subColor} />
      </div>
      {activeSection === "contact" && (
        <div style={{ background: cardBg, borderRadius: "14px", padding: "16px", marginBottom: "10px", border: `1.5px solid ${borderColor}` }}>
          <input placeholder="اسمك (اختياري)" value={contactName} onChange={e => setContactName(e.target.value)}
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: `1.5px solid ${borderColor}`, fontFamily: "'Cairo', sans-serif", fontSize: "13px", marginBottom: "8px", boxSizing: "border-box", background: darkMode ? "#0f3460" : "#fafafa", color: textColor }} />
          <input placeholder="رقم التواصل (اختياري)" value={contactPhone} onChange={e => setContactPhone(e.target.value)}
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: `1.5px solid ${borderColor}`, fontFamily: "'Cairo', sans-serif", fontSize: "13px", marginBottom: "8px", boxSizing: "border-box", background: darkMode ? "#0f3460" : "#fafafa", color: textColor }} />
          <textarea placeholder="رسالتك أو اقتراحك..." value={contactMsg} onChange={e => setContactMsg(e.target.value)} rows={3}
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: `1.5px solid ${borderColor}`, fontFamily: "'Cairo', sans-serif", fontSize: "13px", marginBottom: "8px", boxSizing: "border-box", resize: "none", background: darkMode ? "#0f3460" : "#fafafa", color: textColor }} />
          <button onClick={sendMessage} disabled={sending}
            style={{ width: "100%", padding: "12px", background: sending ? "#aaa" : "#c0392b", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "14px", cursor: sending ? "not-allowed" : "pointer" }}>
            {sending ? "جاري الإرسال..." : "إرسال ✉️"}
          </button>
        </div>
      )}

      {/* Admin Dashboard Button */}
      {isAdmin && adminRole === "super" && (
        <div onClick={() => onNavigate("admin_dashboard")} style={{ background: "linear-gradient(135deg, #8e44ad 0%, #6c3483 100%)", borderRadius: "14px", padding: "16px", marginBottom: "10px", border: `1.5px solid #d2b4de`, display: "flex", alignItems: "center", gap: "14px", cursor: "pointer", transition: "all 0.3s" }} onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
          <span style={{ fontSize: "24px" }}>🔐</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: "700", fontSize: "14px", color: "#fff" }}>لوحة تحكم المدير الرئيسي</div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.9)", marginTop: "2px" }}>إدارة المستخدمين والصلاحيات والإعلانات</div>
          </div>
          <Icon name="chevronDown" size={18} color="#fff" />
        </div>
      )}


    </div>
  );
}


// ==================== DRAWER ====================
function Drawer({ isOpen, onClose, currentPage, onNavigate, isAdmin, adminRole, adminName, onAdminToggle, darkMode }) {
  const menuItems = [
    { id: "home",        label: "الرئيسية",         icon: "home" },
    { id: "contacts",    label: "جهات الاتصال",      icon: "contacts" },
    { id: "news",        label: "الأخبار",           icon: "news" },
    { id: "obituary",    label: "الوفيات",           icon: "obituary" },
   { id: "lost", label: "المفقودات", icon: "lost", color: "#065f46", gradient: "linear-gradient(135deg, #374151 0%, #374151 50%, #065f46 50%, #065f46 100%)" },
    { id: "ads",         label: "الإعلانات",         icon: "ads" },
    { id: "links",       label: "روابط مهمة",        icon: "links" },
    { id: "settings",    label: "الإعدادات",         icon: "settings" },
  ];
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? "all" : "none", transition: "opacity 0.3s" }} />
      <div style={{ position: "fixed", top: 0, right: isOpen ? 0 : "-280px", width: "280px", height: "100%", background: "#fff", zIndex: 1001, transition: "right 0.3s ease", display: "flex", flexDirection: "column", boxShadow: "-6px 0 30px rgba(0,0,0,0.15)" }}>
        <div style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", padding: "28px 20px 24px", color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: "'Cairo', sans-serif", fontWeight: "900", fontSize: "20px", letterSpacing: "0.5px", textShadow: "0 2px 4px rgba(0,0,0,0.1)" }}><BanshLogo size={24} /> دليل بنش</div>
              <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: "12px", opacity: 0.85, marginTop: "6px", fontWeight: "500" }}>المنصة الرقمية لمدينة بنش</div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "10px", padding: "8px", cursor: "pointer", transition: "all 0.3s", backdropFilter: "blur(4px)" }}>
              <Icon name="close" size={20} color="#fff" />
            </button>
          </div>
          {isAdmin && adminRole === "super" && (
            <details style={{ marginTop: "12px" }}>
              <summary style={{ background: "rgba(255,255,255,0.2)", borderRadius: "10px", padding: "10px 14px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontSize: "12px", fontWeight: "700", color: "#fff", listStyle: "none", transition: "all 0.3s", backdropFilter: "blur(4px)" }}>
                👥 إدارة المستخدمين ▼
              </summary>
              <AdminUsersManager darkMode={darkMode} />
            </details>
          )}
          {isAdmin && (
            <div style={{ marginTop: "12px", background: "rgba(255,255,255,0.2)", borderRadius: "8px", padding: "8px 12px", fontSize: "12px", fontFamily: "'Cairo', sans-serif" }}>
              🔓 {adminName} — {adminRole === "super" ? "مدير رئيسي" : "محرر"}
            </div>
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
          {menuItems.map(item => (
            <button key={item.id} onClick={() => { onNavigate(item.id); onClose(); }} style={{
              width: "100%", padding: "16px 20px",
              background: currentPage === item.id ? "linear-gradient(90deg, #667eea15 0%, #764ba215 100%)" : "transparent",
              border: "none", borderRight: currentPage === item.id ? "4px solid #667eea" : "4px solid transparent",
              display: "flex", alignItems: "center", gap: "16px", cursor: "pointer",
              fontFamily: "'Cairo', sans-serif", fontSize: "15px",
              fontWeight: currentPage === item.id ? "700" : "600",
              color: currentPage === item.id ? "#667eea" : "#2c3e50",
              textAlign: "right", transition: "all 0.3s",
            }}>
              <Icon name={item.icon} size={22} color={currentPage === item.id ? "#667eea" : "#888"} />
              {item.label}
            </button>
          ))}
        </div>
        <div style={{ padding: "16px", borderTop: "1px solid #f0f0f0" }}>
          <button onClick={() => { onAdminToggle(); onClose(); }} style={{
            width: "100%", padding: "14px",
            background: isAdmin ? "linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            border: "none",
            borderRadius: "14px", color: "#fff",
            fontFamily: "'Cairo', sans-serif", fontSize: "14px", fontWeight: "800", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
            boxShadow: isAdmin ? "0 4px 15px rgba(255, 107, 107, 0.3)" : "0 4px 15px rgba(102, 126, 234, 0.3)",
            transition: "all 0.3s",
          }}>
            <Icon name="admin" size={18} color="#fff" />
            {isAdmin ? "🚪 خروج من الإدارة" : "🔐 دخول الإدارة"}
          </button>
        </div>
      </div>
    </>
  );
}

// ==================== GLOBAL SEARCH ====================
function GlobalSearch({ onClose, onNavigate }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function doSearch(q) {
    if (!q.trim()) { setResults(null); return; }
    setLoading(true);
const [contacts, news, obituaries, ads, lost, drivers, links] = await Promise.all([
      supabase("contacts",         "GET", null, `?or=(name.ilike.*${q}*,phone.ilike.*${q}*)`),
      supabase("news",             "GET", null, `?or=(title.ilike.*${q}*,content.ilike.*${q}*)&limit=5`),
      supabase("obituaries",       "GET", null, `?name=ilike.*${q}*&limit=5`),
      supabase("ads",              "GET", null, `?or=(title.ilike.*${q}*,description.ilike.*${q}*)&status=eq.approved&limit=5`),
      supabase("lost_found",       "GET", null, `?or=(title.ilike.*${q}*,description.ilike.*${q}*)&status=eq.approved&limit=5`),
      supabase("transport_drivers","GET", null, `?or=(name.ilike.*${q}*,phone.ilike.*${q}*)&limit=5`),
      supabase("links", "GET", null, `?title=ilike.*${q}*&limit=5`),
    ]);
    setResults({
      contacts:   contacts   || [],
      news:       news       || [],
      obituaries: obituaries || [],
      ads:        ads        || [],
      lost:       lost       || [],
      drivers:    drivers    || [],
      links:      links      || [],
    });
    setLoading(false);
  }

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  const totalResults = results
    ? Object.values(results).reduce((a, arr) => a + arr.length, 0)
    : 0;

  const sections = [
    { key: "contacts",   label: "جهات الاتصال", nav: "contacts",  color: "#2980b9", emoji: "📞" },
    { key: "news",       label: "الأخبار",       nav: "news",      color: "#8e44ad", emoji: "📰" },
    { key: "obituaries", label: "الوفيات",       nav: "obituary",  color: "#2c3e50", emoji: "🕊️" },
    { key: "ads",        label: "الإعلانات",     nav: "ads",       color: "#27ae60", emoji: "📢" },
    { key: "lost",       label: "المفقودات",     nav: "lost",      color: "#d35400", emoji: "🔍" },
    { key: "drivers",    label: "التوصيل",       nav: "transport", color: "#1a5276", emoji: "🚗" },
    { key: "links",      label: "روابط مهمة",   nav: "links",     color: "#c0392b", emoji: "🔗" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 3000, display: "flex", flexDirection: "column" }}>
      {/* Search Header */}
      <div style={{ background: "linear-gradient(135deg, #1a5276, #2980b9)", padding: "12px 16px", display: "flex", gap: "10px", alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="ابحث في كل الأقسام..."
            style={{ width: "100%", padding: "11px 16px 11px 40px", borderRadius: "12px", border: "none", fontFamily: "'Cairo', sans-serif", fontSize: "14px", outline: "none", boxSizing: "border-box" }} />
          <div style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }}>
            <Icon name="search" size={16} color="#888" />
          </div>
        </div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "10px", padding: "10px", cursor: "pointer" }}>
          <Icon name="close" size={20} color="#fff" />
        </button>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto", background: "#f5f6fa", padding: "12px" }}>
        {!query.trim() && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#c8d97a", fontFamily: "'Cairo', sans-serif" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>🔍</div>
            <div style={{ fontWeight: "#c8d97a", fontSize: "15px" }}>ابحث في جميع الأقسام</div>
            <div style={{ fontSize: "13px", marginTop: "6px", color: "#e8a0a0", fontStyle: "italic" }}>
  كلّ ما تحتاجه في بنش، في كلمة واحدة
</div>
          </div>
        )}
        {loading && (
          <div style={{ textAlign: "center", padding: "40px", color: "#888", fontFamily: "'Cairo', sans-serif" }}>
            جاري البحث...
          </div>
        )}
        {results && !loading && totalResults === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#aaa", fontFamily: "'Cairo', sans-serif" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>😔</div>
            <div style={{ fontWeight: "700" }}>لا توجد نتائج لـ "{query}"</div>
          </div>
        )}
        {results && !loading && sections.map(sec => {
          const items = results[sec.key];
          if (!items || items.length === 0) return null;
          return (
            <div key={sec.key} style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ fontFamily: "'Cairo', sans-serif", fontWeight: "800", fontSize: "13px", color: sec.color }}>
                  {sec.label} ({items.length})
                </div>
                <button onClick={() => { onNavigate(sec.nav); onClose(); }}
                  style={{ background: "none", border: "none", color: sec.color, fontFamily: "'Cairo', sans-serif", fontSize: "12px", cursor: "pointer", fontWeight: "700" }}>
                  عرض الكل ←
                </button>
              </div>
              {items.map(item => (
                <div key={item.id} onClick={() => { onNavigate(sec.nav); onClose(); }}
                  style={{ background: "#fff", borderRadius: "10px", padding: "12px 14px", marginBottom: "8px", cursor: "pointer", border: `1.5px solid ${sec.color}22`, display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: `${sec.color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "18px" }}>
                    {sec.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "13px", color: "#2c3e50", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.name || item.title}
                    </div>
                    {(item.phone || item.content || item.description) && (
                      <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: "12px", color: "#888", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.phone || item.content || item.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== REAL ESTATE PAGE ====================
function RealEstatePage({ isAdmin, adminRole, editorPerms }) {
  const [items,     setItems]    = useState([]);
  const [loading,   setLoading]  = useState(true);
  const [showForm,  setShowForm] = useState(false);
  const [tab,       setTab]      = useState("approved");
  const [typeFilter,setTypeFilter]= useState("all");
  const [selected,  setSelected] = useState(null);
  const [form, setForm] = useState({
    title: "", type: "sale", neighborhood: "",
    phone: "", image_url: "", description: ""
  });

  const canEdit = canDo("realestate", isAdmin, adminRole, editorPerms);

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    setLoading(true);
    const cached = getCache("real_estate");
    if (cached) { setItems(cached); setLoading(false); return; }
    const data = await supabase("real_estate", "GET", null, "?order=created_at.desc");
    setItems(data || []);
    if (data) setCache("real_estate", data);
    setLoading(false);
  }

  async function submitItem() {
    if (!form.title.trim() || !form.phone.trim())
      return alert("العنوان ورقم التواصل مطلوبان!");
    await supabase("real_estate", "POST", { ...form, status: "pending" });
    setForm({ title: "", type: "sale", neighborhood: "", phone: "", image_url: "", description: "" });
    setShowForm(false);
    clearCache("real_estate");
    loadItems();
    alert("تم إرسال إعلانك! سيظهر بعد مراجعة الإدارة ✅");
  }

  async function updateStatus(id, status) {
    await supabase("real_estate", "PATCH", { status }, `?id=eq.${id}`);
    clearCache("real_estate"); loadItems();
  }

  async function deleteItem(id) {
    if (!confirm("حذف الإعلان؟")) return;
    await supabase("real_estate", "DELETE", null, `?id=eq.${id}`);
    clearCache("real_estate"); loadItems();
  }

  const approved = items.filter(i => i.status === "approved");
  const pending  = items.filter(i => i.status === "pending");
  const displayed = (isAdmin ? (tab === "approved" ? approved : pending) : approved)
    .filter(i => typeFilter === "all" || i.type === typeFilter);

  return (
    <div style={{ padding: "16px", fontFamily: "'Cairo', sans-serif" }}>

      {/* زر الإضافة */}
      <button onClick={() => setShowForm(!showForm)} style={{
        width: "100%", padding: "12px",
        background: "linear-gradient(135deg,#8e44ad,#6c3483)",
        color: "#fff", border: "none", borderRadius: "12px",
        fontFamily: "'Cairo', sans-serif", fontSize: "14px",
        fontWeight: "700", cursor: "pointer", marginBottom: "16px",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px"
      }}>
        <Icon name="plus" size={18} />
        {showForm ? "إلغاء" : "أضف إعلانك العقاري مجاناً"}
      </button>

      {/* نموذج الإضافة */}
      {showForm && (
        <div style={{
          background: "#f5eef8", borderRadius: "12px",
          padding: "16px", marginBottom: "16px", border: "2px solid #d2b4de"
        }}>
          <div style={{ fontSize: "12px", color: "#888", marginBottom: "12px", textAlign: "center" }}>
            سيظهر إعلانك بعد مراجعة الإدارة ✅
          </div>

          {/* نوع العقار */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            {[{ v: "sale", l: "🏠 للبيع" }, { v: "rent", l: "🔑 للإيجار" }].map(t => (
              <button key={t.v} onClick={() => setForm(p => ({ ...p, type: t.v }))} style={{
                flex: 1, padding: "10px", borderRadius: "8px", border: "none",
                cursor: "pointer",
                background: form.type === t.v ? "#8e44ad" : "#f0f0f0",
                color: form.type === t.v ? "#fff" : "#555",
                fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "13px"
              }}>{t.l}</button>
            ))}
          </div>

          <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="عنوان الإعلان *"
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #d2b4de", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />

          <input value={form.neighborhood} onChange={e => setForm(p => ({ ...p, neighborhood: e.target.value }))}
            placeholder="الحي أو الموقع"
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #d2b4de", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />

          <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
            placeholder="رقم التواصل *" type="tel"
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #d2b4de", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />

          <input value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))}
            placeholder="رابط الصورة (اختياري)"
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #d2b4de", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />

          <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="وصف العقار (اختياري)" rows={3}
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #d2b4de", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", resize: "none", boxSizing: "border-box" }} />

          <button onClick={submitItem} style={{
            width: "100%", padding: "12px", background: "#8e44ad",
            color: "#fff", border: "none", borderRadius: "8px",
            fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer"
          }}>إرسال الإعلان</button>
        </div>
      )}

      {/* تبويبات الإدارة */}
      {isAdmin && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          {[{ id: "approved", label: "المنشورة" }, { id: "pending", label: `انتظار (${pending.length})` }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "10px", borderRadius: "10px", border: "none",
              cursor: "pointer",
              background: tab === t.id ? "#8e44ad" : "#f0f0f0",
              color: tab === t.id ? "#fff" : "#555",
              fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "700"
            }}>{t.label}</button>
          ))}
        </div>
      )}

      {/* فلتر النوع */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        {[{ v: "all", l: "الكل" }, { v: "sale", l: "🏠 للبيع" }, { v: "rent", l: "🔑 للإيجار" }].map(t => (
          <button key={t.v} onClick={() => setTypeFilter(t.v)} style={{
            flex: 1, padding: "8px", borderRadius: "8px", border: "none",
            cursor: "pointer",
            background: typeFilter === t.v ? "#6c3483" : "#f0f0f0",
            color: typeFilter === t.v ? "#fff" : "#555",
            fontFamily: "'Cairo', sans-serif", fontSize: "12px", fontWeight: "700"
          }}>{t.l}</button>
        ))}
      </div>

      {/* القائمة */}
      {loading
        ? <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>جاري التحميل...</div>
        : displayed.length === 0
          ? <div style={{ textAlign: "center", padding: "40px", color: "#aaa" }}>لا توجد إعلانات حالياً</div>
          : displayed.map(item => (
            <div key={item.id} onClick={() => setSelected(item)} style={{
              background: "#fff", borderRadius: "14px", marginBottom: "12px",
              overflow: "hidden", border: "1.5px solid #d2b4de", cursor: "pointer"
            }}>
              {item.image_url && (
                <img src={item.image_url} alt={item.title}
                  style={{ width: "100%", height: "170px", objectFit: "cover" }}
                  onError={e => e.target.style.display = "none"} />
              )}
              <div style={{ padding: "14px" }}>

                {/* الباج + العنوان */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span style={{
                    background: item.type === "sale" ? "#f5eef8" : "#eafaf1",
                    color: item.type === "sale" ? "#8e44ad" : "#27ae60",
                    border: `1.5px solid ${item.type === "sale" ? "#d2b4de" : "#a9dfbf"}`,
                    borderRadius: "20px", padding: "2px 10px",
                    fontSize: "11px", fontWeight: "700", flexShrink: 0
                  }}>
                    {item.type === "sale" ? "🏠 للبيع" : "🔑 للإيجار"}
                  </span>
                  <span style={{ fontWeight: "800", fontSize: "14px", color: "#2c3e50" }}>
                    {item.title}
                  </span>
                </div>

                {item.neighborhood && (
                  <div style={{ fontSize: "13px", color: "#666", marginBottom: "8px" }}>
                    📍 {item.neighborhood}
                  </div>
                )}

                {item.description && (
                  <div style={{
                    fontSize: "13px", color: "#777", lineHeight: "1.6", marginBottom: "10px",
                    display: "-webkit-box", WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical", overflow: "hidden"
                  }}>{item.description}</div>
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                  onClick={e => e.stopPropagation()}>
                  <a href={`tel:${item.phone}`} style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    background: "#f5eef8", border: "1.5px solid #d2b4de",
                    borderRadius: "8px", padding: "8px 12px",
                    color: "#8e44ad", textDecoration: "none",
                    fontSize: "13px", fontWeight: "700", fontFamily: "'Cairo', sans-serif"
                  }}>
                    <Icon name="phone" size={14} color="#8e44ad" /> {item.phone}
                  </a>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {canEdit && item.status === "pending" && (
                      <button onClick={() => updateStatus(item.id, "approved")} style={{
                        background: "#27ae60", color: "#fff", border: "none",
                        borderRadius: "8px", padding: "8px 12px", cursor: "pointer",
                        fontFamily: "'Cairo', sans-serif", fontSize: "12px", fontWeight: "700"
                      }}>✅ موافقة</button>
                    )}
                    {canEdit && (
                      <button onClick={() => deleteItem(item.id)} style={{
                        background: "#fdedec", border: "none", borderRadius: "8px",
                        padding: "8px", cursor: "pointer"
                      }}>
                        <Icon name="trash" size={14} color="#c0392b" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
      }

      {/* Modal التفاصيل */}
      {selected && (
        <div onClick={() => setSelected(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.7)",
          zIndex: 2000, display: "flex", alignItems: "flex-end", justifyContent: "center"
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#fff", borderRadius: "20px 20px 0 0",
            width: "100%", maxWidth: "430px", maxHeight: "85vh", overflowY: "auto"
          }}>
            {selected.image_url && (
              <img src={selected.image_url} alt={selected.title}
                style={{ width: "100%", height: "220px", objectFit: "cover" }}
                onError={e => e.target.style.display = "none"} />
            )}
            <div style={{ padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <span style={{
                  background: selected.type === "sale" ? "#f5eef8" : "#eafaf1",
                  color: selected.type === "sale" ? "#8e44ad" : "#27ae60",
                  border: `1.5px solid ${selected.type === "sale" ? "#d2b4de" : "#a9dfbf"}`,
                  borderRadius: "20px", padding: "3px 12px", fontSize: "12px", fontWeight: "700"
                }}>
                  {selected.type === "sale" ? "🏠 للبيع" : "🔑 للإيجار"}
                </span>
              </div>
              <div style={{ fontWeight: "800", fontSize: "17px", color: "#2c3e50", marginBottom: "10px" }}>
                {selected.title}
              </div>
              {selected.neighborhood && (
                <div style={{ fontSize: "14px", color: "#555", marginBottom: "8px" }}>
                  📍 {selected.neighborhood}
                </div>
              )}
              {selected.description && (
                <div style={{ fontSize: "14px", color: "#444", lineHeight: "1.9", marginBottom: "16px" }}>
                  {selected.description}
                </div>
              )}
              <a href={`tel:${selected.phone}`} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                background: "#f5eef8", border: "1.5px solid #d2b4de",
                borderRadius: "12px", padding: "12px",
                color: "#8e44ad", textDecoration: "none",
                fontSize: "15px", fontWeight: "700", fontFamily: "'Cairo', sans-serif", marginBottom: "10px"
              }}>
                <Icon name="phone" size={18} color="#8e44ad" /> {selected.phone}
              </a>
              <a href={`https://wa.me/?text=${encodeURIComponent(`🏠 ${selected.title}\n📍 ${selected.neighborhood || ""}\n\n${selected.description || ""}\n📞 ${selected.phone}\n\n🔗 ${SITE_URL}`)}`}
                target="_blank" rel="noopener noreferrer" style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  background: "#25D366", color: "#fff", borderRadius: "10px",
                  padding: "10px 16px", textDecoration: "none",
                  fontFamily: "'Cairo', sans-serif", fontSize: "13px", fontWeight: "700", marginBottom: "12px"
                }}>
                <span>📤</span> مشاركة على واتساب
              </a>
              <button onClick={() => setSelected(null)} style={{
                width: "100%", padding: "12px", background: "#f0f0f0",
                border: "none", borderRadius: "10px",
                fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer"
              }}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== SOS BUTTON ====================
function SOSButton({ isAdmin, adminRole }) {
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ label: "", number: "", color: "#e74c3c", bg: "#fdedec" });

  const isSuper = adminRole === "super";

  const DEFAULT_CONTACTS = [
    { id: 1, label: "🚑 إسعاف", number: "110", color: "#e74c3c", bg: "#fdedec" },
    { id: 2, label: "🚒 إطفاء", number: "113", color: "#e67e22", bg: "#fdf2e9" },
    { id: 3, label: "🚔 شرطة",  number: "112", color: "#2980b9", bg: "#ebf5fb" },
  ];

  const COLOR_PRESETS = [
    { color: "#e74c3c", bg: "#fdedec" },
    { color: "#e67e22", bg: "#fdf2e9" },
    { color: "#2980b9", bg: "#ebf5fb" },
    { color: "#27ae60", bg: "#eafaf1" },
    { color: "#8e44ad", bg: "#f5eef8" },
    { color: "#2c3e50", bg: "#eaecee" },
  ];

  async function loadContacts() {
    setLoading(true);
    const data = await supabase("sos_contacts", "GET", null, "?order=sort_order.asc,id.asc");
    setContacts(data && data.length > 0 ? data : DEFAULT_CONTACTS);
    setLoading(false);
  }

  async function addContact() {
    if (!form.label.trim() || !form.number.trim()) return alert("الاسم والرقم مطلوبان!");
    await supabase("sos_contacts", "POST", { ...form, sort_order: contacts.length + 1 });
    setForm({ label: "", number: "", color: "#e74c3c", bg: "#fdedec" });
    setShowAddForm(false);
    loadContacts();
  }

  async function saveEdit() {
    await supabase("sos_contacts", "PATCH", form, `?id=eq.${editingId}`);
    setEditingId(null);
    loadContacts();
  }

  async function deleteContact(id) {
    if (!confirm("حذف هذا الرقم؟")) return;
    await supabase("sos_contacts", "DELETE", null, `?id=eq.${id}`);
    loadContacts();
  }

  return (
    <div>
      {/* زر SOS */}
      <button
        onClick={() => { setShowModal(true); loadContacts(); }}
        style={{
          position: "fixed", bottom: "28px", left: "24px",
          width: "72px", height: "72px", borderRadius: "50%",
          background: "linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)", 
          border: "4px solid #fff",
          boxShadow: "0 8px 30px rgba(255, 107, 107, 0.6), inset 0 1px 0 rgba(255,255,255,0.3)",
          color: "#fff", fontWeight: "900", fontSize: "15px",
          fontFamily: "'Cairo', sans-serif", cursor: "pointer",
          zIndex: 500, display: "flex", alignItems: "center",
          justifyContent: "center", letterSpacing: "1.5px",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          animation: "pulse 2s infinite"
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = "scale(1.1)";
          e.currentTarget.style.boxShadow = "0 12px 35px rgba(255, 107, 107, 0.8), inset 0 1px 0 rgba(255,255,255,0.3)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 8px 30px rgba(255, 107, 107, 0.6), inset 0 1px 0 rgba(255,255,255,0.3)";
        }}>
        🆘
      </button>

      {/* مودال الأرقام */}
      {showModal && (
        <div onClick={() => setShowModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 2000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: "430px", padding: "20px", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ textAlign: "center", marginBottom: "16px", fontFamily: "'Cairo', sans-serif" }}>
              <div style={{ fontSize: "40px", marginBottom: "6px" }}>🆘</div>
              <div style={{ fontWeight: "800", fontSize: "18px", color: "#e74c3c" }}>أرقام الطوارئ</div>
              <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>اضغط على الرقم للاتصال مباشرة</div>
            </div>
            {loading
              ? <div style={{ textAlign: "center", padding: "20px", color: "#888", fontFamily: "'Cairo', sans-serif" }}>جاري التحميل...</div>
              : contacts.map(c => (
                <a key={c.id} href={"tel:" + c.number}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: c.bg, border: "2px solid " + c.color + "44", borderRadius: "14px", padding: "16px 20px", marginBottom: "10px", textDecoration: "none" }}>
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontWeight: "800", fontSize: "16px", color: c.color }}>{c.label}</span>
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontWeight: "900", fontSize: "22px", color: c.color, direction: "ltr" }}>{c.number}</span>
                </a>
              ))
            }
            {isSuper && (
              <button onClick={() => { setShowModal(false); setShowEditModal(true); loadContacts(); }}
                style={{ width: "100%", marginTop: "4px", marginBottom: "8px", padding: "12px", background: "#fdedec", border: "2px solid #f5b7b1", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "13px", color: "#e74c3c", cursor: "pointer" }}>
                ✏️ تعديل أرقام الطوارئ
              </button>
            )}
            <button onClick={() => setShowModal(false)}
              style={{ width: "100%", padding: "14px", background: "#f0f0f0", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "14px", cursor: "pointer" }}>
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* مودال التعديل */}
      {showEditModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 2000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: "430px", padding: "20px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontWeight: "800", fontSize: "17px", color: "#e74c3c", marginBottom: "16px", textAlign: "center" }}>
              🆘 تعديل أرقام الطوارئ
            </div>
            {contacts.map(c => (
              <div key={c.id}>
                {editingId === c.id ? (
                  <div style={{ background: "#fdf2e9", borderRadius: "12px", padding: "14px", marginBottom: "10px", border: "2px solid #f0b27a" }}>
                    <input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                      placeholder="الاسم (مثال: 🚑 إسعاف)"
                      style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #f0b27a", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
                    <input value={form.number} onChange={e => setForm(p => ({ ...p, number: e.target.value }))}
                      placeholder="الرقم" type="tel"
                      style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #f0b27a", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box", direction: "ltr" }} />
                    <div style={{ fontSize: "12px", color: "#888", marginBottom: "6px", fontFamily: "'Cairo', sans-serif" }}>اختر اللون:</div>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                      {COLOR_PRESETS.map((p, i) => (
                        <div key={i} onClick={() => setForm(f => ({ ...f, color: p.color, bg: p.bg }))}
                          style={{ width: "32px", height: "32px", borderRadius: "50%", background: p.color, cursor: "pointer", border: form.color === p.color ? "3px solid #333" : "3px solid transparent" }} />
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={saveEdit}
                        style={{ flex: 1, padding: "10px", background: "#e74c3c", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>حفظ</button>
                      <button onClick={() => setEditingId(null)}
                        style={{ flex: 1, padding: "10px", background: "#f0f0f0", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", background: c.bg, border: "2px solid " + c.color + "44", borderRadius: "12px", padding: "12px 14px", marginBottom: "10px" }}>
                    <span style={{ flex: 1, fontWeight: "800", fontSize: "15px", color: c.color, fontFamily: "'Cairo', sans-serif" }}>{c.label}</span>
                    <span style={{ fontWeight: "900", fontSize: "18px", color: c.color, direction: "ltr" }}>{c.number}</span>
                    <button onClick={() => { setEditingId(c.id); setForm({ label: c.label, number: c.number, color: c.color, bg: c.bg }); }}
                      style={{ background: "rgba(255,255,255,.7)", border: "none", borderRadius: "8px", padding: "6px 8px", cursor: "pointer" }}>
                      <Icon name="edit" size={15} color={c.color} />
                    </button>
                    <button onClick={() => deleteContact(c.id)}
                      style={{ background: "rgba(255,255,255,.7)", border: "none", borderRadius: "8px", padding: "6px 8px", cursor: "pointer" }}>
                      <Icon name="trash" size={15} color="#c0392b" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {showAddForm ? (
              <div style={{ background: "#eafaf1", borderRadius: "12px", padding: "14px", marginBottom: "10px", border: "2px solid #a9dfbf" }}>
                <div style={{ fontWeight: "700", fontSize: "13px", color: "#27ae60", marginBottom: "10px", fontFamily: "'Cairo', sans-serif" }}>➕ رقم جديد</div>
                <input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                  placeholder="الاسم (مثال: 🏥 مشفى)"
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #a9dfbf", fontFamily: "'Cairo', sans-serif", marginBottom: "8px", boxSizing: "border-box" }} />
                <input value={form.number} onChange={e => setForm(p => ({ ...p, number: e.target.value }))}
                  placeholder="الرقم" type="tel"
                  style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #a9dfbf", fontFamily: "'Cairo', sans-serif", marginBottom: "10px", boxSizing: "border-box", direction: "ltr" }} />
                <div style={{ fontSize: "12px", color: "#888", marginBottom: "6px", fontFamily: "'Cairo', sans-serif" }}>اختر اللون:</div>
                <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                  {COLOR_PRESETS.map((p, i) => (
                    <div key={i} onClick={() => setForm(f => ({ ...f, color: p.color, bg: p.bg }))}
                      style={{ width: "32px", height: "32px", borderRadius: "50%", background: p.color, cursor: "pointer", border: form.color === p.color ? "3px solid #333" : "3px solid transparent" }} />
                  ))}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={addContact}
                    style={{ flex: 1, padding: "10px", background: "#27ae60", color: "#fff", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>إضافة</button>
                  <button onClick={() => { setShowAddForm(false); setForm({ label: "", number: "", color: "#e74c3c", bg: "#fdedec" }); }}
                    style={{ flex: 1, padding: "10px", background: "#f0f0f0", border: "none", borderRadius: "8px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setShowAddForm(true); setForm({ label: "", number: "", color: "#e74c3c", bg: "#fdedec" }); }}
                style={{ width: "100%", padding: "12px", background: "#eafaf1", border: "2px dashed #a9dfbf", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "13px", color: "#27ae60", cursor: "pointer", marginBottom: "10px" }}>
                ➕ إضافة رقم جديد
              </button>
            )}
            <button onClick={() => setShowEditModal(false)}
              style={{ width: "100%", padding: "14px", background: "#f0f0f0", border: "none", borderRadius: "12px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "14px", cursor: "pointer" }}>
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== COMPONENT: CURRENCY CALCULATOR ====================
function CurrencyCalculator({ onBack, isAdmin, adminRole }) {
  const [amount, setAmount] = useState(100);
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [rates, setRates] = useState({ USD: 1, TRY: 32.5, SYP: 12900, SYP_OLD: 1290000 });
  const [editRates, setEditRates] = useState({ USD: 1, TRY: 32.5, SYP: 12900 });
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const currencyLabels = {
    USD: "💵 دولار أمريكي",
    TRY: "🇹🇷 ليرة تركية",
    SYP: "🇸🇾 ليرة سورية",
    SYP_OLD: "🕰️ ليرة سورية قديمة",
  };

  const currencyColors = {
    USD: "#22c55e",
    TRY: "#f97316",
    SYP: "#3b82f6",
    SYP_OLD: "#a855f7",
  };

  // جلب الأسعار من Supabase عند التحميل
  useEffect(() => {
    loadRatesFromSupabase();
  }, []);

  const loadRatesFromSupabase = async () => {
    setLoading(true);
    try {
      const [rateUSD, rateTRY, rateSYP] = await Promise.all([
        supabase("settings", "GET", null, "?key=eq.rate_USD"),
        supabase("settings", "GET", null, "?key=eq.rate_TRY"),
        supabase("settings", "GET", null, "?key=eq.rate_SYP"),
      ]);

      const newRates = {
        USD: 1,
        TRY: rateTRY && rateTRY[0] ? parseFloat(rateTRY[0].value) : 32.5,
        SYP: rateSYP && rateSYP[0] ? parseFloat(rateSYP[0].value) : 12900,
      };
      newRates.SYP_OLD = newRates.SYP * 100;

      setRates(newRates);
      setEditRates({ USD: 1, TRY: newRates.TRY, SYP: newRates.SYP });
      setLastUpdate(new Date());
    } catch (err) {
      console.error("خطأ في جلب الأسعار:", err);
    }
    setLoading(false);
  };

  const handleSaveRates = async () => {
    if (!isAdmin || adminRole !== "super") return;
    setSaving(true);
    try {
      // التحقق من التحديث أو الإنشاء للدولار
      const usdExists = await supabase("settings", "GET", null, "?key=eq.rate_USD");
      if (usdExists && usdExists.length > 0) {
        await supabase("settings", "PATCH", { value: "1" }, "?key=eq.rate_USD");
      } else {
        await supabase("settings", "POST", { key: "rate_USD", value: "1" });
      }

      // التحقق من التحديث أو الإنشاء للليرة التركية
      const tryExists = await supabase("settings", "GET", null, "?key=eq.rate_TRY");
      if (tryExists && tryExists.length > 0) {
        await supabase("settings", "PATCH", { value: editRates.TRY.toString() }, "?key=eq.rate_TRY");
      } else {
        await supabase("settings", "POST", { key: "rate_TRY", value: editRates.TRY.toString() });
      }

      // التحقق من التحديث أو الإنشاء للليرة السورية
      const sypExists = await supabase("settings", "GET", null, "?key=eq.rate_SYP");
      if (sypExists && sypExists.length > 0) {
        await supabase("settings", "PATCH", { value: editRates.SYP.toString() }, "?key=eq.rate_SYP");
      } else {
        await supabase("settings", "POST", { key: "rate_SYP", value: editRates.SYP.toString() });
      }

      // تحديث الحالة المحلية
      const newRates = {
        USD: 1,
        TRY: editRates.TRY,
        SYP: editRates.SYP,
      };
      newRates.SYP_OLD = newRates.SYP * 100;
      setRates(newRates);
      setLastUpdate(new Date());
      alert("✅ تم حفظ الأسعار بنجاح!");
    } catch (err) {
      console.error("خطأ في حفظ الأسعار:", err);
      alert("❌ حدث خطأ في حفظ الأسعار");
    }
    setSaving(false);
  };

  const convertCurrency = (value, from, to) => {
    const usdValue = value / rates[from];
    return (usdValue * rates[to]).toFixed(2);
  };

  const getAllCurrencies = () => ["USD", "TRY", "SYP", "SYP_OLD"].filter(c => c !== baseCurrency);

  return (
    <div style={{ padding: "20px 16px", paddingBottom: "80px", direction: "rtl", fontFamily: "'Cairo', sans-serif" }}>
      {/* رأس الصفحة */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", padding: 0 }}>
          ←
        </button>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "800", color: "#1f2937", flex: 1 }}>💱 حاسبة العملات</h2>
        <button 
          onClick={loadRatesFromSupabase}
          disabled={loading}
          style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "جاري التحديث..." : "🔄 تحديث"}
        </button>
      </div>

      {/* معلومات آخر تحديث */}
      <div style={{ background: "#f0f9ff", borderRadius: "8px", padding: "12px", marginBottom: "20px", fontSize: "12px", color: "#0369a1", textAlign: "center" }}>
        📅 آخر تحديث: {lastUpdate.toLocaleString("ar-SA")}
      </div>

      {/* حقل المبلغ */}
      <div style={{ background: "#f9fafb", borderRadius: "12px", padding: "16px", marginBottom: "20px" }}>
        <label style={{ display: "block", fontWeight: "700", marginBottom: "8px", color: "#1f2937", fontSize: "14px" }}>
          المبلغ
        </label>
        <input 
          type="number" 
          value={amount === 0 ? "" : amount}
          onChange={(e) => {
            const value = e.target.value;
            if (value === "") {
              setAmount("");
            } else {
              const numValue = parseFloat(value);
              setAmount(isNaN(numValue) ? "" : numValue);
            }
          }}
          onBlur={(e) => {
            if (e.target.value === "" || isNaN(parseFloat(e.target.value))) {
              setAmount(100);
            }
          }}
          placeholder="أدخل المبلغ"
          style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "2px solid #e5e7eb", fontFamily: "'Cairo', sans-serif", fontSize: "14px", boxSizing: "border-box" }}
        />
      </div>

      {/* اختيار العملة الأساسية */}
      <div style={{ background: "#f9fafb", borderRadius: "12px", padding: "16px", marginBottom: "24px" }}>
        <label style={{ display: "block", fontWeight: "700", marginBottom: "12px", color: "#1f2937", fontSize: "14px" }}>
          العملة الأساسية
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          {["USD", "TRY", "SYP", "SYP_OLD"].map(curr => (
            <button
              key={curr}
              onClick={() => setBaseCurrency(curr)}
              style={{
                padding: "12px",
                borderRadius: "8px",
                border: baseCurrency === curr ? `2px solid ${currencyColors[curr]}` : "2px solid #e5e7eb",
                background: baseCurrency === curr ? `${currencyColors[curr]}20` : "#fff",
                color: baseCurrency === curr ? currencyColors[curr] : "#6b7280",
                fontWeight: baseCurrency === curr ? "700" : "600",
                cursor: "pointer",
                fontSize: "12px",
                fontFamily: "'Cairo', sans-serif",
              }}
            >
              {currencyLabels[curr]}
            </button>
          ))}
        </div>
      </div>

      {/* عرض النتائج */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ fontWeight: "700", marginBottom: "12px", color: "#1f2937", fontSize: "14px" }}>النتائج</div>
        {getAllCurrencies().map(curr => {
          const converted = convertCurrency(amount, baseCurrency, curr);
          return (
            <div key={curr} style={{ background: "#fff", borderRadius: "12px", padding: "16px", marginBottom: "12px", border: `2px solid ${currencyColors[curr]}30` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div>
                  <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>{currencyLabels[curr]}</div>
                  <div style={{ fontSize: "24px", fontWeight: "800", color: currencyColors[curr] }}>{converted}</div>
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>سعر الصرف</div>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: "#1f2937" }}>
                    1 {baseCurrency} = {(rates[curr] / rates[baseCurrency]).toFixed(2)} {curr}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* لوحة تحكم المدير */}
      {isAdmin && adminRole === "super" && (
        <div style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)", borderRadius: "16px", padding: "20px", color: "#fff", marginBottom: "20px" }}>
          <div style={{ fontWeight: "800", fontSize: "16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            🔐 لوحة تحكم المدير
          </div>

          {/* أسعار الصرف */}
          <div style={{ background: "rgba(255, 255, 255, 0.1)", borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
            <div style={{ fontWeight: "700", marginBottom: "12px", fontSize: "14px" }}>أسعار الصرف مقابل الدولار</div>

            {/* سعر الدولار (معطّل) */}
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "6px", opacity: 0.9 }}>سعر الدولار (ثابت)</label>
              <input 
                type="number" 
                value={1}
                disabled
                style={{ width: "100%", padding: "10px", borderRadius: "8px", background: "rgba(0,0,0,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", fontFamily: "'Cairo', sans-serif", fontSize: "13px", boxSizing: "border-box", opacity: 0.6 }}
              />
            </div>

            {/* سعر الليرة التركية */}
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "6px", opacity: 0.9 }}>سعر الليرة التركية</label>
              <input 
                type="number" 
                value={editRates.TRY}
                onChange={(e) => setEditRates({ ...editRates, TRY: parseFloat(e.target.value) || 0 })}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", background: "rgba(0,0,0,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", fontFamily: "'Cairo', sans-serif", fontSize: "13px", boxSizing: "border-box" }}
              />
            </div>

            {/* سعر الليرة السورية */}
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "6px", opacity: 0.9 }}>سعر الليرة السورية</label>
              <input 
                type="number" 
                value={editRates.SYP}
                onChange={(e) => setEditRates({ ...editRates, SYP: parseFloat(e.target.value) || 0 })}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", background: "rgba(0,0,0,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", fontFamily: "'Cairo', sans-serif", fontSize: "13px", boxSizing: "border-box" }}
              />
            </div>

            {/* ملاحظة تلقائية */}
            <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "12px", padding: "8px", background: "rgba(0,0,0,0.2)", borderRadius: "6px" }}>
              ℹ️ ملاحظة: سعر الليرة القديمة = {editRates.SYP} × 100 = {(editRates.SYP * 100).toLocaleString("ar-SA")}
            </div>
          </div>

          {/* زر الحفظ */}
          <button 
            onClick={handleSaveRates}
            disabled={saving}
            style={{
              width: "100%",
              padding: "14px",
              background: saving ? "#10b981" : "#22c55e",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              fontFamily: "'Cairo', sans-serif",
              fontWeight: "800",
              fontSize: "14px",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "جاري الحفظ..." : "💾 حفظ الأسعار"}
          </button>
        </div>
      )}
    </div>
  );
}

// ==================== GLOBAL STYLES ====================
const GlobalStyles = () => (
  <style>{`
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    @keyframes shimmer {
      0% { background-position: -1000px 0; }
      100% { background-position: 1000px 0; }
    }

    @keyframes glow {
      0%, 100% { box-shadow: 0 0 20px rgba(0,0,0,0.1); }
      50% { box-shadow: 0 0 30px rgba(0,150,200,0.3); }
    }
    
    * {
      box-sizing: border-box;
    }
    
    html, body {
      margin: 0;
      padding: 0;
      direction: rtl;
      font-family: 'Cairo', sans-serif;
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      color: #2c3e50;
      overflow-x: hidden;
    }

    /* Scrollbar Styling */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 10px;
    }

    ::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, #3498db, #2980b9);
      border-radius: 10px;
      cursor: pointer;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(180deg, #2980b9, #1f618d);
    }

    /* Selection Styling */
    ::selection {
      background: #3498db;
      color: white;
    }

    /* Input & Button Base Styles */
    input, textarea, button, select {
      font-family: 'Cairo', sans-serif;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    button {
      cursor: pointer;
      border: none;
      outline: none;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 600;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
      position: relative;
      overflow: hidden;
    }

    button::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.3);
      transform: translate(-50%, -50%);
      transition: width 0.6s, height 0.6s;
    }

    button:hover::before {
      width: 300px;
      height: 300px;
    }

    button:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
    }

    button:active {
      transform: translateY(-1px);
    }

    /* Input Styles */
    input[type="text"], 
    input[type="email"], 
    input[type="password"],
    textarea {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 14px;
      background: white;
      color: #2c3e50;
      transition: all 0.3s ease;
    }

    input[type="text"]:focus, 
    input[type="email"]:focus, 
    input[type="password"]:focus,
    textarea:focus {
      border-color: #3498db;
      box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
      background: #f8fbff;
    }

    /* Card Styles */
    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
      padding: 16px;
      transition: all 0.3s ease;
      border: 1px solid #ecf0f1;
    }

    .card:hover {
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      transform: translateY(-4px);
    }

    /* Badge Styles */
    .badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    /* Link Styles */
    a {
      color: #3498db;
      text-decoration: none;
      transition: color 0.3s ease;
      border-bottom: 2px solid transparent;
      padding-bottom: 2px;
    }

    a:hover {
      color: #2980b9;
      border-bottom-color: #2980b9;
    }

    /* Divider */
    hr {
      border: none;
      height: 2px;
      background: linear-gradient(90deg, transparent, #bdc3c7, transparent);
      margin: 20px 0;
    }
  `}</style>
);

// ==================== MAIN APP ====================

function App() {
  const [currentPage, setCurrentPage]       = useState("home");
  const [drawerOpen, setDrawerOpen]         = useState(false);
  const [searchOpen, setSearchOpen]         = useState(false);
  const [errorMessage, setErrorMessage]     = useState("");
  const [isAdmin, setIsAdmin]               = useState(false);
  const [adminRole, setAdminRole]           = useState(null);
  const [adminName, setAdminName]           = useState("");
  const [darkMode, setDarkMode]             = useState(false);
  const [tickerText, setTickerText]         = useState(MOCK_TICKER);
  const [editingTicker, setEditingTicker]   = useState(false);
  const [tempTicker, setTempTicker]         = useState("");
const [elecStatus, setElecStatus] = useState(
  () => localStorage.getItem("elec_status") || "on"
);  
  const [elecTime, setElecTime]             = useState(null);
  const [elecTimer, setElecTimer]           = useState("");
  const [elecReason, setElecReason]         = useState("");
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [tempReason, setTempReason]         = useState("");
  const [alertBanner, setAlertBanner]       = useState("");
  const [editingBanner, setEditingBanner]   = useState(false);
  const [tempBannerUrl, setTempBannerUrl] = useState("");
  const [tempBanner, setTempBanner]         = useState("");
  const [editorPerms, setEditorPerms]       = useState(DEFAULT_PERMS);
const [adBannerData, setAdBannerData] = useState(null); 
const [refreshing, setRefreshing] = useState(false);
const [pullStartY, setPullStartY] = useState(null);
const [pullDistance, setPullDistance] = useState(0);
const [showLoginModal, setShowLoginModal] = useState(false);
const [loginForm, setLoginForm] = useState({ username: "", password: "" });

  useEffect(() => { logVisitor(); }, []);
  
  async function handleRefresh() {
  setRefreshing(true);
  clearCache("categories"); clearCache("contacts");
  clearCache("news"); clearCache("obituaries");
  clearCache("ads"); clearCache("lost_found");
  clearCache("real_estate"); clearCache("mosques");
  const [ticker, elec, elecT, elecR, banner] = await Promise.all([
    supabase("settings", "GET", null, "?key=eq.ticker"),
    supabase("settings", "GET", null, "?key=eq.electricity"),
    supabase("settings", "GET", null, "?key=eq.electricity_time"),
    supabase("settings", "GET", null, "?key=eq.electricity_reason"),
    supabase("settings", "GET", null, "?key=eq.alert_banner"),
  ]);
  if (ticker && ticker[0]) setTickerText(ticker[0].value);
if (elec && elec[0]) {
  setElecStatus(elec[0].value);
  localStorage.setItem("elec_status", elec[0].value);
}  
  if (elecT  && elecT[0]) setElecTime(elecT[0].value);
  if (elecR  && elecR[0]) setElecReason(elecR[0].value);
  if (banner && banner[0]) setAlertBanner(banner[0].value);
  const adBanner = await supabase("ads_banner", "GET", null, "?limit=1");
  if (adBanner && adBanner[0]) setAdBannerData(adBanner[0]);
  setRefreshing(false);
  setPullDistance(0);
}

// التحكم بزر الرجوع في الهاتف
const prevPageRef = useRef("home");

useEffect(() => {
  if (currentPage !== "home" && prevPageRef.current !== currentPage) {
    window.history.pushState({ page: currentPage }, "");
  }
  prevPageRef.current = currentPage;
}, [currentPage]);

const [showExitDialog, setShowExitDialog] = useState(false);

useEffect(() => {
  window.history.replaceState({ page: "home" }, "");

  const handleBack = (e) => {
    const targetPage = e.state?.page || "home";
    if (targetPage === "home" && currentPage === "home") {
      // المستخدم في الهوم وضغط رجوع → أعد الـ entry وأظهر الحوار
      window.history.pushState({ page: "home" }, "");
      setShowExitDialog(true);
    } else {
      setCurrentPage(targetPage);
    }
  };

  window.addEventListener("popstate", handleBack);
  return () => window.removeEventListener("popstate", handleBack);
}, [currentPage]);

  // Load all settings at once
  useEffect(() => {
    async function loadSettings() {
      const [ticker, elec, elecT, elecR, banner, perms] = await Promise.all([
        supabase("settings", "GET", null, "?key=eq.ticker"),
        supabase("settings", "GET", null, "?key=eq.electricity"),
        supabase("settings", "GET", null, "?key=eq.electricity_time"),
        supabase("settings", "GET", null, "?key=eq.electricity_reason"),
        supabase("settings", "GET", null, "?key=eq.alert_banner"),
        supabase("settings", "GET", null, "?key=eq.editor_permissions"),
      ]);
      if (ticker && ticker[0])  setTickerText(ticker[0].value);
if (elec && elec[0]) {
  setElecStatus(elec[0].value);
  localStorage.setItem("elec_status", elec[0].value);
}      
      if (elecT  && elecT[0])   setElecTime(elecT[0].value);
      if (elecR  && elecR[0])   setElecReason(elecR[0].value);
      if (banner && banner[0])  setAlertBanner(banner[0].value);
      if (perms  && perms[0])   { 
        try { setEditorPerms({ ...DEFAULT_PERMS, ...JSON.parse(perms[0].value) }); } catch {}
      }
      const adBanner = await supabase("ads_banner", "GET", null, "?limit=1");
if (adBanner && adBanner[0]) setAdBannerData(adBanner[0]);
    }
    loadSettings();
    const interval = setInterval(async () => {
      const [elec, elecR] = await Promise.all([
        supabase("settings", "GET", null, "?key=eq.electricity"),
        supabase("settings", "GET", null, "?key=eq.electricity_reason"),
      ]);
      if (elec  && elec[0])  setElecStatus(elec[0].value);
      if (elecR && elecR[0]) setElecReason(elecR[0].value);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Electricity elapsed timer
  useEffect(() => {
    if (!elecTime) return;
    const update = () => {
      const diff = Date.now() - new Date(elecTime).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setElecTimer(h > 0 ? `منذ ${h} ساعة و${m} دقيقة` : `منذ ${m} دقيقة`);
    };
    update();
    const iv = setInterval(update, 60000);
    return () => clearInterval(iv);
  }, [elecTime]);

  // Save helpers
  const saveTicker = async (text) => {
    const ex = await supabase("settings", "GET", null, "?key=eq.ticker");
    if (ex && ex.length > 0) await supabase("settings", "PATCH", { value: text }, "?key=eq.ticker");
    else await supabase("settings", "POST", { key: "ticker", value: text });
    setTickerText(text);
  };


  const saveBanner = async (text, url = "") => {
  const value = url ? JSON.stringify({ text, url }) : text;
  const ex = await supabase("settings", "GET", null, "?key=eq.alert_banner");
  if (ex && ex.length > 0) await supabase("settings", "PATCH", { value }, "?key=eq.alert_banner");
  else await supabase("settings", "POST", { key: "alert_banner", value });
  setAlertBanner(value);
};

  // Electricity toggle — if turning off → show reason modal first
  const toggleElectricity = () => {
    if (elecStatus === "on") { setTempReason(""); setShowReasonModal(true); }
    else applyElecChange("on", "");
  };

  const applyElecChange = async (newStatus, reason) => {
    const now = new Date().toISOString();
    for (const [key, val] of [["electricity", newStatus], ["electricity_time", now], ["electricity_reason", reason]]) {
      const ex = await supabase("settings", "GET", null, `?key=eq.${key}`);
      if (ex && ex.length > 0) await supabase("settings", "PATCH", { value: val }, `?key=eq.${key}`);
      else await supabase("settings", "POST", { key, value: val });
    }
setElecStatus(newStatus);
localStorage.setItem("elec_status", newStatus);
setElecTime(now);
setElecReason(reason);    
    await sendNotification(
      newStatus === "off" ? "⚡ انقطاع الكهرباء" : "✅ عادت الكهرباء",
      newStatus === "off" ? (reason ? `السبب: ${reason}` : "تم إيقاف التيار الكهربائي") : "تم استعادة التيار الكهربائي",
      "electricity"
    );
  };

  const handleAdminToggle = async () => {
    if (isAdmin) { setIsAdmin(false); setAdminRole(null); setAdminName(""); return; }
    setShowLoginModal(true);
  };

  const handleLogin = async () => {
    if (!loginForm.username.trim() || !loginForm.password.trim()) {
      alert("اسم المستخدم وكلمة المرور مطلوبان!");
      return;
    }
    const hp = await hashPassword(loginForm.password);
    const data = await supabase("admins", "GET", null, `?username=eq.${encodeURIComponent(loginForm.username)}&password=eq.${encodeURIComponent(hp)}`);
    if (data && data.length > 0) { 
      setIsAdmin(true); 
      setAdminRole(data[0].role); 
      setAdminName(data[0].username);
      setShowLoginModal(false);
      setLoginForm({ username: "", password: "" });
    }
    else alert("اسم المستخدم أو كلمة المرور خاطئة!");
  };

  const pageTitle = {
    home: "دليل بنش", contacts: "جهات الاتصال", news: "الأخبار",
    obituary: "الوفيات", lost: "المفقودات والموجودات", ads: "الإعلانات",
    links: "روابط مهمة", transport: "التوصيل والمواصلات",
    mosques: "المساجد", cityservices: "خدمات المدينة", settings: "الإعدادات", 
    currency: "💱 حاسبة العملات",
  };

  const canElec = canDo("electricity", isAdmin, adminRole, editorPerms);

  return (
  <div
style={{ width: "100%", maxWidth: "100%", margin: "0 auto", minHeight: "100vh", background: darkMode ? "#1a1a2e" : "#f5f6fa", direction: "rtl", fontFamily: "'Cairo', sans-serif", overflowX: "hidden" }}  onTouchStart={e => {
    if (window.scrollY === 0) setPullStartY(e.touches[0].clientY);
  }}
  onTouchMove={e => {
    if (pullStartY === null) return;
    const dist = e.touches[0].clientY - pullStartY;
    if (dist > 0 && dist < 120) setPullDistance(dist);
  }}
  onTouchEnd={() => {
    if (pullDistance > 70) handleRefresh();
    else setPullDistance(0);
    setPullStartY(null);
  }}
>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; } body { margin: 0; }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } } 
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes flipToAd {
  0%   { transform: rotateY(0deg); }
  100% { transform: rotateY(180deg); }
}
@keyframes flipToElec {
  0%   { transform: rotateY(180deg); }
  100% { transform: rotateY(0deg); }
}
.flip-card {
  perspective: 1000px;
  height: auto;
  min-height: 88px;
}
.flip-card {
  perspective: 1000px;
}
.flip-card {
  perspective: 1000px;
  margin: 12px 16px;
}
.flip-card-inner {
  position: relative;
  width: 100%;
  height: 88px;
  transform-style: preserve-3d;
  transition: transform 0.7s cubic-bezier(.4,0,.2,1);
}
.flip-card-inner.flipped {
  transform: rotateY(180deg);
}
.flip-card-front,
.flip-card-back {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  border-radius: 14px;
  overflow: hidden;
}
.flip-card-back {
  transform: rotateY(180deg);
}
      `}</style>

      {/* Error Alert */}
      <ErrorAlert message={errorMessage} onClose={() => setErrorMessage("")} />

      {/* مؤشر السحب للتحديث */}
{(pullDistance > 0 || refreshing) && (
  <div style={{
    position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)",
    zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
    width: "100%", maxWidth: "430px",
    height: `${refreshing ? 60 : Math.min(pullDistance, 60)}px`,
    transition: refreshing ? "none" : "height 0.1s",
    background: darkMode ? "#1a1a2e" : "#f5f6fa",
    overflow: "hidden",
  }}>
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
      opacity: refreshing ? 1 : pullDistance / 70,
      transition: "opacity 0.2s",
    }}>
      <div style={{
        width: "24px", height: "24px", border: "3px solid #2980b9",
        borderTopColor: "transparent", borderRadius: "50%",
        animation: refreshing ? "spin 0.8s linear infinite" : "none",
        transform: refreshing ? "none" : `rotate(${pullDistance * 3}deg)`,
      }} />
      <span style={{
        fontSize: "11px", color: "#2980b9",
        fontFamily: "'Cairo', sans-serif", fontWeight: "700",
      }}>
        {refreshing ? "جاري التحديث..." : pullDistance > 70 ? "اترك للتحديث" : "اسحب للتحديث"}
      </span>
    </div>
  </div>
)}

{/* ── Header ── */}



      <div style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 8px 24px rgba(102, 126, 234, 0.3)", backdropFilter: "blur(10px)" }}>
        <button onClick={() => setDrawerOpen(true)} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "12px", padding: "10px", cursor: "pointer", transition: "all 0.3s", hover: { background: "rgba(255,255,255,0.3)", transform: "scale(1.05)" } }}>
          <Icon name="menu" size={24} color="#fff" />
        </button>
        <span style={{ color: "#fff", fontWeight: "900", fontSize: "18px", letterSpacing: "0.5px", textShadow: "0 2px 8px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: "8px" }}><BanshLogo size={20} /> {pageTitle[currentPage] || "دليل بنش"}</span>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {/* 🔍 زر البحث الشامل */}
          <button onClick={() => setSearchOpen(true)} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "12px", padding: "10px", cursor: "pointer", transition: "all 0.3s" }}>
            <Icon name="search" size={22} color="#fff" />
          </button>
          {currentPage !== "home" ? (
            <button onClick={() => setCurrentPage("home")} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "12px", padding: "10px", cursor: "pointer", transition: "all 0.3s" }}>
              <Icon name="home" size={22} color="#fff" />
            </button>
          ) : (
            <NotifBell isAdmin={isAdmin} onNavigate={setCurrentPage} />
          )}
        </div>
      </div>

      
      {alertBanner && alertBanner.trim() !== "" && (() => {
  let bannerText = alertBanner;
  let bannerUrl = "";
  try {
    const parsed = JSON.parse(alertBanner);
    bannerText = parsed.text;
    bannerUrl = parsed.url || "";
  } catch {}
  
  const inner = (
    <div style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", color: "#fff", padding: "14px 16px", textAlign: "center", fontFamily: "'Cairo', sans-serif", fontWeight: "700", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)", animation: "pulse 2s infinite", cursor: bannerUrl ? "pointer" : "default", textDecoration: "none" }}>
      <span>🎯 {bannerText}</span>
      {bannerUrl && <span style={{ fontSize: "11px", background: "rgba(255,255,255,0.25)", borderRadius: "6px", padding: "2px 8px" }}>اضغط للانتقال ↗</span>}
      {isAdmin && <button onClick={e => { e.preventDefault(); e.stopPropagation(); saveBanner(""); }} style={{ background: "rgba(255,255,255,0.3)", border: "none", borderRadius: "8px", color: "#fff", padding: "4px 12px", cursor: "pointer", fontSize: "12px", fontFamily: "'Cairo', sans-serif", fontWeight: "600" }}>✕ مسح</button>}
    </div>
  );

  return bannerUrl 
    ? <a href={bannerUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", textDecoration: "none" }}>{inner}</a>
    : inner;
})()}
      {isAdmin && (!alertBanner || alertBanner.trim() === "") && (
        <div onClick={() => { setTempBanner(""); setEditingBanner(true); }} style={{ background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0)", color: "#059669", textAlign: "center", padding: "12px", fontSize: "12px", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: "700", borderBottom: "2px solid #6ee7b7", transition: "all 0.3s" }}>
          ➕ إضافة إشعار خاص (صلاة، طارئ...)
        </div>
      )}

      {/* ── Ticker ── */}
      <NewsTicker
        text={tickerText}
        isAdmin={isAdmin && adminRole === "super"}
        onEdit={() => { setTempTicker(tickerText); setEditingTicker(true); }}
      />

      {/* ── Pages ── */}
      <div style={{ paddingBottom: "20px" }}>
        {currentPage === "home" && (
          <>
            <ElectricityAdCard
              elecStatus={elecStatus}
              elecTimer={elecTimer}
              elecReason={elecReason}
              isAdmin={canElec}
              onToggle={toggleElectricity}
              adData={adBannerData}
            />
            <HomeGrid onNavigate={setCurrentPage} />
          </>
        )}
        {currentPage === "contacts"    && <ContactsPage    isAdmin={isAdmin} adminRole={adminRole} editorPerms={editorPerms} />}
        {currentPage === "news"        && <NewsPage         isAdmin={isAdmin} adminRole={adminRole} editorPerms={editorPerms} />}
        {currentPage === "obituary"    && <ObituaryPage     isAdmin={isAdmin} adminRole={adminRole} editorPerms={editorPerms} />}
        {currentPage === "ads"         && <AdsPage          isAdmin={isAdmin} adminRole={adminRole} editorPerms={editorPerms} />}
        {currentPage === "lost"        && <LostFoundPage    isAdmin={isAdmin} adminRole={adminRole} editorPerms={editorPerms} />}
        {currentPage === "links"       && <LinksPage        isAdmin={isAdmin} adminRole={adminRole} editorPerms={editorPerms} />}
        {currentPage === "transport"   && <TransportPage    isAdmin={isAdmin} adminRole={adminRole} editorPerms={editorPerms} />}
        {currentPage === "mosques"     && <MosquesPage      isAdmin={isAdmin} adminRole={adminRole} editorPerms={editorPerms} />}
        {currentPage === "cityservices"&& <CityServicesPage isAdmin={isAdmin} adminRole={adminRole} editorPerms={editorPerms} />} 
        {currentPage === "currency" && <CurrencyCalculator onBack={() => setCurrentPage("home")} isAdmin={isAdmin} adminRole={adminRole} />}
          {currentPage === "realestate" && <RealEstatePage isAdmin={isAdmin} adminRole={adminRole} editorPerms={editorPerms} />}
        {currentPage === "admin_dashboard" && <AdminDashboard onBack={() => setCurrentPage("settings")} isAdmin={isAdmin} adminRole={adminRole} supabase={supabase} />}
        {currentPage === "settings"    && <SettingsPage     isAdmin={isAdmin} adminRole={adminRole} darkMode={darkMode} setDarkMode={setDarkMode} editorPerms={editorPerms} setEditorPerms={setEditorPerms} onNavigate={setCurrentPage} />}
      </div>

      {/* ── Drawer ── */}
      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} currentPage={currentPage} onNavigate={setCurrentPage}
        isAdmin={isAdmin} adminRole={adminRole} adminName={adminName} onAdminToggle={handleAdminToggle} darkMode={darkMode} />

      {/* ── Global Search Overlay ── */}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} onNavigate={page => { setCurrentPage(page); setSearchOpen(false); }} />}

      {/* ── Edit Ticker Modal ── */}
      {editingTicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "20px", width: "100%" }}>
            <div style={{ fontWeight: "800", marginBottom: "12px", fontSize: "15px" }}>تعديل الشريط الإخباري</div>
            <textarea value={tempTicker} onChange={e => setTempTicker(e.target.value)} rows={4}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1.5px solid #ddd", fontFamily: "'Cairo', sans-serif", fontSize: "13px", resize: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <button onClick={async () => { await saveTicker(tempTicker); setEditingTicker(false); }}
                style={{ flex: 1, padding: "12px", background: "#2980b9", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>حفظ</button>
              <button onClick={() => setEditingTicker(false)}
                style={{ flex: 1, padding: "12px", background: "#f0f0f0", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Banner Modal ── */}
      {editingBanner && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "20px", width: "100%" }}>
            <div style={{ fontWeight: "800", marginBottom: "12px", fontSize: "15px" }}>✏️ إشعار خاص</div>
            <textarea value={tempBanner} onChange={e => setTempBanner(e.target.value)}
              placeholder="مثال: حان وقت صلاة الخسوف — اتجهوا للمساجد" rows={3}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1.5px solid #ddd", fontFamily: "'Cairo', sans-serif", fontSize: "13px", resize: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <button onClick={async () => { await saveBanner(tempBanner); setEditingBanner(false); }}
                style={{ flex: 1, padding: "12px", background: "#1a8a4a", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>حفظ</button>
              <button onClick={() => setEditingBanner(false)}    

              
              
              
                style={{ flex: 1, padding: "12px", background: "#f0f0f0", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
      {/* ── Electricity Reason Modal ── */}
      {showReasonModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "20px", width: "100%" }}>
            <div style={{ fontWeight: "800", marginBottom: "6px", fontSize: "16px", color: "#e74c3c" }}>⚡ سبب قطع الكهرباء</div>
            <div style={{ fontSize: "12px", color: "#888", marginBottom: "14px", fontFamily: "'Cairo', sans-serif" }}>اكتب سبب الانقطاع (اختياري)</div>
            <textarea value={tempReason} onChange={e => setTempReason(e.target.value)}
              placeholder="مثال: صيانة في الشبكة • أعمال حفر • عطل مفاجئ..." rows={3}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1.5px solid #f0b27a", fontFamily: "'Cairo', sans-serif", fontSize: "13px", resize: "none", boxSizing: "border-box", marginBottom: "12px" }} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={async () => { setShowReasonModal(false); await applyElecChange("off", tempReason); }}
                style={{ flex: 1, padding: "12px", background: "#e74c3c", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>
                تأكيد القطع ⚡
              </button>
              <button onClick={() => setShowReasonModal(false)}
                style={{ flex: 1, padding: "12px", background: "#f0f0f0", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
<SOSButton isAdmin={isAdmin} adminRole={adminRole} />

      {/* ── Exit Confirmation Dialog ── */}
      {showExitDialog && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px",
          animation: "fadeInUp 0.2s ease",
        }}>
          <div style={{
            background: "#fff",
            borderRadius: "20px",
            padding: "28px 24px",
            width: "100%",
            maxWidth: "320px",
            textAlign: "center",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>👋</div>
            <div style={{
              fontFamily: "'Cairo', sans-serif",
              fontWeight: "800",
              fontSize: "18px",
              color: "#2c3e50",
              marginBottom: "8px",
            }}>
              هل تريد الخروج؟
            </div>
            <div style={{
              fontFamily: "'Cairo', sans-serif",
              fontSize: "13px",
              color: "#888",
              marginBottom: "24px",
              lineHeight: "1.7",
            }}>
              سيتم إغلاق تطبيق دليل بنش
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => {
                  setShowExitDialog(false);
                  if (window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches) {
                    window.close();
                  }
                }}
                style={{
                  flex: 1, padding: "13px",
                  background: "linear-gradient(135deg,#e74c3c,#c0392b)",
                  color: "#fff", border: "none",
                  borderRadius: "12px",
                  fontFamily: "'Cairo', sans-serif",
                  fontWeight: "800", fontSize: "14px",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(231,76,60,0.4)",
                }}>
                خروج 🚪
              </button>
              <button
                onClick={() => setShowExitDialog(false)}
                style={{
                  flex: 1, padding: "13px",
                  background: "#f0f0f0",
                  color: "#2c3e50", border: "none",
                  borderRadius: "12px",
                  fontFamily: "'Cairo', sans-serif",
                  fontWeight: "700", fontSize: "14px",
                  cursor: "pointer",
                }}>
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Login Modal ── */}
      {showLoginModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "20px", width: "100%" }}>
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div style={{ fontSize: "48px", marginBottom: "8px" }}>🔐</div>
              <div style={{ fontWeight: "800", fontSize: "18px", color: "#8e44ad", fontFamily: "'Cairo', sans-serif" }}>دخول الإدارة</div>
            </div>
            <input 
              type="text" 
              value={loginForm.username} 
              onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
              placeholder="اسم المستخدم"
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1.5px solid #ddd", fontFamily: "'Cairo', sans-serif", fontSize: "13px", marginBottom: "10px", boxSizing: "border-box" }} 
            />
            <input 
              type="password" 
              value={loginForm.password} 
              onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
              placeholder="كلمة المرور"
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1.5px solid #ddd", fontFamily: "'Cairo', sans-serif", fontSize: "13px", marginBottom: "16px", boxSizing: "border-box" }} 
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={handleLogin}
                style={{ flex: 1, padding: "12px", background: "#8e44ad", color: "#fff", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", fontWeight: "700", cursor: "pointer" }}>
                دخول
              </button>
              <button onClick={() => { setShowLoginModal(false); setLoginForm({ username: "", password: "" }); }}
                style={{ flex: 1, padding: "12px", background: "#f0f0f0", border: "none", borderRadius: "10px", fontFamily: "'Cairo', sans-serif", cursor: "pointer" }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ==================== EXPORT WITH ERROR BOUNDARY ====================
export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <GlobalStyles />
      <App />
    </ErrorBoundary>
  );
}