import { useState } from "react";
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import CameraFeed from "../components/CameraFeed";

// Custom Slider Component
interface CustomSliderProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  style?: React.CSSProperties;
  showTicks?: boolean;
}

function CustomSlider({ min, max, step, value, onChange, style, showTicks = true }: CustomSliderProps) {
  const range = max - min;
  const progress = ((value - min) / range) * 100;

  // Generate tick positions
  const ticks = [];
  for (let i = min; i <= max; i += step) {
    ticks.push(i);
  }

  return (
    <div style={{ position: "relative", width: "100%", ...style }}>
      {/* Track background with dots */}
      <div style={{
        position: "relative",
        height: "60px",
        display: "flex",
        alignItems: "center",
        paddingLeft: "20px",
        paddingRight: "20px"
      }}>
        {/* Gray background bar */}
        <div style={{
          position: "absolute",
          left: "0px",
          right: "0px",
          height: "30px",
          background: "#b0b0b0",
          borderRadius: "16px",
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 1
        }} />

        {/* Tick dots */}
        {showTicks && ticks.map((tick) => {
          const tickProgress = ((tick - min) / range) * 100;
          return (
            <div
              key={tick}
              style={{
                position: "absolute",
                left: `calc(20px + ${tickProgress}% * (100% - 40px) / 100%)`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: "16px",
                height: "16px",
                backgroundColor: "#6b7280",
                borderRadius: "50%",
                zIndex: 2
              }}
            />
          );
        })}

        {/* Active thumb (larger black circle) */}
        <div
          style={{
            position: "absolute",
            left: `calc(20px + ${progress}% * (100% - 40px) / 100%)`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "37px",
            height: "37px",
            backgroundColor: "#000000",
            borderRadius: "50%",
            zIndex: 3,
            transition: "left 0.05s ease-out"
          }}
        />

        {/* Hidden input range for interaction */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            top: 0,
            left: 0,
            cursor: "pointer",
            opacity: 0,
            zIndex: 4
          }}
        />
      </div>
    </div>
  );
}

