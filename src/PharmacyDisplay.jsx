// ==================== PHARMACY SCHEDULE DISPLAY ====================
import React, { useState, useEffect } from "react";

export default function PharmacyDisplay({ supabase }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSchedule, setSelectedSchedule] = useState(null);

  useEffect(() => {
    loadSchedules();
  }, []);

  async function loadSchedules() {
    setLoading(true);
    try {
      const data = await supabase("pharmacy_schedules", "GET", null, "?is_active=eq.true&order=created_at.desc");
      if (data) {
        setSchedules(data);
        if (data.length > 0) {
          setSelectedSchedule(data[0]);
        }
      }
    } catch (error) {
      console.error("خطأ في تحميل جداول الصيدليات:", error);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{
        textAlign: "center",
        padding: "20px",
        fontFamily: "'Cairo', sans-serif",
      }}>
        جاري التحميل...
      </div>
    );
  }

  if (schedules.length === 0) {
    return null; // لا عرض إذا لم توجد جداول
  }

  return (
    <div style={{
      background: "#fff",
      borderRadius: "12px",
      padding: "16px",
      marginBottom: "20px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    }}>
      {/* Header */}
      <div style={{
        fontSize: "18px",
        fontWeight: "800",
        color: "#c0392b",
        marginBottom: "12px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontFamily: "'Cairo', sans-serif",
      }}>
        💊 مناوبة الصيدليات
      </div>

      {/* Selected Schedule Image */}
      {selectedSchedule && (
        <div style={{
          marginBottom: "16px",
          borderRadius: "10px",
          overflow: "hidden",
          border: "2px solid #c0392b",
        }}>
          <img
            src={selectedSchedule.image_url}
            alt={selectedSchedule.title}
            style={{
              width: "100%",
              height: "auto",
              display: "block",
            }}
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        </div>
      )}

      {/* Title and Download Link */}
      {selectedSchedule && (
        <div style={{
          marginBottom: "16px",
        }}>
          <div style={{
            fontSize: "14px",
            fontWeight: "700",
            color: "#2c3e50",
            fontFamily: "'Cairo', sans-serif",
            marginBottom: "8px",
          }}>
            {selectedSchedule.title}
          </div>
          <div style={{
            fontSize: "12px",
            color: "#7f8c8d",
            fontFamily: "'Cairo', sans-serif",
          }}>
            تم التحديث: {new Date(selectedSchedule.updated_at).toLocaleDateString("ar-SA")}
          </div>
        </div>
      )}

      {/* Tabs for Multiple Schedules */}
      {schedules.length > 1 && (
        <div style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          overflowX: "auto",
          paddingBottom: "8px",
        }}>
          {schedules.map((schedule) => (
            <button
              key={schedule.id}
              onClick={() => setSelectedSchedule(schedule)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "none",
                fontFamily: "'Cairo', sans-serif",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer",
                background: selectedSchedule?.id === schedule.id ? "#c0392b" : "#ecf0f1",
                color: selectedSchedule?.id === schedule.id ? "#fff" : "#2c3e50",
                transition: "all 0.3s",
                whiteSpace: "nowrap",
              }}
            >
              {schedule.title}
            </button>
          ))}
        </div>
      )}

      {/* Download Button */}
      {selectedSchedule && (
        <div style={{
          marginTop: "12px",
        }}>
          <a
            href={selectedSchedule.image_url}
            download
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              padding: "10px 16px",
              background: "#c0392b",
              color: "#fff",
              borderRadius: "8px",
              textDecoration: "none",
              fontFamily: "'Cairo', sans-serif",
              fontSize: "13px",
              fontWeight: "700",
              cursor: "pointer",
              transition: "background 0.3s",
            }}
            onMouseEnter={(e) => (e.target.style.background = "#a93226")}
            onMouseLeave={(e) => (e.target.style.background = "#c0392b")}
          >
            📥 تحميل الصورة
          </a>
        </div>
      )}
    </div>
  );
}
