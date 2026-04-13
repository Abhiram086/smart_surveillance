import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

export default function Viewer() {
  const [access, setAccess] = useState<'idle' | 'pending' | 'accepted' | 'rejected'>('idle');
  const [reqId, setReqId] = useState<string | null>(null);
  const [cameras, setCameras] = useState<any[]>([]);

  const requestAccess = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/viewer/request", { method: "POST" });
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

          <div style={{ display: "grid", gridTemplateColumns: cameras.length === 1 ? "1fr" : "1fr 1fr", gap: "20px" }}>
            {cameras.map(cam => (
              <div key={cam.id} style={{ background: "black", borderRadius: "16px", overflow: "hidden", border: "1px solid #374151" }}>
                <div style={{ padding: "12px 16px", background: "#27272a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: "bold", fontSize: "14px" }}>{cam.name}</span>
                  <span style={{ fontSize: "12px", color: "#a78bfa" }}>{cam.scenario}</span>
                </div>
                <img src={cam.source} alt="Live Feed" style={{ width: "100%", aspectRatio: "16/9", objectFit: "contain", display: "block" }} />
              </div>
            ))}
          </div>
          {cameras.length === 0 && (
            <p style={{ color: "#9ca3af", textAlign: "center", marginTop: "50px" }}>No active cameras are currently being monitored by the admin.</p>
          )}
        </motion.div>
      )}
    </div>
  );
}
