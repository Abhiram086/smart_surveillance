import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import CameraFeed from "../components/CameraFeed";

type Camera = {
  id: string;
  name: string;
  scenario: string;
};

export default function Viewer() {

  // temporary mock cameras
  const cameras: Camera[] = [
    { id: "cam1", name: "Entrance", scenario: "behavior" },
    { id: "cam2", name: "Parking", scenario: "metro_line" },
    { id: "cam3", name: "Lobby", scenario: "behavior" },
    { id: "cam4", name: "Backyard", scenario: "metro_line" }
  ];

  const [selected, setSelected] = useState<Camera | null>(null);
  const [tokens, setTokens] = useState<Record<string, string>>({}); // map cameraId->token

  // Ensure page background matches viewer container (hide decorative blobs)
  React.useEffect(() => {
    const prevBg = document.body.style.background;
    document.body.style.background = "#0c0c0c";
    const blobs = Array.from(document.querySelectorAll('.bg-blob')) as HTMLElement[];
    const prevDisplays = blobs.map(b => b.style.display || "");
    blobs.forEach(b => b.style.display = "none");
    return () => {
      document.body.style.background = prevBg;
      blobs.forEach((b, i) => b.style.display = prevDisplays[i]);
    };
  }, []);

  // helper functions to start/stop processing for a given camera
  const startStream = (cam: Camera) => {
    if (tokens[cam.id]) return; // already running
    const tok = crypto.randomUUID();
    setTokens(prev => ({ ...prev, [cam.id]: tok }));
    return tok;
  };

  const stopStream = (camId: string) => {
    const tok = tokens[camId];
    if (tok) {
      fetch(`http://127.0.0.1:8000/stop?token=${tok}`, { method: "POST" }).catch(() => { });
      setTokens(prev => {
        const p = { ...prev };
        delete p[camId];
        return p;
      });
    }
  };

  // if the component unmounts while streams are active, make sure they're
  // torn down to avoid lingering work on the backend.
  useEffect(() => {
    return () => {
      Object.values(tokens).forEach(tok => {
        fetch(`http://127.0.0.1:8000/stop?token=${tok}`, { method: "POST" }).catch(() => { });
      });
    };
  }, [tokens]);

  // ---------------- SINGLE CAMERA VIEW ----------------
  if (selected) {
    const currentToken = tokens[selected.id] || null;
    return (
      <div style={styles.fullscreen}>
        <div style={styles.topbar}>
          <button
            style={styles.backBtn}
            onClick={() => {
              if (currentToken) stopStream(selected.id);
              setSelected(null);
            }}
          >
            ← Back to grid
          </button>
          <span style={styles.title}>{selected.name}</span>
          <button
            style={styles.streamBtn}
            onClick={() => {
              if (currentToken) {
                stopStream(selected.id);
              } else {
                startStream(selected);
              }
            }}
          >
            {currentToken ? "Stop" : "Start"}
          </button>
        </div>

        <div style={styles.singleFeed}>
          <CameraFeed scenario={selected.scenario} token={currentToken} />
        </div>
      </div>
    );
  }

  // ---------------- GRID VIEW ----------------
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      style={styles.container}
    >
      <h1 style={styles.heading}>Live Monitoring</h1>

      <div style={styles.grid}>
        {cameras.map(cam => {
          const running = Boolean(tokens[cam.id]);
          return (
            <div
              key={cam.id}
              style={styles.card}
              onClick={() => {
                // open and also ensure processing is running
                if (!tokens[cam.id]) startStream(cam);
                setSelected(cam);
              }}
            >
              <div style={styles.cardTitle}>{cam.name}</div>

              {/* start/stop control */}
              <button
                style={styles.streamBtn}
                onClick={e => {
                  e.stopPropagation();
                  running ? stopStream(cam.id) : startStream(cam);
                }}
              >
                {running ? "Stop" : "Start"}
              </button>

              {/* IMPORTANT: No live stream in grid */}
              <div style={styles.feedWrapper}>
                <div style={styles.preview}>
                  Click to open live feed
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* hidden feeds keep connections alive for cameras that are running */}
      {Object.entries(tokens).map(([camId, tok]) => {
        const cam = cameras.find(c => c.id === camId);
        if (!cam) return null;
        return (
          <div key={camId} style={{ display: "none" }}>
            <CameraFeed scenario={cam.scenario} token={tok} />
          </div>
        );
      })}
    </motion.div>
  );
}

const styles: any = {

  container: {

    maxWidth: 1200,
    margin: "0 auto",
    minHeight: "100vh",
    background: "#0c0c0c",
    color: "white",
    fontFamily: "Google Sans, Inter, -apple-system, system-ui",
    boxSizing: "border-box"
  },

  heading: {
    marginBottom: 18,
    fontSize: 60,
    fontWeight: 700,
    color: "#ffffff",
    paddingLeft: 0
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 24
  },

  card: {
    background: "#ffffff",
    borderRadius: 16,
    padding: 18,
    cursor: "pointer",
    border: "1px solid #e5e7eb",
    transition: "all 0.18s ease",
    boxShadow: "0 6px 18px rgba(2,6,23,0.08)"
  },

  cardTitle: {
    fontSize: 14,
    marginBottom: 12,
    color: "#1a1a1a",
    fontWeight: 600
  },

  feedWrapper: {
    height: 300,
    overflow: "hidden",
    borderRadius: 12,
    marginTop: 6
  },

  preview: {
    height: "100%",
    background: "#0a0a0a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7280",
    fontSize: 15,
    borderRadius: 12,
    padding: 18
  },

  fullscreen: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#0c0c0c"
  },

  topbar: {
    padding: "12px 20px",
    background: "#111111",
    display: "flex",
    alignItems: "center",
    gap: 12,
    borderBottom: "1px solid #222222"
  },

  title: {
    color: "white",
    fontSize: 18,
    fontWeight: 600
  },

  backBtn: {
    background: "#ffffff",
    border: "none",
    color: "#1a1a1a",
    padding: "8px 14px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    transition: "background 0.18s ease"
  },

  streamBtn: {
    marginLeft: "auto",
    padding: "10px 25px",
    background: "#1a1a1a",
    border: "1px solid #333333",
    borderRadius: 10,
    color: "white",
    cursor: "pointer",
    fontSize: 18,
    fontFamily: "Google Sans, sans-serif",
    fontWeight: "500",
    transition: "background 0.2s ease"
  },

  singleFeed: {
    flex: 1,
    background: "#0a0a0a",
    padding: 16
  }
};