export default function Admin() {
  const [scenario, setScenario] = useState<string | null>(null);
  const [status, setStatus] = useState("Idle");
  const [runningThreshold, setRunningThreshold] = useState(1.5);
  const [loiteringThreshold, setLoiteringThreshold] = useState(10);
  const [activeZones, setActiveZones] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState(0);
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false); // track expanded camera selector
  const [customDropdownOpen, setCustomDropdownOpen] = useState(false); // track custom dropdown state
  const [scenarioDropdownOpen, setScenarioDropdownOpen] = useState(false); // track scenario dropdown state
  type Camera = {
    id: string;
    name: string;
    status: string;
    source: string;              // URL used for display (blob or http)
    type: "ip" | "webcam" | "file";
    serverSource?: string;       // path that backend can open (for files)
  };

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [drawingLine, setDrawingLine] = useState(false);
  const [savedCamera, setSavedCamera] = useState<Camera | null>(null);
  const [activeScenarioCamId, setActiveScenarioCamId] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<Record<string, "connecting" | "ok" | "error">>({});
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});
  const [videoDims, setVideoDims] = useState<Record<string, { w: number; h: number }>>({});
  const [streamToken, setStreamToken] = useState<string | null>(null);  // unique token for backend stop

  // Per-camera running state: camera_id -> { scenario, savedCamera }
  const [cameraRunning, setCameraRunning] = useState<Record<string, { scenario: string; saved: Camera }>>({});

  // Inference throttle: 1 = every frame (Quality), 2 = every 2nd (Balanced), 3 = every 3rd (Performance)
  const [inferEvery, setInferEvery] = useState(2);

  const selectedDims = selectedCamera ? videoDims[selectedCamera] : undefined;
  const videoReady = !!selectedDims; // have natural size

  // pause currently playing video when entering draw mode, resume when leaving
  React.useEffect(() => {
    if (drawingLine) {
      const vids = Array.from(document.querySelectorAll<HTMLVideoElement>('video[data-cam-id]'));
      vids.forEach(v => v.pause());
    }
    // do not auto-play when drawingLine turns false; user can manually resume
  }, [drawingLine]);

  const handleLogout = () => {
    // simple logout: navigate to home / login
    window.location.href = "/";
  };

  // make sure any playing videos are paused when the scenario stops; this is
  // mostly defensive since the camera object itself will be replaced (which
  // should change the src), but pausing avoids transient motion and gives
  // better feedback to the user.
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

  // scenario-specific helper state
  const [linePoints, setLinePoints] = useState<Array<{ x: number; y: number }>>([]);
  const [restrictedPoint, setRestrictedPoint] = useState<{ x: number; y: number } | null>(null);

  // zone drawing state
  const [drawingZone, setDrawingZone] = useState(false);
  const [zonePoints, setZonePoints] = useState<Array<{ x: number; y: number }>>([]);
  const [zoneClosed, setZoneClosed] = useState(false);

  const handleStartScenario = async () => {
    if (!scenario) return;

    // guard missing scenario config
    if (scenario === "metro_line") {
      if (linePoints.length < 2 || !restrictedPoint) {
        alert("Please draw the safety line (two clicks) and select a restricted-side point before starting.");
        return;
      }
    }
    if (scenario === "zone_detection") {
      if (zonePoints.length < 3 || !zoneClosed) {
        alert("Please draw and close a zone (minimum 3 points) before starting.");
        return;
      }
    }

    if (status === "Running") {
      // ── STOP: tell backend to stop this camera's worker ──────────────────
      if (activeScenarioCamId) {
        fetch(`http://127.0.0.1:8000/cameras/stop?camera_id=${activeScenarioCamId}`, { method: "POST" })
          .catch(() => { });
      }
      // also signal legacy stop if token exists (backward compat)
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

    // ── START: resolve video param, then call /cameras/start ──────────────
    setStatus("Running");
    setDrawingLine(false);
    setDrawingZone(false);

    const cam = cameras.find(c => c.id === selectedCamera);
    if (!cam) return;

    if (cam.type === "file" && !cam.serverSource && !cam.source.startsWith("blob:")) {
      alert("Please upload the video file via the upload button before starting a scenario.");
      setStatus("Idle");
      return;
    }

    // Resolve server-side video path
    let videoParam: string | undefined;
    if (cam.type === "file") {
      if (cam.serverSource) {
        videoParam = cam.serverSource;
      } else if (cam.source.startsWith("blob:")) {
        try {
          const blobResp = await fetch(cam.source);
          const blob = await blobResp.blob();
          const file = new File([blob], cam.name);
          const form = new FormData();
          form.append("file", file);
          const resp = await fetch("http://127.0.0.1:8000/upload", { method: "POST", body: form });
          const data = await resp.json();
          videoParam = data.location;
          setCameras(prev => prev.map(c => c.id === cam.id ? { ...c, serverSource: videoParam } : c));
        } catch (err) {
          console.error("failed to upload blob video", err);
        }
      } else {
        videoParam = cam.source;
      }
    } else if (cam.source) {
      videoParam = cam.source;
    }

    // Build the /cameras/start request body
    // camera_id IS the cam.id — we use the same UUID to key the worker
    // so /cameras/stream/{cam.id} gives us the MJPEG for this specific camera
    const body: Record<string, string | undefined> = {
      camera_id: cam.id,
      scenario,
      video: videoParam,
    };
    if (scenario === "metro_line" && linePoints.length === 2 && restrictedPoint) {
      const [p1, p2] = linePoints;
      body.line = `${p1.x},${p1.y},${p2.x},${p2.y}`;
      body.restricted_point = `${restrictedPoint.x},${restrictedPoint.y}`;
    }
    if (scenario === "zone_detection" && zonePoints.length >= 3) {
      body.zone = zonePoints.map(p => `${p.x},${p.y}`).join(";");
    }

    try {
      const resp = await fetch("http://127.0.0.1:8000/cameras/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const err = await resp.json();
        alert(`Failed to start camera: ${err.detail}`);
        setStatus("Idle");
        return;
      }
    } catch (err) {
      console.error("cameras/start failed", err);
      setStatus("Idle");
      return;
    }

    // Point the camera tile at the per-camera MJPEG stream endpoint
    const streamUrl = `http://127.0.0.1:8000/cameras/stream/${cam.id}`;
    console.log("Multi-cam stream:", streamUrl);

    setSavedCamera(cam);
    setActiveScenarioCamId(cam.id);
    setStreamStatus(prev => ({ ...prev, [cam.id]: "connecting" }));
    const updated: Camera = { ...cam, source: streamUrl, type: "ip", name: "Scenario Output" };
    setCameras(prev => prev.map(c => (c.id === cam.id ? updated : c)));
    setSelectedCamera(cam.id);
  };

  // Per-camera start/stop — independent of the global status/scenario
  const handleStartCameraScenario = async (cam: Camera) => {
    if (!scenario) {
      alert("Please select a scenario first.");
      return;
    }

    // If this specific camera is already running, stop it
    if (cameraRunning[cam.id]) {
      fetch(`http://127.0.0.1:8000/cameras/stop?camera_id=${cam.id}`, { method: "POST" }).catch(() => { });
      const saved = cameraRunning[cam.id].saved;
      setCameras(prev => prev.map(c => c.id === cam.id ? saved : c));
      setCameraRunning(prev => { const n = { ...prev }; delete n[cam.id]; return n; });
      return;
    }

    // Guard scenario-specific requirements
    if (scenario === "metro_line" && (linePoints.length < 2 || !restrictedPoint)) {
      alert("Draw the line and restricted point first.");
      return;
    }
    if (scenario === "zone_detection" && (zonePoints.length < 3 || !zoneClosed)) {
      alert("Draw and close a zone first.");
      return;
    }

    // Resolve video param
    let videoParam: string | undefined;
    if (cam.type === "file") {
      if (cam.serverSource) {
        videoParam = cam.serverSource;
      } else if (cam.source.startsWith("blob:")) {
        try {
          const blobResp = await fetch(cam.source);
          const blob = await blobResp.blob();
          const file = new File([blob], cam.name);
          const form = new FormData();
          form.append("file", file);
          const resp = await fetch("http://127.0.0.1:8000/upload", { method: "POST", body: form });
          const data = await resp.json();
          videoParam = data.location;
          setCameras(prev => prev.map(c => c.id === cam.id ? { ...c, serverSource: videoParam } : c));
        } catch (err) { console.error("upload failed", err); }
      } else {
        videoParam = cam.source;
      }
    } else if (cam.source) {
      videoParam = cam.source;
    }

    const body: Record<string, string | number | undefined> = {
      camera_id: cam.id,
      scenario,
      video: videoParam,
      infer_every: inferEvery,
    };
    if (scenario === "metro_line" && linePoints.length === 2 && restrictedPoint) {
      const [p1, p2] = linePoints;
      body.line = `${p1.x},${p1.y},${p2.x},${p2.y}`;
      body.restricted_point = `${restrictedPoint.x},${restrictedPoint.y}`;
    }
    if (scenario === "zone_detection" && zonePoints.length >= 3) {
      body.zone = zonePoints.map(p => `${p.x},${p.y}`).join(";");
    }

    try {
      const resp = await fetch("http://127.0.0.1:8000/cameras/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const err = await resp.json();
        alert(`Failed to start: ${err.detail}`);
        return;
      }
    } catch (err) {
      console.error("cameras/start failed", err);
      return;
    }

    const streamUrl = `http://127.0.0.1:8000/cameras/stream/${cam.id}`;
    setCameraRunning(prev => ({ ...prev, [cam.id]: { scenario, saved: cam } }));
    setStreamStatus(prev => ({ ...prev, [cam.id]: "connecting" }));
    setCameras(prev => prev.map(c => c.id === cam.id
      ? { ...c, source: streamUrl, type: "ip" as const, name: `[${scenario}] ${c.name}` }
      : c
    ));
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

  // Shared helper: DOM click → video pixel coords
  const getCoordsFromClick = (
    e: React.MouseEvent<HTMLDivElement>,
    cam: Camera
  ): { x: number; y: number } | null => {
    if (!videoDims[cam.id]) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const dims = videoDims[cam.id];
    const vw = dims.w, vh = dims.h;
    const scale = Math.min(rect.width / vw, rect.height / vh);
    const contentW = vw * scale, contentH = vh * scale;
    const offsetX = (rect.width - contentW) / 2;
    const offsetY = (rect.height - contentH) / 2;
    let cx = e.clientX - rect.left - offsetX;
    let cy = e.clientY - rect.top - offsetY;
    cx = Math.max(0, Math.min(contentW, cx));
    cy = Math.max(0, Math.min(contentH, cy));
    return { x: Math.round(cx * (vw / contentW)), y: Math.round(cy * (vh / contentH)) };
  };

  const handleVideoClick = (
    e: React.MouseEvent<HTMLDivElement>,
    cam: Camera
  ) => {
    if (selectedCamera !== cam.id || cam.id === activeScenarioCamId) return;

    // Line drawing
    if (scenario === "metro_line" && drawingLine) {
      const pt = getCoordsFromClick(e, cam);
      if (!pt) return;
      if (linePoints.length < 2) {
        setLinePoints([...linePoints, pt]);
      } else if (!restrictedPoint) {
        setRestrictedPoint(pt);
        setDrawingLine(false);
      }
      return;
    }

    // Zone drawing
    if (scenario === "zone_detection" && drawingZone && !zoneClosed) {
      const pt = getCoordsFromClick(e, cam);
      if (!pt) return;
      setZonePoints(prev => [...prev, pt]);
      return;
    }
  };

  const handleVideoRightClick = (
    e: React.MouseEvent<HTMLDivElement>,
    cam: Camera
  ) => {
    e.preventDefault();
    if (scenario === "zone_detection" && drawingZone && zonePoints.length >= 3) {
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

    // upload the file so backend can access it for scenario processing
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

    // Reset file input
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
    if (cameras.length === 0) return 1;
    if (cameras.length === 1) return 1;
    if (cameras.length === 2) return 2;
    if (cameras.length === 3) return 2;
    return 2;
  };

  const renderCameraFeed = (camera: Camera) => {
    // common click handler and cursor style
    const isInteractive =
      (scenario === "metro_line" || scenario === "zone_detection") &&
      selectedCamera === camera.id &&
      camera.id !== activeScenarioCamId;

    const baseCursor = isInteractive ? "crosshair" : "default";

    const clickProps = {
      onClick: (e: React.MouseEvent<HTMLDivElement>) => handleVideoClick(e, camera),
    };

    // aspect ratio for this camera
    // until we know the real ratio default to square to avoid jumps
    const ratio = aspectRatios[camera.id] || 1;

    const wrapperStyle: React.CSSProperties = {
      width: "100%",
      position: "relative",
      aspectRatio: ratio,
      background: "black",
    };

    // helper that wraps content in a clickable overlay when in draw mode
    const withOverlay = (content: React.ReactNode) => {
      let wrapped = content;
      if ((drawingLine || drawingZone) && isInteractive) {
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
      // add SVG overlays (line + zone) always if we have video dims
      const dims = videoDims[camera.id];
      if (dims) {
        const makePct = (val: number, dim: number) => (val / dim) * 100;
        // Line overlay
        const linesPct = linePoints.map(p => ({
          x: makePct(p.x, dims.w),
          y: makePct(p.y, dims.h),
        }));
        const restrictedPct = restrictedPoint
          ? { x: makePct(restrictedPoint.x, dims.w), y: makePct(restrictedPoint.y, dims.h) }
          : null;
        // Zone overlay
        const zonePct = zonePoints.map(p => ({
          x: makePct(p.x, dims.w),
          y: makePct(p.y, dims.h),
        }));
        const zonePolyPts = zonePct.map(p => `${p.x}% ${p.y}%`).join(", ");

        wrapped = (
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            {wrapped}
            <svg
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {/* Line crossing overlay */}
              {linesPct.length >= 2 && (
                <line
                  x1={linesPct[0].x} y1={linesPct[0].y}
                  x2={linesPct[1].x} y2={linesPct[1].y}
                  stroke="#f59e0b" strokeWidth="0.6" // slightly thicker line
                />
              )}
              {linesPct.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="1.2" fill="#f59e0b" /> // larger anchor points
              ))}
              {restrictedPct && (
                <circle cx={restrictedPct.x} cy={restrictedPct.y} r="1.8" fill="#ef4444" /> // bigger restricted point
              )}
              {/* Zone overlay */}
              {zonePct.length >= 2 && !zoneClosed && zonePct.map((p, i) => {
                if (i === 0) return null;
                return (
                  <line
                    key={i}
                    x1={zonePct[i - 1].x} y1={zonePct[i - 1].y}
                    x2={p.x} y2={p.y}
                    stroke="#f97316" strokeWidth="0.6" strokeDasharray="1,0.5" // thicker zonal edge
                  />
                );
              })}
              {zonePct.map((p, i) => (
                <circle key={`zp-${i}`} cx={p.x} cy={p.y} r="1.2" fill="#f97316" />
              ))}
              {zoneClosed && zonePct.length >= 3 && (
                <polygon
                  points={zonePolyPts}
                  fill="rgba(239,68,68,0.25)"
                  stroke="#ef4444"
                  strokeWidth="0.6" // thicker closed zone border
                />
              )}
            </svg>
          </div>
        );
      }
      return wrapped;
    };

    // if this is a backend MJPEG stream, use <img> since <video> cannot handle
    // multipart/x-mixed-replace type
    if (
      camera.source.startsWith("http") &&
      camera.source.includes("/stream/") || camera.source.includes("/cameras/stream/")
    ) {
      // show status overlays for connecting/error
      const status = streamStatus[camera.id];
      return withOverlay(
        <div style={wrapperStyle}>
          {!videoReady && (
            <div style={{ ...styles.overlay, visibility: "visible" }}>
              Loading video…
            </div>
          )}
          {status === "connecting" && (
            <div style={styles.overlay}>Connecting…</div>
          )}
          {status === "error" && (
            <div style={styles.overlay}>Stream error – check console/server log</div>
          )}
          <img
            key={camera.id}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              cursor: baseCursor,
            }}
            src={camera.source}
            onLoad={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              if (img.naturalWidth && img.naturalHeight) {
                setAspectRatios(prev => ({
                  ...prev,
                  [camera.id]: img.naturalWidth / img.naturalHeight,
                }));
                setVideoDims(prev => ({
                  ...prev,
                  [camera.id]: { w: img.naturalWidth, h: img.naturalHeight },
                }));
              }
              setStreamStatus(prev => ({ ...prev, [camera.id]: "ok" }));
            }}
            onError={() => setStreamStatus(prev => ({ ...prev, [camera.id]: "error" }))}
          />
        </div>
      );
    }

    // For IP cameras (RTMP/HLS streams)
    if (camera.type === "ip" && camera.source.startsWith("http")) {
      return withOverlay(
        <div style={wrapperStyle}>
          <video
            key={camera.id}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
            controls={!drawingLine}
            autoPlay
            muted
            src={camera.source}
            onLoadedMetadata={(e) => {
              const vid = e.currentTarget as HTMLVideoElement;
              if (vid.videoWidth && vid.videoHeight) {
                setAspectRatios(prev => ({
                  ...prev,
                  [camera.id]: vid.videoWidth / vid.videoHeight,
                }));
              }
            }}
          />
        </div>
      );
    }
    // For webcam or live feeds
    if (camera.type === "webcam") {
      return (
        <div style={styles.cameraFeedContent} {...clickProps}>
          <div style={{ fontSize: "24px", marginBottom: "10px" }}></div>
          <p style={styles.cameraStatus}>{camera.source}</p>
        </div>
      );
    }
    // For uploaded video files
    if (camera.type === "file") {
      return withOverlay(
        <div style={wrapperStyle}>
          {!videoReady && (
            <div style={{ ...styles.overlay, visibility: "visible" }}>
              Loading video…
            </div>
          )}
          <video
            key={camera.id}
            data-cam-id={camera.id}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
            controls={!drawingLine}
            autoPlay={!drawingLine}
            loop
            src={camera.source}
            onLoadedMetadata={(e) => {
              const vid = e.currentTarget as HTMLVideoElement;
              if (vid.videoWidth && vid.videoHeight) {
                setAspectRatios(prev => ({
                  ...prev,
                  [camera.id]: vid.videoWidth / vid.videoHeight,
                }));
                setVideoDims(prev => ({
                  ...prev,
                  [camera.id]: { w: vid.videoWidth, h: vid.videoHeight },
                }));
              }
            }}
          />
        </div>
      );
    }
    return withOverlay(
      <div style={styles.cameraFeedContent}>
        <div style={styles.cameraIcon}></div>
        <p style={styles.cameraStatus}>{camera.status}</p>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      style={styles.page}
    >
      {/* HEADER */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Smart Surveillance System</h1>
          <p style={styles.subtitle}>Real-time video analysis and event detection</p>
        </div>
        <div style={styles.headerRight}>
          <div style={{
            ...styles.badge,
            background: status === "Running" ? "#16a34a" : "#dc2626",
            color: "#ffffff"
          }}>{status === "Running" ? "Active" : "Inactive"}</div>
          <button style={styles.badge} onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* MONITOR ZONES SECTION */}
      <div style={styles.monitorZonesSection}>
        <div style={styles.sectionTitle}>Monitor Zones</div>
        <p style={styles.emptyText}>No zones defined</p>
      </div>

      {/* MAIN GRID */}
      <div style={styles.mainGrid}>
        {/* LEFT VIDEO PANEL */}
        <div style={styles.videoPanel}>
          <div style={styles.videoPanelHeader}>
            <div style={styles.panelTitle}>Video Feed</div>
          </div>

          {cameras.length === 0 ? (
            <div style={styles.viewer}>
              <div style={styles.viewerPlaceholder}>
                <div style={styles.cameraIcon}></div>
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
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {/* Per-camera start/stop button */}
                      {scenario && (
                        <button
                          style={{
                            padding: "3px 10px",
                            borderRadius: 4,
                            border: "none",
                            background: cameraRunning[cam.id] ? "#dc2626" : "#06b6d4",
                            color: "white",
                            fontWeight: 600,
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartCameraScenario(cam);
                          }}
                        >
                          {cameraRunning[cam.id] ? "■ Stop" : "▶ Start"}
                        </button>
                      )}
                      <button
                        style={styles.removeButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveCamera(cam.id);
                        }}
                      >
                        X
                      </button>
                    </div>
                  </div>
                  {renderCameraFeed(cam)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT CONTROL PANEL */}
        <div style={styles.controlPanel}>
          <div style={styles.panelTitle}>Control Panel</div>

          {/* metric summary tiles arranged fixed like reference image */}
          <motion.div style={styles.metricsContainer} layout>
            {/* row 1 */}
            <div style={styles.metricsRow}>
              <div style={{ ...styles.metricTile, flex: 1, height: "100px", background: "linear-gradient(0deg, #a78bfa, #3100a5)" }}>
                <div style={styles.metricLabel}>Status</div>
                <div style={styles.metricValue}>{status}</div>
              </div>
              <div
                style={{
                  ...styles.metricTile,
                  width: "160px",
                  height: "100px",
                  background: "linear-gradient(0deg, #f87171, #dc2626)",
                  cursor: "pointer"
                }}
                onClick={() => setCameraMenuOpen(open => !open)}
              >
                <div style={styles.metricLabel}>Select Camera</div>
              </div>
            </div>
            <AnimatePresence mode="wait">
              {cameraMenuOpen && (
                <motion.div
                  layoutId="camera-menu"
                  style={{ ...styles.metricTile, flex: 1, background: "linear-gradient(0deg, #f87171, #dc2626)", marginTop: "12px", position: "relative" as const }}
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 100, marginTop: 12 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                >
                  <motion.div
                    style={{
                      ...styles.customDropdown,
                      height: customDropdownOpen ? "auto" : "auto"
                    }}
                  >
                    <div style={styles.customDropdownField}>
                      <input
                        type="text"

                        placeholder="Select a camera"
                        value={selectedCamera ? cameras.find(c => c.id === selectedCamera)?.name : ""}
                        readOnly
                        style={styles.customDropdownInput}
                        onClick={() => setCustomDropdownOpen(!customDropdownOpen)}
                      />
                      <span style={styles.customDropdownIcon}>▼</span>
                    </div>

                    <AnimatePresence>
                      {customDropdownOpen && (
                        <motion.div
                          style={styles.customDropdownList}
                          initial={{ opacity: 0, maxHeight: 0 }}
                          animate={{ opacity: 1, maxHeight: 400 }}
                          exit={{ opacity: 0, maxHeight: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div
                            style={{
                              ...styles.customDropdownListItem,
                              background: selectedCamera === null ? "rgba(255,255,255,0.2)" : "transparent",
                              color: "white"
                            }}
                            onClick={() => {
                              setSelectedCamera(null);
                              setCameraMenuOpen(false);
                              setCustomDropdownOpen(false);
                            }}
                          >
                            (none)
                          </div>
                          {cameras.map(cam => (
                            <div
                              key={cam.id}
                              style={{
                                ...styles.customDropdownListItem,
                                background: selectedCamera === cam.id ? "rgba(255,255,255,0.2)" : "transparent",
                                color: "white"
                              }}
                              onClick={() => {
                                setSelectedCamera(cam.id);
                                setCameraMenuOpen(false);
                                setCustomDropdownOpen(false);
                              }}
                            >
                              {cam.name}
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            {/* row 2 */}
            <motion.div style={styles.metricsRow} layout>
              <div style={{ ...styles.metricTile, width: "200px", height: "100px", background: "linear-gradient(180deg, #fb923c, #dc2626)" }}>
                <div style={styles.metricLabel}>Active Zones</div>
                <div style={styles.metricValue}>{activeZones}</div>
              </div>
              <div style={{ ...styles.metricTile, flex: 1, height: "100px", background: "linear-gradient(0deg, #23bfbc, #006989)" }}>
                <div style={styles.metricLabel}>Active Scenarios</div>
                <div style={styles.metricValue}>{scenario ? scenario : "None"}</div>
              </div>
            </motion.div>
            {/* row 3 */}
            <motion.div style={styles.metricsRow} layout>
              <div style={{ ...styles.metricTile, width: "100px", height: "100px", background: "linear-gradient(0deg, #6b7280, #38bdf8)" }}>
                <div style={styles.metricLabel}>Total Events</div>
                <div style={styles.metricValue}>{totalEvents}</div>
              </div>
              <div style={{ ...styles.metricTile, flex: 1, height: "100px", background: "linear-gradient(0deg, #f87171, #dc2626)" }}>
                <div style={styles.metricLabel}>Active Alerts</div>
                <div style={styles.metricValue}>{activeAlerts}</div>
              </div>
            </motion.div>
          </motion.div>

          {/* Select Scenario */}
          <div style={styles.controlSection}>
            <label style={styles.label}>Select Scenario</label>
            <div style={{ position: "relative" as const }}>
              <div
                style={{
                  ...styles.scenarioSelect,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
                onClick={() => setScenarioDropdownOpen(!scenarioDropdownOpen)}
              >
                <span>{scenario ? ({ behavior: "Behavior Detection", metro_line: "Line Crossing", zone_detection: "Zone Detection" } as Record<string, string>)[scenario] || scenario : "Choose a scenario"}</span>
                <span style={{ fontSize: 20, color: "#9ca3af", marginLeft: 8 }}>▼</span>
              </div>
              <AnimatePresence>
                {scenarioDropdownOpen && (
                  <motion.div
                    style={{
                      position: "absolute" as const,
                      top: "100%",
                      left: 0,
                      right: 0,
                      background: "#ffffff",
                      borderRadius: "10px",
                      border: "1px solid #e5e7eb",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      zIndex: 9999,
                      overflow: "hidden",
                      marginTop: "6px",
                    }}
                    initial={{ opacity: 0, maxHeight: 0 }}
                    animate={{ opacity: 1, maxHeight: 400 }}
                    exit={{ opacity: 0, maxHeight: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {[
                      { value: "", label: "Choose a scenario" },
                      { value: "behavior", label: "Behavior Detection" },
                      { value: "metro_line", label: "Line Crossing" },
                      { value: "zone_detection", label: "Zone Detection" },
                    ].map((opt) => (
                      <div
                        key={opt.value}
                        style={{
                          padding: "12px 16px",
                          fontSize: "18px",
                          cursor: "pointer",
                          background: scenario === opt.value || (!scenario && opt.value === "") ? "#f0f0f0" : "transparent",
                          color: "#1a1a1a",
                          fontWeight: scenario === opt.value ? 600 : 400,
                          borderBottom: "1px solid #f0f0f0",
                          transition: "background 0.15s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = scenario === opt.value || (!scenario && opt.value === "") ? "#f0f0f0" : "transparent")}
                        onClick={() => {
                          setScenario(opt.value || null);
                          setLinePoints([]);
                          setRestrictedPoint(null);
                          setScenarioDropdownOpen(false);
                        }}
                      >
                        {opt.label}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* scenario-specific configuration */}
          {scenario === "metro_line" && (
            <div style={styles.controlSection}>
              <p style={{ margin: "8px 0", fontSize: 20 }}>
                {drawingLine
                  ? "Click two points to draw the line, then a third point for the restricted side."
                  : "Press the button below to start defining the line on the selected camera feed."}
              </p>
              <button
                style={styles.smallButton}
                onClick={() => {
                  setDrawingLine(!drawingLine);
                  if (!drawingLine) {
                    // starting new drawing – clear previous
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

          {/* Start/Stop Button and Draw Zone Button in single row */}
          <div style={styles.buttonRow}>
            <button style={styles.startButton} onClick={handleStartScenario}>
              {status === "Running" ? "■ Stop" : "▶ Start"}
            </button>

            {/* Draw Zone Button — shown only when no zone scenario active */}
            {scenario !== "zone_detection" && (
              <button style={styles.drawZoneButton}>
                Draw New Zone
              </button>
            )}
          </div>

          {/* Zone drawing UI */}
          {scenario === "zone_detection" && (
            <div style={styles.controlSection}>
              <p style={{ margin: "8px 0", fontSize: 14 }}>
                {drawingZone
                  ? "Click to add zone points. Right-click or press Close Zone when done."
                  : "Press Draw Zone to start defining a polygon on the camera feed."}
              </p>
              {!zoneClosed ? (
                <button
                  style={styles.smallButton}
                  onClick={() => {
                    if (!drawingZone) {
                      setDrawingZone(true);
                      setZonePoints([]);
                      setZoneClosed(false);
                    } else if (zonePoints.length >= 3) {
                      setZoneClosed(true);
                      setDrawingZone(false);
                    } else {
                      setDrawingZone(false);
                      setZonePoints([]);
                    }
                  }}
                  disabled={!videoReady}
                >
                  {!drawingZone ? "Draw Zone" : zonePoints.length >= 3 ? "Close Zone" : "Cancel"}
                </button>
              ) : (
                <button
                  style={{ ...styles.smallButton, background: "#dc2626" }}
                  onClick={() => { setZonePoints([]); setZoneClosed(false); setDrawingZone(false); }}
                >
                  Clear Zone
                </button>
              )}
              <p style={{ margin: "4px 0", fontSize: 12, color: "#9ca3af" }}>
                Points: {zonePoints.length} {zoneClosed ? "(closed)" : ""}
              </p>
            </div>
          )}


        </div>

        {/* THRESHOLD SETTINGS */}
        <div style={styles.thresholdSection}>
          <div style={styles.panelTitle}>Threshold Settings</div>

          <div style={styles.thresholdControl}>
            <label style={styles.thresholdLabel}>Inference Quality</label>
            {/* Slider: 1=Quality, 2=Balanced, 3=Performance */}
            <div style={styles.sliderContainer}>

              <CustomSlider
                min={1}
                max={3}
                step={1}
                value={4 - inferEvery}
                onChange={(val) => setInferEvery(4 - val)}
                style={{ flex: 1 }}
              />

            </div>
            {/* Tick labels */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
              {["Performance", "Balanced", "Quality"].map((label, i) => (
                <span
                  key={label}
                  style={{
                    fontSize: 18,
                    fontFamily: "Google Sans Medium",
                    fontWeight: (4 - inferEvery) === i + 1 ? 700 : 400,
                    color: (4 - inferEvery) === i + 1 ? "#06b6d4" : "#6b7280",
                    cursor: "pointer",
                    flex: 1,
                    textAlign: i === 0 ? "left" : i === 2 ? "right" : "center",
                  }}
                  onClick={() => setInferEvery(3 - i)}
                >
                  {label}
                </span>
              ))}
            </div>
            <p style={styles.thresholdDescription}>
              {inferEvery === 1 ? "Every frame — highest accuracy, most GPU load" :
                inferEvery === 2 ? "Every 2nd frame — balanced accuracy and load" :
                  "Every 3rd frame — lightest load, boxes persist between frames"}
            </p>
          </div>

          <div style={styles.thresholdControl}>
            <label style={styles.thresholdLabel}>Loitering Threshold</label>
            <div style={styles.sliderContainer}>
              <span style={{ minWidth: 64 }} />
              <CustomSlider
                min={5}
                max={30}
                step={1}
                value={loiteringThreshold}
                onChange={(val) => setLoiteringThreshold(val)}
                style={{ flex: 1 }}
                showTicks={false}
              />
              <span style={{ ...styles.thresholdValue, minWidth: 48 }}>{loiteringThreshold}s</span>
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
            <div style={styles.panelTitle}>Recorded Videos</div>
            <div style={styles.bottomButtons}>
              <button style={styles.addButton} onClick={() => setShowAddCameraModal(true)}>+ Add Camera</button>
              <button style={styles.uploadButton} onClick={handleUploadVideo}>Upload Video</button>
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
          <div style={styles.panelTitle}>Event Log</div>
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
                X
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
    </motion.div>
  );
}



const styles: any = {
  page: {
    background: "#0c0c0c",
    minHeight: "100vh",
    color: "#e5e7eb",
    padding: "24px",
    fontFamily: "Google Sans Medium"
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "28px"
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
    color: "#888888"
  },

  badge: {
    background: "#ffffff",
    padding: "8px 18px",
    borderRadius: "24px",
    border: "none",
    fontSize: "25px",
    fontFamily: "Google Sans, sans-serif",
    fontWeight: "500",
    color: "#1a1a1a",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
  },

  monitorZonesSection: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "22px",
    border: "1px solid #e5e7eb",
    marginBottom: "20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
  },

  sectionTitle: {
    fontWeight: "600",
    marginBottom: "15px",
    color: "#1a1a1a",
    fontSize: "30px"
  },

  mainGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gridTemplateRows: "auto auto",
    gap: "20px",
    marginBottom: "20px"
  },

  videoPanel: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "18px",
    border: "1px solid #e5e7eb",
    gridRow: "1 / 3",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
  },

  controlPanel: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "22px",
    border: "1px solid #e5e7eb",
    gridRow: "1",
    gridColumn: "2",
    height: "fit-content",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
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
    color: "#1a1a1a",
    fontSize: "35px"
  },

  controlSection: {
    marginBottom: "15px"
  },

  label: {
    fontSize: "13px",
    color: "#6b7280",
    display: "block",
    marginBottom: "8px"
  },

  scenarioSelect: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #e5e7eb",
    background: "#f5f5f5",
    color: "#1a1a1a",
    fontSize: "13px",
    cursor: "pointer",
    outline: "none"
  },

  buttonRow: {
    display: "flex",
    gap: "12px",
    marginBottom: "0px"

  },

  startButton: {
    flex: 1,
    padding: "20px",
    borderRadius: "20px",
    border: "none",
    background: "#1a1a1a",
    color: "white",
    fontFamily: "Google Sans, sans-serif",
    fontWeight: "500",
    cursor: "pointer",
    fontSize: "19px",
    transition: "background 0.2s ease"
  },

  drawZoneButton: {
    flex: 1,
    padding: "20px",
    borderRadius: "20px",
    border: "1px solid #e5e7eb",
    background: "transparent",
    color: "#1a1a1a",
    fontFamily: "Google Sans, sans-serif",
    fontWeight: "500",
    cursor: "pointer",
    fontSize: "19px",
    transition: "background 0.2s ease"
  },

  smallButton: {
    padding: "8px 14px",
    borderRadius: "8px",
    border: "none",
    background: "#1a1a1a",
    color: "white",
    cursor: "pointer",
    fontSize: "13px",
    margin: "6px 0",
    fontWeight: "500"
  },

  statusBox: {
    marginTop: "20px",
    padding: "16px",
    borderRadius: "12px",
    background: "#f8f8f8",
    border: "1px solid #e5e7eb"
  },

  statusRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px",
    fontSize: "13px"
  },

  statusLabel: {
    color: "#6b7280"
  },

  statusValue: {
    fontWeight: "600",
    color: "#1a1a1a"
  },

  // new metric tile styles
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: "12px",
    margin: "20px 0"
  },

  metricTile: {
    padding: "12px 16px",
    borderRadius: "20px",
    color: "white",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "90px",
    fontSize: "14px"
  },

  metricLabel: {
    fontSize: "17px",
    opacity: 0.9,
    marginBottom: "4px",
    textAlign: "center" as const
  },

  metricValue: {
    fontSize: "26px",
    fontWeight: 600,
    textAlign: "center" as const
  },

  metricSelect: {
    padding: "4px 8px",
    borderRadius: "8px",
    border: "none",
    fontSize: "13px",
    width: "100%",
    textAlign: "center" as const,
    background: "rgba(255,255,255,0.2)",
    color: "white"
  },

  metricsContainer: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
    margin: "20px 0"
  },

  metricsRow: {
    display: "flex",
    gap: "12px"
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
    borderRadius: "10px",
    border: "1px solid #e5e7eb",
    background: "#f5f5f5",
    color: "#1a1a1a",
    fontSize: "13px",
    cursor: "pointer",
    minWidth: "150px",
    outline: "none"
  },

  noCamera: {
    padding: "8px 12px",
    borderRadius: "10px",
    border: "1px solid #e5e7eb",
    background: "#f5f5f5",
    color: "#6b7280",
    fontSize: "13px",
    cursor: "pointer"
  },

  viewer: {
    height: "65vh",
    background: "#0a0a0a",
    borderRadius: "14px",
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
    background: "#0a0a0a",
    borderRadius: "14px",
    border: "1px solid #e5e7eb",
    overflow: "hidden",
    minHeight: "250px",
    cursor: "pointer",
    transition: "all 0.2s ease"
  },

  cameraFeedHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    background: "#f8f8f8",
    borderBottom: "1px solid #e5e7eb"
  },

  cameraName: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#1a1a1a"
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
    borderRadius: "6px",
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
    background: "black",
    borderRadius: "10px",
    objectFit: "cover" as const
  },

  modalOverlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.6)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000
  },

  modal: {
    background: "#ffffff",
    borderRadius: "20px",
    border: "1px solid #e5e7eb",
    width: "90%",
    maxWidth: "500px",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)"
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "22px 24px",
    borderBottom: "1px solid #f0f0f0"
  },

  modalTitle: {
    margin: "0",
    fontSize: "18px",
    fontWeight: "700",
    color: "#1a1a1a"
  },

  modalCloseButton: {
    background: "#f5f5f5",
    border: "none",
    color: "#6b7280",
    fontSize: "18px",
    cursor: "pointer",
    padding: "0",
    width: "32px",
    height: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "10px",
    transition: "background 0.2s"
  },

  modalBody: {
    padding: "24px"
  },

  formGroup: {
    marginBottom: "16px"
  },

  formLabel: {
    display: "block",
    fontSize: "13px",
    fontWeight: "600",
    marginBottom: "8px",
    color: "#1a1a1a"
  },

  formInput: {
    width: "100%",
    padding: "11px 14px",
    borderRadius: "10px",
    border: "1px solid #e5e7eb",
    background: "#f5f5f5",
    color: "#1a1a1a",
    fontSize: "13px",
    boxSizing: "border-box" as const,
    outline: "none",
    transition: "border-color 0.2s ease"
  },

  formSelect: {
    width: "100%",
    padding: "11px 14px",
    borderRadius: "10px",
    border: "1px solid #e5e7eb",
    background: "#f5f5f5",
    color: "#1a1a1a",
    fontSize: "13px",
    cursor: "pointer",
    boxSizing: "border-box" as const,
    outline: "none"
  },

  helpText: {
    background: "#f8f8f8",
    padding: "14px",
    borderRadius: "10px",
    marginBottom: "16px",
    fontSize: "12px",
    color: "#6b7280",
    border: "1px solid #f0f0f0"
  },

  modalFooter: {
    display: "flex",
    gap: "10px",
    justifyContent: "flex-end",
    padding: "18px 24px",
    borderTop: "1px solid #f0f0f0"
  },

  cancelButton: {
    padding: "10px 18px",
    borderRadius: "10px",
    border: "1px solid #e5e7eb",
    background: "transparent",
    color: "#6b7280",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "13px",
    transition: "background 0.2s ease"
  },

  confirmButton: {
    padding: "10px 18px",
    borderRadius: "10px",
    border: "none",
    background: "#1a1a1a",
    color: "white",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "13px",
    transition: "background 0.2s ease"
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
    color: "#9ca3af",
    fontWeight: "500"
  },

  placeholderSubtext: {
    margin: "8px 0 0 0",
    fontSize: "14px",
    color: "#6b7280"
  },

  thresholdControl: {
    marginBottom: "20px"
  },

  thresholdLabel: {
    display: "block",
    fontSize: "18px",
    fontWeight: "500",
    marginBottom: "10px",
    color: "#1a1a1a"
  },

  sliderContainer: {
    display: "flex",
    alignItems: "center",
    gap: "15px",
    marginBottom: "8px"
  },

  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 12
  },

  slider: {
    flex: 1,
    height: "6px",
    borderRadius: "3px",
    background: "#e5e7eb",
    outline: "none",
    cursor: "pointer",
    WebkitAppearance: "none" as any,
    appearance: "none" as any
  },
  logoutBtn: {
    background: "#ffffff",
    padding: "8px 18px",
    borderRadius: "24px",
    border: "none",
    color: "#1a1a1a",
    fontSize: 14,
    fontWeight: 500,
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    cursor: "pointer"
  },

  thresholdValue: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#1a1a1a",
    minWidth: "48px",
    textAlign: "right"
  },

  thresholdDescription: {
    margin: "6px 0 0 0",
    fontSize: "12px",
    color: "#9ca3af"
  },

  updateButton: {
    width: "100%",
    padding: "25px",
    borderRadius: "20px",
    border: "none",
    background: "#1a1a1a",
    color: "white",
    fontFamily: "Google Sans, sans-serif",
    fontWeight: "500",
    cursor: "pointer",
    fontSize: "20px",
    transition: "background 0.2s ease"
  },

  bottomGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    marginTop: "0"
  },

  bottomPanel: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "22px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
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
    padding: "8px 16px",
    borderRadius: "10px",
    border: "none",
    background: "#1a1a1a",
    color: "white",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "12px",
    transition: "background 0.2s ease"
  },

  uploadButton: {
    padding: "8px 16px",
    borderRadius: "10px",
    border: "1px solid #e5e7eb",
    background: "transparent",
    color: "#1a1a1a",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "12px",
    transition: "background 0.2s ease"
  },

  tabsContainer: {
    display: "flex",
    gap: "12px",
    marginBottom: "15px",
    borderBottom: "1px solid #f0f0f0",
    paddingBottom: "10px"
  },

  tabActive: {
    padding: "6px 0",
    background: "transparent",
    border: "none",
    color: "#1a1a1a",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    borderBottom: "2px solid #1a1a1a",
    paddingBottom: "8px"
  },

  tabInactive: {
    padding: "6px 0",
    background: "transparent",
    border: "none",
    color: "#9ca3af",
    fontSize: "13px",
    fontWeight: "500",
    cursor: "pointer",
    borderBottom: "none"
  },

  emptyText: {
    margin: "20px 0",
    fontSize: "13px",
    color: "#9ca3af"
  },

  customDropdown: {
    width: "100%",
    position: "relative" as const
  },

  customDropdownField: {
    position: "relative" as const,
    width: "100%",
    color: "black"
  },

  customDropdownInput: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "none",
    background: "rgba(255,255,255,0.2)",
    color: "white",
    fontSize: "13px",
    cursor: "pointer",
    outline: "none",
    appearance: "none" as const,
    paddingRight: "32px",
    fontWeight: "500"
  },

  customDropdownIcon: {
    position: "absolute" as const,
    right: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "rgba(255,255,255,0.6)",
    fontSize: "11px",
    pointerEvents: "none" as const
  },

  customDropdownList: {
    position: "absolute" as const,
    top: "100%",
    left: 0,
    right: 0,
    background: "linear-gradient(135deg, #f87171, #dc2626)",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.2)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    zIndex: 9999,
    overflow: "hidden",
    marginTop: "6px"
  },

  customDropdownListItem: {
    padding: "10px 14px",
    border: "none",
    background: "transparent",
    color: "rgba(255,255,255,0.8)",
    fontSize: "13px",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "all 0.15s ease",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    fontWeight: "400",
    display: "flex",
    alignItems: "center"
  },

  customDropdownButton: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.3)",
    background: "rgba(255,255,255,0.1)",
    color: "white",
    fontSize: "13px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    transition: "all 0.2s ease",
    fontWeight: "500",
    marginBottom: "6px"
  },

  customDropdownOptions: {
    position: "absolute" as const,
    top: "100%",
    left: 0,
    right: 0,
    background: "#ef4444",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.2)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    zIndex: 10,
    overflow: "hidden"
  },

  customDropdownOption: {
    width: "100%",
    padding: "10px 14px",
    border: "none",
    background: "transparent",
    color: "white",
    fontSize: "13px",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "background 0.15s ease",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    fontWeight: "500"
  },

  emptyText2: {
    margin: "0 0 10px 0",
    fontSize: "12px",
    color: "#9ca3af"
  }
};
