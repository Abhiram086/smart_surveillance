import React, { useState, useEffect } from "react";
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
  const [tokens, setTokens] = useState<Record<string,string>>({}); // map cameraId->token

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
      fetch(`http://127.0.0.1:8000/stop?token=${tok}`, { method: "POST" }).catch(() => {});
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
        fetch(`http://127.0.0.1:8000/stop?token=${tok}`, { method: "POST" }).catch(() => {});
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
    <div style={styles.container}>
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
    </div>
  );
}

const styles: any = {

  container: {
    padding: 20,
    minHeight: "100vh",
    background: "#0f172a",
    color: "white"
  },

  heading: {
    marginBottom: 20
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
    gap: 18
  },

  card: {
    background: "#020617",
    borderRadius: 12,
    padding: 10,
    cursor: "pointer",
    border: "1px solid #1e293b",
    transition: "0.15s"
  },

  cardTitle: {
    fontSize: 14,
    marginBottom: 6,
    color: "#94a3b8"
  },

  feedWrapper: {
    height: 260,
    overflow: "hidden",
    borderRadius: 8
  },

  preview: {
    height: "100%",
    background: "#111827",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#475569",
    fontSize: 14
  },

  fullscreen: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "black"
  },

  topbar: {
    padding: "12px 16px",
    background: "#020617",
    display: "flex",
    alignItems: "center",
    gap: 16
  },

  title: {
    color: "white",
    fontSize: 16
  },

  backBtn: {
    background: "#1e293b",
    border: "none",
    color: "white",
    padding: "6px 12px",
    borderRadius: 6,
    cursor: "pointer"
  },

  streamBtn: {
    marginLeft: "auto",
    padding: "6px 12px",
    background: "#06b6d4",
    border: "none",
    borderRadius: 6,
    color: "white",
    cursor: "pointer",
    fontSize: 14
  },

  singleFeed: {
    flex: 1,
    background: "black"
  }
};
