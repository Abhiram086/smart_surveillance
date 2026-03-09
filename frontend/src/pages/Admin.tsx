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
  type Camera = {
    id: string;
    name: string;
    status: string;
    source: string;
    type: "ip" | "webcam" | "file";
    serverSource?: string;
  };

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [drawingLine, setDrawingLine] = useState(false);
  const [savedCamera, setSavedCamera] = useState<Camera | null>(null);
  const [activeScenarioCamId, setActiveScenarioCamId] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<Record<string, "connecting" | "ok" | "error">>({});
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});
  const [videoDims, setVideoDims] = useState<Record<string, { w: number; h: number }>>({});
  const [streamToken, setStreamToken] = useState<string | null>(null);

  // ── zone_detection state ───────────────────────────────────────────────────
  const [drawingZone, setDrawingZone] = useState(false);
  const [zonePoints, setZonePoints] = useState<Array<{ x: number; y: number }>>([]);
  // a zone is "closed" (ready to send) when the user clicks "Close Zone" or
  // adds 3+ points and right-clicks / presses the button
  const [zoneClosed, setZoneClosed] = useState(false);

  const selectedDims = selectedCamera ? videoDims[selectedCamera] : undefined;
  const videoReady = !!selectedDims;

  React.useEffect(() => {
    if (drawingLine || drawingZone) {
      const vids = Array.from(document.querySelectorAll<HTMLVideoElement>('video[data-cam-id]'));
      vids.forEach(v => v.pause());
    }
  }, [drawingLine, drawingZone]);

  React.useEffect(() => {
    if (status === "Idle") {
      const vids = Array.from(document.querySelectorAll<HTMLVideoElement>('video[data-cam-id]'));
      vids.forEach(v => v.pause());
    }
  }, [status]);

  const [showAddCameraModal, setShowAddCameraModal] = useState(false);
  const [newCameraName, setNewCameraName] = useState("");
  const [newCameraSource, setNewCameraSource] = useState("");
  const [newCameraType, setNewCameraType] = useState<"ip" | "webcam" | "file">("ip");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // line-crossing specific state
  const [linePoints, setLinePoints] = useState<Array<{ x: number; y: number }>>([]);
  const [restrictedPoint, setRestrictedPoint] = useState<{ x: number; y: number } | null>(null);

  const handleStartScenario = async () => {
    if (!scenario) return;

    if (scenario === "metro_line") {
      if (linePoints.length < 2 || !restrictedPoint) {
        alert("Please draw the safety line (two clicks) and select a restricted-side point before starting.");
        return;
      }
    }

    if (scenario === "zone_detection") {
      if (zonePoints.length < 3 || !zoneClosed) {
        alert("Please draw a zone with at least 3 points and close it before starting.");
        return;
      }
    }

    if (status === "Running") {
      if (streamToken) {
        fetch(`http://127.0.0.1:8000/stop?token=${streamToken}`, { method: "POST" })
        .catch(() => { });
        setStreamToken(null);
      }

      setStatus("Idle");

      let updatedList = cameras;
      if (savedCamera && activeScenarioCamId) {
        updatedList = cameras.map(c =>
        c.id === activeScenarioCamId ? savedCamera : c
        );
        setCameras(updatedList);
      }
      setSavedCamera(null);
      setActiveScenarioCamId(null);
      setSelectedCamera(updatedList.length ? updatedList[0].id : null);
      setLinePoints([]);
      setRestrictedPoint(null);
      setZonePoints([]);
      setZoneClosed(false);
      setDrawingZone(false);
      setScenario(null);
      setStreamStatus({});
      return;
    }

    setStatus("Running");
    setDrawingLine(false);
    setDrawingZone(false);

    const params = new URLSearchParams();

    if (scenario === "metro_line") {
      if (linePoints.length === 2) {
        const [p1, p2] = linePoints;
        params.append("line", `${p1.x},${p1.y},${p2.x},${p2.y}`);
      }
      if (restrictedPoint) {
        params.append("restricted_point", `${restrictedPoint.x},${restrictedPoint.y}`);
      }
    }

    if (scenario === "zone_detection" && zonePoints.length >= 3) {
      // encode as semicolon-separated "x,y" pairs
      const zoneParam = zonePoints.map(p => `${p.x},${p.y}`).join(";");
      params.append("zone", zoneParam);
    }

    const cam = cameras.find(c => c.id === selectedCamera);
    if (cam && cam.type === "file" && !cam.serverSource && !cam.source.startsWith("blob:")) {
      alert("Please upload the video file via the upload button before starting a scenario.");
      setStatus("Idle");
      return;
    }
    if (cam) {
      if (cam.type === "file") {
        let videoParam: string | undefined;
        if (cam.serverSource) {
          videoParam = cam.serverSource;
        } else if (cam.source.startsWith("blob:")) {
          try {
            const blobResp = await fetch(cam.source);
            const blob = await blobResp.blob();
            const file = new File([blob], cam.name);
            const form = new FormData();
            form.append("file", file);
            const resp = await fetch("http://127.0.0.1:8000/upload", {
              method: "POST",
              body: form,
            });
            const data = await resp.json();
            videoParam = data.location;
            setCameras(prev =>
            prev.map(c =>
            c.id === cam.id ? { ...c, serverSource: videoParam } : c
            )
            );
          } catch (err) {
            console.error("failed to upload blob video", err);
          }
        } else {
          videoParam = cam.source;
        }
        if (videoParam) {
          params.append("video", videoParam);
        }
      } else if (cam.source) {
        params.append("video", cam.source);
      }
    }

    const token = crypto.randomUUID();
    params.append("token", token);
    const streamUrl = `http://127.0.0.1:8000/stream/${scenario}?${params.toString()}`;
    console.log("Starting scenario stream", streamUrl, "token", token);
    setStreamToken(token);

    if (cam) {
      setSavedCamera(cam);
      setActiveScenarioCamId(cam.id);
      setStreamStatus(prev => ({ ...prev, [cam.id]: "connecting" }));
      const updated: Camera = {
        ...cam,
        source: streamUrl,
        type: "ip",
        name: "Scenario Output",
      };
      setCameras(prev => prev.map(c => (c.id === cam.id ? updated : c)));
      setSelectedCamera(cam.id);
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

  // ── Coordinate helper shared by both line and zone click handlers ──────────
  const getCoordsFromClick = (
    e: React.MouseEvent<HTMLDivElement>,
    camId: string
  ): { x: number; y: number } | null => {
    if (!videoDims[camId]) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const dims = videoDims[camId];
    const vw = dims.w;
    const vh = dims.h;
    const scale = Math.min(rect.width / vw, rect.height / vh);
    const contentW = vw * scale;
    const contentH = vh * scale;
    const offsetX = (rect.width - contentW) / 2;
    const offsetY = (rect.height - contentH) / 2;
    let cx = e.clientX - rect.left - offsetX;
    let cy = e.clientY - rect.top - offsetY;
    cx = Math.max(0, Math.min(contentW, cx));
    cy = Math.max(0, Math.min(contentH, cy));
    return {
      x: Math.round(cx * (vw / contentW)),
      y: Math.round(cy * (vh / contentH)),
    };
  };

  const handleVideoClick = (
    e: React.MouseEvent<HTMLDivElement>,
    cam: Camera
  ) => {
    const isSelectedCam = selectedCamera === cam.id && cam.id !== activeScenarioCamId;
    if (!isSelectedCam) return;

    // ── LINE CROSSING ──────────────────────────────────────────────────────
    if (scenario === "metro_line" && drawingLine) {
      const coords = getCoordsFromClick(e, cam.id);
      if (!coords) return;
      if (linePoints.length < 2) {
        setLinePoints([...linePoints, coords]);
      } else if (!restrictedPoint) {
        setRestrictedPoint(coords);
        setDrawingLine(false);
      }
      return;
    }

    // ── ZONE DETECTION ────────────────────────────────────────────────────
    if (scenario === "zone_detection" && drawingZone && !zoneClosed) {
      const coords = getCoordsFromClick(e, cam.id);
      if (!coords) return;
      setZonePoints(prev => [...prev, coords]);
    }
  };

  // Right-click on the video closes the zone polygon
  const handleVideoRightClick = (
    e: React.MouseEvent<HTMLDivElement>,
    cam: Camera
  ) => {
    e.preventDefault();
    if (
      scenario === "zone_detection" &&
      drawingZone &&
      !zoneClosed &&
      selectedCamera === cam.id &&
      cam.id !== activeScenarioCamId &&
      zonePoints.length >= 3
    ) {
      setZoneClosed(true);
      setDrawingZone(false);
    }
  };

  const handleUploadVideo = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileURL = URL.createObjectURL(file);

    const form = new FormData();
    form.append("file", file);
    let serverPath: string | undefined;
    try {
      const resp = await fetch("http://127.0.0.1:8000/upload", {
        method: "POST",
        body: form,
      });
      const data = await resp.json();
      serverPath = data.location;
    } catch (err) {
      console.error("upload failed", err);
    }

    const newCamera: Camera = {
      id: `camera_${Date.now()}`,
      name: file.name,
      status: "Video File",
      source: fileURL,
      type: "file",
      serverSource: serverPath,
    };
    setCameras([...cameras, newCamera]);
    setSelectedCamera(newCamera.id);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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
    if (cameras.length <= 1) return 1;
    return 2;
  };

  const renderCameraFeed = (camera: Camera) => {
    const isInteractive =
    selectedCamera === camera.id &&
    camera.id !== activeScenarioCamId &&
    ((scenario === "metro_line" && drawingLine) ||
    (scenario === "zone_detection" && drawingZone && !zoneClosed));

    const baseCursor = isInteractive ? "crosshair" : "default";

    const ratio = aspectRatios[camera.id] || 1;

    const wrapperStyle: React.CSSProperties = {
      width: "100%",
      position: "relative",
      aspectRatio: ratio,
      background: "black",
    };

    const withOverlay = (content: React.ReactNode) => {
      let wrapped = content;

      // Clickable capture overlay when in any draw mode
      if (isInteractive) {
        wrapped = (
          <div style={{ position: "relative" }}>
          {content}
          <div
          style={{ position: "absolute", inset: 0, cursor: "crosshair" }}
          onClick={(e) => handleVideoClick(e as any, camera)}
          onContextMenu={(e) => handleVideoRightClick(e as any, camera)}
          />
          </div>
        );
      }

      // SVG annotation overlay (always shown when we have dims)
      const dims = videoDims[camera.id];
      if (dims) {
        const makePct = (val: number, dim: number) => (val / dim) * 100;

        // ── LINE points ──────────────────────────────────────────────────
        const linePts = linePoints.map(p => ({
          x: makePct(p.x, dims.w),
                                             y: makePct(p.y, dims.h),
        }));
        const restrictedPct = restrictedPoint
        ? { x: makePct(restrictedPoint.x, dims.w), y: makePct(restrictedPoint.y, dims.h) }
        : null;

        // ── ZONE points ──────────────────────────────────────────────────
        const zonePts = zonePoints.map(p => ({
          x: makePct(p.x, dims.w),
                                             y: makePct(p.y, dims.h),
        }));
        // polygon points string for SVG
        const polygonPointsStr = zonePts.map(p => `${p.x}%,${p.y}%`).join(" ");
        // next-segment preview line: last point → current mouse pos would be
        // nice but complex; we skip it and just show closed polygon when done.

        wrapped = (
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
          {wrapped}
          <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          >
          {/* ── Line crossing annotations ── */}
          {linePts.length >= 2 && (
            <line
            x1={`${linePts[0].x}`} y1={`${linePts[0].y}`}
            x2={`${linePts[1].x}`} y2={`${linePts[1].y}`}
            stroke="#f59e0b" strokeWidth="0.4"
            vectorEffect="non-scaling-stroke"
            />
          )}
          {linePts.map((p, i) => (
            <circle key={i} cx={`${p.x}`} cy={`${p.y}`} r="0.8" fill="#f59e0b" />
          ))}
          {restrictedPct && (
            <circle cx={`${restrictedPct.x}`} cy={`${restrictedPct.y}`} r="1.2" fill="#ef4444" />
          )}

          {/* ── Zone polygon annotations ── */}
          {zonePts.length >= 3 && (
            <polygon
            points={polygonPointsStr}
            fill={zoneClosed ? "rgba(239,68,68,0.20)" : "rgba(239,68,68,0.10)"}
            stroke={zoneClosed ? "#ef4444" : "#f97316"}
            strokeWidth="0.4"
            strokeDasharray={zoneClosed ? "none" : "1.5,1"}
            vectorEffect="non-scaling-stroke"
            />
          )}
          {/* partial polygon lines while still drawing */}
          {zonePts.length >= 2 && !zoneClosed && zonePts.map((p, i) => {
            if (i === 0) return null;
            const prev = zonePts[i - 1];
            return (
              <line
              key={i}
              x1={`${prev.x}`} y1={`${prev.y}`}
              x2={`${p.x}`} y2={`${p.y}`}
              stroke="#f97316" strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {zonePts.map((p, i) => (
            <circle key={`zp-${i}`} cx={`${p.x}`} cy={`${p.y}`} r="0.9" fill="#f97316" />
          ))}
          </svg>
          </div>
        );
      }
      return wrapped;
    };

    // MJPEG stream from backend
    if (camera.source.startsWith("http") && camera.source.includes("/stream/")) {
      const st = streamStatus[camera.id];
      return withOverlay(
        <div style={wrapperStyle}>
        {!videoReady && (
          <div style={{ ...styles.overlay, visibility: "visible" }}>Loading video…</div>
        )}
        {st === "connecting" && <div style={styles.overlay}>Connecting…</div>}
        {st === "error" && <div style={styles.overlay}>Stream error – check console/server log</div>}
        <img
        key={camera.id}
        style={{ width: "100%", height: "100%", objectFit: "contain", cursor: baseCursor }}
        src={camera.source}
        onLoad={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          if (img.naturalWidth && img.naturalHeight) {
            setAspectRatios(prev => ({ ...prev, [camera.id]: img.naturalWidth / img.naturalHeight }));
            setVideoDims(prev => ({ ...prev, [camera.id]: { w: img.naturalWidth, h: img.naturalHeight } }));
          }
          setStreamStatus(prev => ({ ...prev, [camera.id]: "ok" }));
        }}
        onError={() => setStreamStatus(prev => ({ ...prev, [camera.id]: "error" }))}
        />
        </div>
      );
    }

    // IP camera
    if (camera.type === "ip" && camera.source.startsWith("http")) {
      return withOverlay(
        <div style={wrapperStyle}>
        <video
        key={camera.id}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
        controls={!drawingLine && !drawingZone}
        autoPlay
        muted
        src={camera.source}
        onLoadedMetadata={(e) => {
          const vid = e.currentTarget as HTMLVideoElement;
          if (vid.videoWidth && vid.videoHeight) {
            setAspectRatios(prev => ({ ...prev, [camera.id]: vid.videoWidth / vid.videoHeight }));
          }
        }}
        />
        </div>
      );
    }

    // Webcam placeholder
    if (camera.type === "webcam") {
      return (
        <div style={styles.cameraFeedContent}>
        <div style={{ fontSize: "24px", marginBottom: "10px" }}>🎥</div>
        <p style={styles.cameraStatus}>{camera.source}</p>
        </div>
      );
    }

    // Uploaded video file
    if (camera.type === "file") {
      return withOverlay(
        <div style={wrapperStyle}>
        {!videoReady && (
          <div style={{ ...styles.overlay, visibility: "visible" }}>Loading video…</div>
        )}
        <video
        key={camera.id}
        data-cam-id={camera.id}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
        controls={!drawingLine && !drawingZone}
        autoPlay={!drawingLine && !drawingZone}
        loop
        src={camera.source}
        onLoadedMetadata={(e) => {
          const vid = e.currentTarget as HTMLVideoElement;
          if (vid.videoWidth && vid.videoHeight) {
            setAspectRatios(prev => ({ ...prev, [camera.id]: vid.videoWidth / vid.videoHeight }));
            setVideoDims(prev => ({ ...prev, [camera.id]: { w: vid.videoWidth, h: vid.videoHeight } }));
          }
        }}
        />
        </div>
      );
    }

    return withOverlay(
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
    <select
    style={styles.select}
    value={selectedCamera || ""}
    onChange={(e) => setSelectedCamera(e.target.value || null)}
    >
    <option value="">Select Camera</option>
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
    onChange={(e) => {
      setScenario(e.target.value || null);
      setLinePoints([]);
      setRestrictedPoint(null);
      setZonePoints([]);
      setZoneClosed(false);
      setDrawingLine(false);
      setDrawingZone(false);
    }}
    >
    <option value="">Choose a scenario</option>
    <option value="behavior">Behavior Detection</option>
    <option value="metro_line">Line Crossing</option>
    <option value="zone_detection">Zone Detection</option>
    </select>
    </div>

    {/* Line Crossing config */}
    {scenario === "metro_line" && (
      <div style={styles.controlSection}>
      <p style={{ margin: "8px 0", fontSize: 14 }}>
      {drawingLine
        ? "Click two points to draw the line, then a third for the restricted side."
        : "Press the button below to define the line on the camera feed."}
        </p>
        <button
        style={styles.smallButton}
        onClick={() => {
          setDrawingLine(!drawingLine);
          if (!drawingLine) {
            setLinePoints([]);
            setRestrictedPoint(null);
          }
        }}
        disabled={!videoReady}
        >
        {drawingLine ? "Cancel Draw" : "Draw Line"}
        </button>
        {!videoReady && (
          <p style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>
          Wait for video to load before drawing
          </p>
        )}
        <p style={{ margin: "4px 0", fontSize: 12, color: "#9ca3af" }}>
        Line points: {linePoints.map(p => `(${p.x},${p.y})`).join(" → ")}
        </p>
        <p style={{ margin: "4px 0", fontSize: 12, color: "#9ca3af" }}>
        Restricted pt: {restrictedPoint ? `(${restrictedPoint.x},${restrictedPoint.y})` : "(none)"}
        </p>
        </div>
    )}

    {/* Zone Detection config */}
    {scenario === "zone_detection" && (
      <div style={styles.controlSection}>
      <p style={{ margin: "8px 0", fontSize: 14, color: "#e5e7eb" }}>
      {zoneClosed
        ? "Zone is ready. Press Start to begin detection."
        : drawingZone
        ? `Click to add points (${zonePoints.length} so far). Right-click or press Close Zone when done.`
        : "Press Draw Zone to define the restricted area on the camera feed."}
        </p>

        {!zoneClosed && (
          <button
          style={styles.smallButton}
          onClick={() => {
            if (drawingZone) {
              // cancel
              setDrawingZone(false);
              setZonePoints([]);
            } else {
              setDrawingZone(true);
              setZonePoints([]);
              setZoneClosed(false);
            }
          }}
          disabled={!videoReady}
          >
          {drawingZone ? "Cancel Draw" : "Draw Zone"}
          </button>
        )}

        {drawingZone && zonePoints.length >= 3 && !zoneClosed && (
          <button
          style={{ ...styles.smallButton, background: "#10b981", marginLeft: 8 }}
          onClick={() => {
            setZoneClosed(true);
            setDrawingZone(false);
          }}
          >
          Close Zone
          </button>
        )}

        {zoneClosed && (
          <button
          style={{ ...styles.smallButton, background: "#374151" }}
          onClick={() => {
            setZonePoints([]);
            setZoneClosed(false);
            setDrawingZone(false);
          }}
          >
          Clear Zone
          </button>
        )}

        {!videoReady && (
          <p style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>
          Wait for video to load before drawing
          </p>
        )}
        <p style={{ margin: "6px 0 2px", fontSize: 12, color: "#9ca3af" }}>
        Points: {zonePoints.length}
        {zoneClosed ? " ✓ closed" : zonePoints.length >= 3 ? " (right-click to close)" : ""}
        </p>
        </div>
    )}

    {/* Start/Stop Button */}
    <button style={styles.startButton} onClick={handleStartScenario}>
    {status === "Running" ? "■ Stop" : "▶ Start"}
    </button>

    {/* Draw Zone Button (legacy / behavior scenario shortcut) */}
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
    <span style={styles.statusValue}>
    {scenario
      ? scenario === "zone_detection"
      ? "Zone Detection"
      : scenario.charAt(0).toUpperCase() + scenario.slice(1)
      : "None"}
      </span>
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

  smallButton: {
    padding: "8px 12px",
    borderRadius: "5px",
    border: "none",
    background: "#2563eb",
    color: "white",
    cursor: "pointer",
    fontSize: "13px",
    margin: "6px 0"
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
    height: "300px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    borderRadius: "8px",
    border: "1px dashed #1f2937"
  },

  cameraGrid: {
    display: "grid",
    gap: "10px"
  },

  cameraFeed: {
    borderRadius: "8px",
    overflow: "hidden",
    cursor: "pointer",
    background: "#020617"
  },

  cameraFeedHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 10px",
    background: "#111827"
  },

  cameraName: {
    fontSize: "12px",
    color: "#9ca3af"
  },

  removeButton: {
    background: "transparent",
    border: "none",
    color: "#6b7280",
    cursor: "pointer",
    fontSize: "12px",
    padding: "2px 4px"
  },

  cameraFeedContent: {
    height: "200px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#020617"
  },

  cameraStatus: {
    fontSize: "12px",
    color: "#6b7280",
    margin: "0"
  },

  overlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.6)",
    color: "#9ca3af",
    fontSize: "14px",
    zIndex: 5
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
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
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
  }
};
