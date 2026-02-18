import { useState } from "react";
import React from "react";
import CameraFeed from "../components/CameraFeed";

export default function Admin() {
  const [scenario, setScenario] = useState<string | null>(null);
  const [status, setStatus] = useState("Idle");
  const [runningThreshold, setRunningThreshold] = useState(1.5);
  const [loiteringThreshold, setLoiteringThreshold] = useState(10);
  const [activeZones, setActiveZones] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState(0);
  const [cameras, setCameras] = useState<Array<{ id: string; name: string; status: string; source: string; type: "ip" | "webcam" | "file" }>>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [showAddCameraModal, setShowAddCameraModal] = useState(false);
  const [newCameraName, setNewCameraName] = useState("");
  const [newCameraSource, setNewCameraSource] = useState("");
  const [newCameraType, setNewCameraType] = useState<"ip" | "webcam" | "file">("ip");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleStartScenario = () => {
    if (scenario) {
      setStatus("Running");
    }
  };

  const handleAddCamera = () => {
    if (newCameraName.trim() && newCameraSource.trim()) {
      const newCamera = {
        id: `camera_${Date.now()}`,
        name: newCameraName,
        status: "Active",
        source: newCameraSource,
        type: newCameraType
      };
      setCameras([...cameras, newCamera]);
      setSelectedCamera(newCamera.id);
      setNewCameraName("");
      setNewCameraSource("");
      setNewCameraType("ip");
      setShowAddCameraModal(false);
    }
  };

  const handleUploadVideo = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const fileURL = URL.createObjectURL(file);
      const newCamera = {
        id: `camera_${Date.now()}`,
        name: file.name,
        status: "Video File",
        source: fileURL,
        type: "file" as const
      };
      setCameras([...cameras, newCamera]);
      setSelectedCamera(newCamera.id);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveCamera = (id: string) => {
    const filtered = cameras.filter(cam => cam.id !== id);
    setCameras(filtered);
    if (selectedCamera === id) {
      setSelectedCamera(filtered.length > 0 ? filtered[0].id : null);
    }
  };

  const getGridCols = () => {
    if (cameras.length === 0) return 1;
    if (cameras.length === 1) return 1;
    if (cameras.length === 2) return 2;
    if (cameras.length === 3) return 2;
    return 2;
  };

  const renderCameraFeed = (camera: any) => {
    // For IP cameras (RTMP/HLS streams)
    if (camera.type === "ip" && camera.source.startsWith("http")) {
      return (
        <video
          key={camera.id}
          style={styles.videoStream}
          controls
          autoPlay
          muted
          src={camera.source}
        />
      );
    }
    // For webcam or live feeds
    if (camera.type === "webcam") {
      return (
        <div style={styles.cameraFeedContent}>
          <div style={{ fontSize: "24px", marginBottom: "10px" }}>🎥</div>
          <p style={styles.cameraStatus}>{camera.source}</p>
        </div>
      );
    }
    // For uploaded video files
    if (camera.type === "file") {
      return (
        <video
          key={camera.id}
          style={styles.videoStream}
          controls
          src={camera.source}
        />
      );
    }
    return (
      <div style={styles.cameraFeedContent}>
        <div style={styles.cameraIcon}>📹</div>
        <p style={styles.cameraStatus}>{camera.status}</p>
      </div>
    );
  };

  return (
    <div style={styles.page}>
      {/* HEADER */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Smart Surveillance System</h1>
          <p style={styles.subtitle}>Real-time video analysis and event detection</p>
        </div>
        <div style={styles.badge}>Inactive</div>
      </div>

      {/* MONITOR ZONES SECTION */}
      <div style={styles.monitorZonesSection}>
        <div style={styles.sectionTitle}>📍 Monitor Zones</div>
        <p style={styles.emptyText}>No zones defined</p>
      </div>

      {/* MAIN GRID */}
      <div style={styles.mainGrid}>
        {/* LEFT VIDEO PANEL */}
        <div style={styles.videoPanel}>
          <div style={styles.videoPanelHeader}>
            <div style={styles.panelTitle}>📷 Video Feed</div>
            <div style={styles.videoControls}>
              <select style={styles.select}>
                <option>Select Camera</option>
                {cameras.map(cam => (
                  <option key={cam.id} value={cam.id}>{cam.name}</option>
                ))}
              </select>
              <button style={styles.noCamera}>No Camera</button>
            </div>
          </div>

          {cameras.length === 0 ? (
            <div style={styles.viewer}>
              <div style={styles.viewerPlaceholder}>
                <div style={styles.cameraIcon}>📹</div>
                <p style={styles.placeholderText}>Select Camera or Video</p>
                <p style={styles.placeholderSubtext}>Choose a camera or upload a video to begin</p>
              </div>
            </div>
          ) : (
            <div style={{ ...styles.cameraGrid, gridTemplateColumns: `repeat(${getGridCols()}, 1fr)` }}>
              {cameras.map(cam => (
                <div
                  key={cam.id}
                  style={{
                    ...styles.cameraFeed,
                    border: selectedCamera === cam.id ? "2px solid #06b6d4" : "1px solid #1f2937"
                  }}
                  onClick={() => setSelectedCamera(cam.id)}
                >
                  <div style={styles.cameraFeedHeader}>
                    <span style={styles.cameraName}>{cam.name}</span>
                    <button
                      style={styles.removeButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveCamera(cam.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  {renderCameraFeed(cam)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT CONTROL PANEL */}
        <div style={styles.controlPanel}>
          <div style={styles.panelTitle}>⚙ Control Panel</div>

          {/* Select Scenario */}
          <div style={styles.controlSection}>
            <label style={styles.label}>Select Scenario</label>
            <select
              style={styles.scenarioSelect}
              value={scenario || ""}
              onChange={(e) => setScenario(e.target.value || null)}
            >
              <option value="">Choose a scenario</option>
              <option value="behavior">Behavior Detection</option>
              <option value="metro_line">Line Crossing</option>
            </select>
          </div>

          {/* Start Button */}
          <button style={styles.startButton} onClick={handleStartScenario}>
            ▶ Start
          </button>

          {/* Draw Zone Button */}
          <button style={styles.drawZoneButton}>
            ✏ Draw New Zone
          </button>

          {/* Status Info */}
          <div style={styles.statusBox}>
            <div style={styles.statusRow}>
              <span style={styles.statusLabel}>Status:</span>
              <span style={styles.statusValue}>{status}</span>
            </div>
            <div style={styles.statusRow}>
              <span style={styles.statusLabel}>Active Scenario:</span>
              <span style={styles.statusValue}>{scenario ? scenario.charAt(0).toUpperCase() + scenario.slice(1) : "None"}</span>
            </div>
            <div style={styles.statusRow}>
              <span style={styles.statusLabel}>Active Zones:</span>
              <span style={styles.statusValue}>{activeZones}</span>
            </div>
            <div style={styles.statusRow}>
              <span style={styles.statusLabel}>Total Events:</span>
              <span style={styles.statusValue}>{totalEvents}</span>
            </div>
            <div style={styles.statusRow}>
              <span style={styles.statusLabel}>Active Alerts:</span>
              <span style={{ ...styles.statusValue, color: "#ef4444" }}>{activeAlerts}</span>
            </div>
          </div>
        </div>

        {/* THRESHOLD SETTINGS */}
        <div style={styles.thresholdSection}>
          <div style={styles.panelTitle}>📊 Threshold Settings</div>

          <div style={styles.thresholdControl}>
            <label style={styles.thresholdLabel}>Running Threshold</label>
            <div style={styles.sliderContainer}>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={runningThreshold}
                onChange={(e) => setRunningThreshold(parseFloat(e.target.value))}
                style={styles.slider}
              />
              <span style={styles.thresholdValue}>{runningThreshold.toFixed(1)}x</span>
            </div>
            <p style={styles.thresholdDescription}>Speed multiplier to detect running</p>
          </div>

          <div style={styles.thresholdControl}>
            <label style={styles.thresholdLabel}>Loitering Threshold</label>
            <div style={styles.sliderContainer}>
              <input
                type="range"
                min="5"
                max="30"
                step="1"
                value={loiteringThreshold}
                onChange={(e) => setLoiteringThreshold(parseInt(e.target.value))}
                style={styles.slider}
              />
              <span style={styles.thresholdValue}>{loiteringThreshold}s</span>
            </div>
            <p style={styles.thresholdDescription}>Time in seconds to detect loitering</p>
          </div>

          <button style={styles.updateButton}>Update Thresholds</button>
        </div>
      </div>

      {/* BOTTOM GRID */}
      <div style={styles.bottomGrid}>
        {/* RECORDED VIDEOS */}
        <div style={styles.bottomPanel}>
          <div style={styles.bottomPanelHeader}>
            <div style={styles.panelTitle}>📹 Recorded Videos</div>
            <div style={styles.bottomButtons}>
              <button style={styles.addButton} onClick={() => setShowAddCameraModal(true)}>+ Add Camera</button>
              <button style={styles.uploadButton} onClick={handleUploadVideo}>↑ Upload Video</button>
            </div>
          </div>

          <div style={styles.tabsContainer}>
            <button style={styles.tabActive}>Cameras</button>
            <button style={styles.tabInactive}>Videos</button>
          </div>

          <p style={styles.emptyText}>No cameras configured</p>
        </div>

        {/* EVENT LOG */}
        <div style={styles.bottomPanel}>
          <div style={styles.panelTitle}>📋 Event Log</div>
          <p style={styles.emptyText2}>Recent surveillance events</p>
          <p style={styles.emptyText}>No events recorded</p>
        </div>
      </div>

      {/* HIDDEN FILE INPUT */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />

      {/* ADD CAMERA MODAL */}
      {showAddCameraModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddCameraModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Add New Camera</h3>
              <button
                style={styles.modalCloseButton}
                onClick={() => setShowAddCameraModal(false)}
              >
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Camera Name</label>
                <input
                  type="text"
                  placeholder="e.g., Front Door, Lobby"
                  value={newCameraName}
                  onChange={(e) => setNewCameraName(e.target.value)}
                  style={styles.formInput}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Camera Type</label>
                <select
                  value={newCameraType}
                  onChange={(e) => setNewCameraType(e.target.value as any)}
                  style={styles.formSelect}
                >
                  <option value="ip">IP Camera / Stream URL (RTMP, HLS, HTTP)</option>
                  <option value="webcam">Webcam / Local Camera</option>
                  <option value="file">Video File</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>
                  {newCameraType === "ip" && "Stream URL"}
                  {newCameraType === "webcam" && "Webcam Device ID"}
                  {newCameraType === "file" && "File Path / URL"}
                </label>
                <input
                  type="text"
                  placeholder={
                    newCameraType === "ip"
                      ? "e.g., rtmp://camera.local/stream"
                      : newCameraType === "webcam"
                        ? "e.g., /dev/video0 or camera ID"
                        : "e.g., /path/to/video.mp4"
                  }
                  value={newCameraSource}
                  onChange={(e) => setNewCameraSource(e.target.value)}
                  style={styles.formInput}
                />
              </div>

              <div style={styles.helpText}>
                <strong>Examples:</strong>
                <ul style={{ margin: "8px 0", paddingLeft: "20px", fontSize: "12px" }}>
                  <li>IP Camera: <code>rtmp://192.168.1.100/stream</code></li>
                  <li>IP Camera: <code>http://192.168.1.100:8080/video.m3u8</code></li>
                  <li>Webcam: <code>/dev/video0</code> (Linux) or device index</li>
                  <li>Video File: <code>/path/to/video.mp4</code> or URL</li>
                </ul>
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button
                style={styles.cancelButton}
                onClick={() => setShowAddCameraModal(false)}
              >
                Cancel
              </button>
              <button
                style={styles.confirmButton}
                onClick={handleAddCamera}
              >
                Add Camera
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



const styles: any = {
  page: {
    background: "#0a0e27",
    minHeight: "100vh",
    color: "#e5e7eb",
    padding: "20px",
    fontFamily: "Inter, -apple-system, system-ui"
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "25px"
  },

  title: {
    margin: "0",
    fontSize: "28px",
    fontWeight: "700",
    color: "#ffffff"
  },

  subtitle: {
    margin: "5px 0 0 0",
    fontSize: "14px",
    opacity: 0.6,
    color: "#9ca3af"
  },

  badge: {
    background: "#111827",
    padding: "8px 16px",
    borderRadius: "20px",
    border: "1px solid #374151",
    fontSize: "13px",
    fontWeight: "500",
    color: "#9ca3af"
  },

  monitorZonesSection: {
    background: "#111827",
    borderRadius: "12px",
    padding: "20px",
    border: "1px solid #1f2937",
    marginBottom: "20px"
  },

  sectionTitle: {
    fontWeight: "600",
    marginBottom: "15px",
    color: "#60a5fa",
    fontSize: "15px"
  },

  mainGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gridTemplateRows: "auto auto",
    gap: "20px",
    marginBottom: "20px"
  },

  videoPanel: {
    background: "#111827",
    borderRadius: "12px",
    padding: "15px",
    border: "1px solid #1f2937",
    gridRow: "1 / 3"
  },

  controlPanel: {
    background: "#111827",
    borderRadius: "12px",
    padding: "20px",
    border: "1px solid #1f2937",
    gridRow: "1",
    gridColumn: "2",
    height: "fit-content"
  },

  thresholdSection: {
    background: "#111827",
    borderRadius: "12px",
    padding: "20px",
    border: "1px solid #1f2937",
    gridRow: "2",
    gridColumn: "2",
    height: "fit-content",
    marginBottom: "0"
  },

  panelTitle: {
    fontWeight: "600",
    marginBottom: "15px",
    color: "#60a5fa",
    fontSize: "15px"
  },

  controlSection: {
    marginBottom: "15px"
  },

  label: {
    fontSize: "13px",
    opacity: 0.7,
    display: "block",
    marginBottom: "8px"
  },

  scenarioSelect: {
    width: "100%",
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #374151",
    background: "#1f2937",
    color: "#e5e7eb",
    fontSize: "13px",
    cursor: "pointer"
  },

  startButton: {
    width: "100%",
    padding: "12px",
    borderRadius: "6px",
    border: "none",
    background: "#06b6d4",
    color: "white",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "14px",
    marginBottom: "10px"
  },

  drawZoneButton: {
    width: "100%",
    padding: "12px",
    borderRadius: "6px",
    border: "1px solid #374151",
    background: "transparent",
    color: "#06b6d4",
    fontWeight: "500",
    cursor: "pointer",
    fontSize: "14px",
    marginBottom: "15px"
  },

  statusBox: {
    marginTop: "20px",
    padding: "15px",
    borderRadius: "8px",
    background: "#0f172a",
    border: "1px solid #1f2937"
  },

  statusRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px",
    fontSize: "13px"
  },

  statusLabel: {
    opacity: 0.7,
    color: "#9ca3af"
  },

  statusValue: {
    fontWeight: "500",
    color: "#e5e7eb"
  },

  thresholdSection: {
    background: "#111827",
    borderRadius: "12px",
    padding: "20px",
    border: "1px solid #1f2937",
    gridRow: "2",
    gridColumn: "2",
    height: "fit-content",
    marginBottom: "0"
  },

  videoPanelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "15px",
    gap: "10px"
  },

  videoControls: {
    display: "flex",
    gap: "10px"
  },

  select: {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #374151",
    background: "#1f2937",
    color: "#e5e7eb",
    fontSize: "13px",
    cursor: "pointer",
    minWidth: "150px"
  },

  noCamera: {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #374151",
    background: "#020617",
    color: "#e5e7eb",
    fontSize: "13px",
    cursor: "pointer"
  },

  viewer: {
    height: "65vh",
    background: "black",
    borderRadius: "10px",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },

  cameraGrid: {
    display: "grid",
    gap: "15px",
    height: "auto"
  },

  cameraFeed: {
    background: "#020617",
    borderRadius: "10px",
    border: "1px solid #1f2937",
    overflow: "hidden",
    minHeight: "250px",
    cursor: "pointer",
    transition: "all 0.2s ease"
  },

  cameraFeedHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    background: "#111827",
    borderBottom: "1px solid #1f2937"
  },

  cameraName: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#e5e7eb"
  },

  removeButton: {
    background: "transparent",
    border: "none",
    color: "#ef4444",
    cursor: "pointer",
    fontSize: "16px",
    padding: "0",
    width: "24px",
    height: "24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "4px",
    transition: "background 0.2s"
  },

  cameraFeedContent: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    height: "200px",
    gap: "10px"
  },

  cameraStatus: {
    fontSize: "12px",
    color: "#6b7280",
    margin: "0"
  },

  videoStream: {
    width: "100%",
    height: "200px",
    background: "black",
    borderRadius: "8px",
    objectFit: "cover" as const
  },

  modalOverlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000
  },

  modal: {
    background: "#111827",
    borderRadius: "12px",
    border: "1px solid #1f2937",
    width: "90%",
    maxWidth: "500px",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)"
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px",
    borderBottom: "1px solid #1f2937"
  },

  modalTitle: {
    margin: "0",
    fontSize: "18px",
    fontWeight: "600",
    color: "#e5e7eb"
  },

  modalCloseButton: {
    background: "transparent",
    border: "none",
    color: "#9ca3af",
    fontSize: "20px",
    cursor: "pointer",
    padding: "0",
    width: "32px",
    height: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },

  modalBody: {
    padding: "20px"
  },

  formGroup: {
    marginBottom: "16px"
  },

  formLabel: {
    display: "block",
    fontSize: "13px",
    fontWeight: "600",
    marginBottom: "8px",
    color: "#e5e7eb"
  },

  formInput: {
    width: "100%",
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #374151",
    background: "#1f2937",
    color: "#e5e7eb",
    fontSize: "13px",
    boxSizing: "border-box" as const
  },

  formSelect: {
    width: "100%",
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #374151",
    background: "#1f2937",
    color: "#e5e7eb",
    fontSize: "13px",
    cursor: "pointer",
    boxSizing: "border-box" as const
  },

  helpText: {
    background: "#0f172a",
    padding: "12px",
    borderRadius: "6px",
    marginBottom: "16px",
    fontSize: "12px",
    color: "#9ca3af",
    border: "1px solid #1f2937"
  },

  modalFooter: {
    display: "flex",
    gap: "10px",
    justifyContent: "flex-end",
    padding: "16px 20px",
    borderTop: "1px solid #1f2937"
  },

  cancelButton: {
    padding: "10px 16px",
    borderRadius: "6px",
    border: "1px solid #374151",
    background: "transparent",
    color: "#e5e7eb",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "13px"
  },

  confirmButton: {
    padding: "10px 16px",
    borderRadius: "6px",
    border: "none",
    background: "#06b6d4",
    color: "white",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "13px"
  },

  viewerPlaceholder: {
    textAlign: "center"
  },

  cameraIcon: {
    fontSize: "48px",
    marginBottom: "15px",
    opacity: 0.3
  },

  placeholderText: {
    margin: "0",
    fontSize: "18px",
    color: "#6b7280",
    fontWeight: "500"
  },

  placeholderSubtext: {
    margin: "8px 0 0 0",
    fontSize: "14px",
    color: "#4b5563"
  },

  thresholdControl: {
    marginBottom: "20px"
  },

  thresholdLabel: {
    display: "block",
    fontSize: "13px",
    fontWeight: "500",
    marginBottom: "10px",
    color: "#e5e7eb"
  },

  sliderContainer: {
    display: "flex",
    alignItems: "center",
    gap: "15px",
    marginBottom: "8px"
  },

  slider: {
    flex: 1,
    height: "6px",
    borderRadius: "3px",
    background: "#1f2937",
    outline: "none",
    cursor: "pointer",
    WebkitAppearance: "none" as any,
    appearance: "none" as any
  },

  thresholdValue: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#60a5fa",
    minWidth: "50px",
    textAlign: "right"
  },

  thresholdDescription: {
    margin: "6px 0 0 0",
    fontSize: "12px",
    opacity: 0.6,
    color: "#9ca3af"
  },

  updateButton: {
    width: "100%",
    padding: "12px",
    borderRadius: "6px",
    border: "none",
    background: "#06b6d4",
    color: "white",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "14px"
  },

  bottomGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    marginTop: "0"
  },

  bottomPanel: {
    background: "#111827",
    borderRadius: "12px",
    padding: "20px",
    border: "1px solid #1f2937"
  },

  bottomPanelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "15px"
  },

  bottomButtons: {
    display: "flex",
    gap: "10px"
  },

  addButton: {
    padding: "8px 14px",
    borderRadius: "6px",
    border: "none",
    background: "#06b6d4",
    color: "white",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "12px"
  },

  uploadButton: {
    padding: "8px 14px",
    borderRadius: "6px",
    border: "none",
    background: "#10b981",
    color: "white",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "12px"
  },

  tabsContainer: {
    display: "flex",
    gap: "10px",
    marginBottom: "15px",
    borderBottom: "1px solid #1f2937",
    paddingBottom: "10px"
  },

  tabActive: {
    padding: "6px 0",
    background: "transparent",
    border: "none",
    color: "#e5e7eb",
    fontSize: "13px",
    fontWeight: "500",
    cursor: "pointer",
    borderBottom: "2px solid #60a5fa",
    paddingBottom: "8px"
  },

  tabInactive: {
    padding: "6px 0",
    background: "transparent",
    border: "none",
    color: "#6b7280",
    fontSize: "13px",
    fontWeight: "500",
    cursor: "pointer",
    borderBottom: "none"
  },

  emptyText: {
    margin: "20px 0",
    fontSize: "13px",
    opacity: 0.5,
    color: "#9ca3af"
  },

  emptyText2: {
    margin: "0 0 10px 0",
    fontSize: "12px",
    opacity: 0.6,
    color: "#9ca3af"
  }
};
