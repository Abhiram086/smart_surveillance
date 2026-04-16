import { useState, useEffect } from "react";

export function useAdminHydration(adminId: string, setCameras?: any) {
  const [continuousRunning, setContinuousRunning] = useState<boolean>(false);
  const [savedConfigs, setSavedConfigs] = useState<any[]>([]);
  const [activeCameraIds, setActiveCameraIds] = useState<string[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);

  // Passed setCameras setter to the hook to manipulate main UI state
  useEffect(() => {
    if (!adminId) return;

    const hydrate = async () => {
      try {
        setIsHydrating(true);
        // 1. Fetch settings (continuous running state)
        const settingsRes = await fetch(`http://127.0.0.1:8000/api/config/settings/${adminId}`);
        if (settingsRes.ok) {
          const settingsObj = await settingsRes.json();
          setContinuousRunning(!!settingsObj.continuous_running);
        }

        // 2. Fetch restored camera configs
        const configsRes = await fetch(`http://127.0.0.1:8000/api/config/cameras/${adminId}`);
        if (configsRes.ok) {
          const configsObj = await configsRes.json();
          const loadedCameras = configsObj.cameras || [];
          setSavedConfigs(loadedCameras);

          // Map database config to the UI's Camera type and append to state
          if (setCameras) {
            const mappedCameras = loadedCameras.map((cam: any) => ({
              id: cam.camera_id,
              name: cam.camera_name,
              scenario: cam.scenario,
              status: "Active",
              source: `http://127.0.0.1:8000/cameras/stream/${cam.camera_id}`,
              type: "ip"
            }));

            // Safely push into existing state array, avoiding duplicates
            setCameras((prevCams: any[]) => {
              const existingIds = new Set(prevCams.map(p => p.id));
              const newCams = mappedCameras.filter((c: any) => !existingIds.has(c.id));
              return [...prevCams, ...newCams];
            });
          }
        }

        // 3. Fetch backend active memory to see which cameras are currently live
        const activeRes = await fetch(`http://127.0.0.1:8000/api/cameras/live-status/${adminId}`);
        if (activeRes.ok) {
          const activeObj = await activeRes.json();
          setActiveCameraIds(activeObj.active_cameras || []);
        }

      } catch (err) {
        console.error("Failed to hydrate admin state from backend", err);
      } finally {
        setIsHydrating(false);
      }
    };

    hydrate();
  }, [adminId, setCameras]);

  return {
    continuousRunning,
    setContinuousRunning,
    savedConfigs,
    activeCameraIds,
    isHydrating,
  };
}
