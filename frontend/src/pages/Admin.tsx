import { useState } from "react";
import CameraFeed from "../components/CameraFeed";

export default function Admin() {

  const [scenario, setScenario] = useState("behavior");
  const [status, setStatus] = useState("Idle");

  return (
    <div style={styles.page}>

    {/* HEADER */}
    <div style={styles.header}>
    <div>
    <h1 style={styles.title}>Smart Surveillance System</h1>
    <p style={styles.subtitle}>Real-time video analysis & monitoring</p>
    </div>
    <div style={styles.badge}>{status}</div>
    </div>


    {/* MAIN GRID */}
    <div style={styles.mainGrid}>

    {/* LEFT VIDEO PANEL */}
    <div style={styles.videoPanel}>
    <div style={styles.panelTitle}>📷 Live Camera Feed</div>

    <div style={styles.viewer}>
    <CameraFeed scenario={scenario} />
    </div>
    </div>


    {/* RIGHT CONTROL PANEL */}
    <div style={styles.controlPanel}>
    <div style={styles.panelTitle}>⚙ Control Panel</div>

    <label style={styles.label}>Select Scenario</label>

    <div style={styles.controls}>
    <button
    style={scenario === "behavior" ? styles.active : styles.btn}
    onClick={() => {setScenario("behavior"); setStatus("Behavior Monitoring");}}
    >
    Behavior
    </button>

    <button
    style={scenario === "metro_line" ? styles.active : styles.btn}
    onClick={() => {setScenario("metro_line"); setStatus("Line Crossing Monitoring");}}
    >
    Line Crossing
    </button>
    </div>

    <div style={styles.infoBox}>
    <p><b>Current Mode:</b> {scenario}</p>
    <p><b>Status:</b> Running</p>
    <p><b>Camera:</b> Webcam</p>
    </div>

    </div>
    </div>


    {/* LOWER GRID */}
    <div style={styles.bottomGrid}>

    <div style={styles.panel}>
    <div style={styles.panelTitle}>📁 Cameras / Videos</div>
    <p style={styles.muted}>No cameras configured</p>
    </div>

    <div style={styles.panel}>
    <div style={styles.panelTitle}>📜 Event Log</div>
    <p style={styles.muted}>No events recorded</p>
    </div>

    </div>

    </div>
  );
}



const styles: any = {

  page: {
    background: "#0b1220",
    minHeight: "100vh",
    color: "#e5e7eb",
    padding: 20,
    fontFamily: "Inter, system-ui"
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20
  },

  title: { margin: 0 },
  subtitle: { margin: 0, opacity: 0.6 },

  badge: {
    background: "#111827",
    padding: "6px 12px",
    borderRadius: 20,
    border: "1px solid #374151"
  },

  mainGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: 20
  },

  bottomGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
    marginTop: 20
  },

  panel: {
    background: "#111827",
    borderRadius: 12,
    padding: 15,
    border: "1px solid #1f2937",
    minHeight: 150
  },

  videoPanel: {
    background: "#111827",
    borderRadius: 12,
    padding: 15,
    border: "1px solid #1f2937"
  },

  controlPanel: {
    background: "#111827",
    borderRadius: 12,
    padding: 15,
    border: "1px solid #1f2937"
  },

  panelTitle: {
    fontWeight: 600,
    marginBottom: 10,
    color: "#93c5fd"
  },

  viewer: {
    height: "60vh",
    background: "black",
    borderRadius: 10,
    overflow: "hidden"
  },

  controls: {
    display: "flex",
    gap: 10,
    margin: "10px 0"
  },

  btn: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #374151",
    background: "#020617",
    color: "#e5e7eb",
    cursor: "pointer"
  },

  active: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "white",
    cursor: "pointer"
  },

  label: {
    fontSize: 13,
    opacity: 0.7
  },

  infoBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    background: "#020617",
    border: "1px solid #1f2937"
  },

  muted: {
    opacity: 0.5
  }
};
