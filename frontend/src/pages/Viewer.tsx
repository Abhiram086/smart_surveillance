import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

export default function Viewer() {
  const [access, setAccess] = useState<'idle' | 'pending' | 'accepted' | 'rejected'>('idle');
  const [reqId, setReqId] = useState<string | null>(null);
  const [cameras, setCameras] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);

  const formatEventTime = (ts: number) => {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const requestAccess = async () => {
    try {
      const username = localStorage.getItem("username") || "Guest";
      const res = await fetch("http://127.0.0.1:8000/api/viewer/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      const data = await res.json();
      setReqId(data.request_id);
      setAccess('pending');
    } catch (e) {
      alert("Failed to connect to backend server.");
    }
  };

  const [sessionToken] = useState(() => new Date().getTime());

  const fetchFeeds = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/system/active_cameras");
      if (res.ok) {
        const activeCams: any[] = await res.json();
        const activeFeeds = activeCams.map((cam: any) => ({
          id: cam.camera_id,
          name: cam.name || "Surveillance Feed",
          scenario: cam.scenario,
          // Use static session token so the img element doesn't blink on every poll
          source: `http://127.0.0.1:8000/cameras/stream/${cam.camera_id}?t=${sessionToken}`
        }));
        // Only trigger a React state update if the cameras actually changed
        setCameras(prev => JSON.stringify(prev) !== JSON.stringify(activeFeeds) ? activeFeeds : prev);
      }
    } catch (e) { console.error("Could not fetch feeds"); }
  };

  // Effect 1: Poll for access approval
  useEffect(() => {
    let interval: any;
    if (access === 'pending' && reqId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`http://127.0.0.1:8000/api/viewer/status/${reqId}`);
          const data = await res.json();
          if (data.status === 'accepted') {
            setAccess('accepted');
          } else if (data.status === 'rejected') {
            setAccess('rejected');
          }
        } catch (e) { }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [access, reqId]);

  // Effect 2: Poll for live feeds constantly once accepted
  useEffect(() => {
    let interval: any;
    if (access === 'accepted') {
      fetchFeeds(); // fetch immediately
      interval = setInterval(() => fetchFeeds(), 3000); // then sync every 3 seconds
    }
    return () => clearInterval(interval);
  }, [access]);

  // Effect 3: Poll for live alerts/events once accepted
  useEffect(() => {
    let interval: any;
    if (access === 'accepted') {
      const pollEvents = () => {
        fetch("http://127.0.0.1:8000/api/stats")
          .then(res => res.json())
          .then(data => setEvents(data.events || []))
          .catch(() => {});
      };
      pollEvents();
      interval = setInterval(pollEvents, 2500);
    }
    return () => clearInterval(interval);
  }, [access]);

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/";
  };

  return (
    <div style={{ minHeight: "100vh", background: "#1a1a1a", color: "white", fontFamily: "Google Sans, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: "1200px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" }}>
        <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>🛡️ SMSS Live Viewer</h2>
        <button onClick={handleLogout} style={{ background: "#dc2626", color: "white", border: "none", padding: "8px 16px", borderRadius: "20px", cursor: "pointer", fontWeight: "bold" }}>Logout</button>
      </div>

      {access === 'idle' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: "center", marginTop: "100px" }}>
          <h1 style={{ fontSize: "32px", marginBottom: "10px" }}>Secure Feed Access</h1>
          <p style={{ color: "#9ca3af", marginBottom: "30px" }}>You must request access from the Administrator to view active feeds.</p>
          <button onClick={requestAccess} style={{ background: "#8b5cf6", color: "white", border: "none", padding: "16px 32px", borderRadius: "30px", fontSize: "18px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 10px 20px rgba(139, 92, 246, 0.3)" }}>
            Request Live Access
          </button>
        </motion.div>
      )}

      {access === 'pending' && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: "center", marginTop: "100px" }}>
          <div style={{ fontSize: "40px", marginBottom: "20px" }}>⏳</div>
          <h2 style={{ color: "#f59e0b" }}>Awaiting Approval...</h2>
          <p style={{ color: "#9ca3af" }}>The administrator has been notified. Please wait.</p>
        </motion.div>
      )}

      {access === 'rejected' && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: "center", marginTop: "100px" }}>
          <div style={{ fontSize: "40px", marginBottom: "20px" }}>❌</div>
          <h2 style={{ color: "#dc2626" }}>Access Denied</h2>
          <p style={{ color: "#9ca3af", marginBottom: "20px" }}>The administrator rejected your request.</p>
          <button onClick={() => setAccess('idle')} style={{ background: "#374151", color: "white", border: "none", padding: "10px 20px", borderRadius: "20px", cursor: "pointer" }}>Try Again</button>
        </motion.div>
      )}

      {access === 'accepted' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ width: "100%", maxWidth: "1200px" }}>
          <div style={{ background: "#16a34a", color: "white", padding: "12px 20px", borderRadius: "12px", marginBottom: "24px", display: "inline-block", fontWeight: "bold" }}>
            ✅ Access Granted. Feeds are synchronized.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "20px", alignItems: "start" }}>
            {/* LEFT: Camera Feeds */}
            <div>
              <div style={{ display: "grid", gridTemplateColumns: cameras.length === 1 ? "1fr" : "1fr 1fr", gap: "20px" }}>
                {cameras.map(cam => (
                  <div key={cam.id} style={{ background: "black", borderRadius: "16px", overflow: "hidden", border: "1px solid #374151" }}>
                    <img src={cam.source} alt="Live Feed" style={{ width: "100%", aspectRatio: "16/9", objectFit: "contain", display: "block" }} />
                  </div>
                ))}
              </div>
              {cameras.length === 0 && (
                <p style={{ color: "#9ca3af", textAlign: "center", marginTop: "50px" }}>No active cameras are currently being monitored by the admin.</p>
              )}
            </div>

            {/* RIGHT: Live Alerts Panel */}
            <div style={{ background: "#27272a", borderRadius: "16px", border: "1px solid #374151", padding: "20px", maxHeight: "600px", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <span style={{ fontWeight: 700, fontSize: "16px" }}>🔔 Live Alerts</span>
                <span style={{ fontSize: "12px", color: "#8b5cf6", fontWeight: 600 }}>
                  {events.filter(e => e.severity === 'error' || e.severity === 'warning').length} active
                </span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
                {events.length === 0 ? (
                  <div style={{ color: "#6b7280", textAlign: "center", marginTop: "40px", fontSize: "13px" }}>No events detected yet.</div>
                ) : (
                  events.map((evt: any, idx: number) => (
                    <div
                      key={evt.id || idx}
                      style={{
                        padding: "12px",
                        borderRadius: "12px",
                        background: "#1f1f23",
                        borderLeft: `4px solid ${evt.severity === 'error' ? '#ef4444' : evt.severity === 'warning' ? '#f59e0b' : '#3b82f6'}`,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 700, color: "#f3f4f6" }}>{evt.type}</span>
                          <span style={{ fontSize: "10px", fontWeight: 600, color: "#a78bfa", opacity: 0.8 }}>@{evt.name}</span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: "11px", color: "#9ca3af", display: "block" }}>{formatEventTime(evt.ts)}</span>
                          {evt.video_time && <span style={{ fontSize: "10px", color: "#8b5cf6", fontWeight: 600 }}>T+{evt.video_time}</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: "12px", color: "#d1d5db", lineHeight: 1.4 }}>{evt.message}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
