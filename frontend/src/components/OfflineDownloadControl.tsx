import {
  Button,
  Callout,
  Classes,
  Dialog,
  HTMLTable,
  ProgressBar,
} from "@blueprintjs/core";
import { Download } from "@blueprintjs/icons";
import { useEffect, useMemo, useState } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import {
  downloadOfflineWindow,
  type OfflineDownloadProgress,
  type OfflineDownloadRecord,
  getPreferredOfflineGridSize,
  listOfflineDownloads,
} from "../utils/offline";
import type { SetSettings, Settings } from "../utils/types";

interface OfflineDownloadControlProps {
  settings: Settings;
  setSettings: SetSettings;
}

const EMPTY_PROGRESS: OfflineDownloadProgress = {
  active: false,
  label: "",
  completed: 0,
  total: 1,
};

export function OfflineDownloadControl({
  settings,
  setSettings,
}: OfflineDownloadControlProps) {
  const map = useMap();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [downloads, setDownloads] = useState<OfflineDownloadRecord[]>([]);
  const [progress, setProgress] = useState<OfflineDownloadProgress>(EMPTY_PROGRESS);
  const [isDownloading, setIsDownloading] = useState(false);

  const currentBounds = map.getBounds();
  const currentZoom = Math.round(map.getZoom());
  const baseLayerName = window.localStorage.getItem("enabledBaseLayer") || "OpenTopoMap";

  const tileZoomLabel = useMemo(() => {
    const zooms: number[] = [];
    for (let zoom = Math.max(0, currentZoom - 2); zoom <= Math.min(18, currentZoom + 2); zoom += 2) {
      zooms.push(zoom);
    }
    return zooms.join(", ");
  }, [currentZoom]);

  async function refreshDownloads() {
    const items = await listOfflineDownloads();
    setDownloads(items.sort((a, b) => b.createdAt - a.createdAt));
  }

  async function syncOfflineGridSize() {
    if (navigator.onLine) {
      return;
    }
    const preferred = await getPreferredOfflineGridSize(map.getBounds());
    if (preferred === undefined) {
      return;
    }
    setSettings((prev) => {
      if (prev.gridSize === preferred && prev.localComputeEnabled) {
        return prev;
      }
      return {
        ...prev,
        gridSize: preferred,
        localComputeEnabled: true,
      };
    });
  }

  useEffect(() => {
    refreshDownloads();
    syncOfflineGridSize();

    const handleConnectivityChange = () => {
      syncOfflineGridSize();
    };
    window.addEventListener("online", handleConnectivityChange);
    window.addEventListener("offline", handleConnectivityChange);
    return () => {
      window.removeEventListener("online", handleConnectivityChange);
      window.removeEventListener("offline", handleConnectivityChange);
    };
  }, []);

  useMapEvents({
    moveend() {
      syncOfflineGridSize();
    },
  });

  async function handleDownloadConfirm() {
    setIsDownloading(true);
    try {
      await downloadOfflineWindow(
        currentBounds,
        settings.gridSize,
        currentZoom,
        baseLayerName,
        setProgress,
      );
      await refreshDownloads();
      setIsDialogOpen(false);
      setTimeout(() => {
        setProgress(EMPTY_PROGRESS);
      }, 2500);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <>
      <Button
        icon={<Download />}
        text="Offline"
        className="offlineButton"
        intent="success"
        onClick={() => {
          refreshDownloads();
          setIsDialogOpen(true);
        }}
      />
      <Dialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="Download Offline Data"
      >
        <div className={Classes.DIALOG_BODY}>
          <Callout>
            The current viewport will be stored for offline use with height maps at {settings.gridSize} m grid size, flying-site data, and map tiles for zoom levels {tileZoomLabel}.
          </Callout>
          <p>
            Base layer: <strong>{baseLayerName}</strong>
          </p>
          <p>
            Viewport: {currentBounds.getSouth().toFixed(4)}, {currentBounds.getWest().toFixed(4)} to {currentBounds.getNorth().toFixed(4)}, {currentBounds.getEast().toFixed(4)}
          </p>
          <p>
            Existing downloaded windows: {downloads.length}
          </p>
          {downloads.length > 0 ? (
            <HTMLTable condensed striped className="offlineDownloadsTable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Grid</th>
                  <th>Layer</th>
                  <th>Sites</th>
                </tr>
              </thead>
              <tbody>
                {downloads.slice(0, 5).map((download) => (
                  <tr key={download.id}>
                    <td>{new Date(download.createdAt).toLocaleString()}</td>
                    <td>{download.gridSize} m</td>
                    <td>{download.baseLayerName}</td>
                    <td>{download.siteCount}</td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
          ) : null}
          {!navigator.onLine ? (
            <Callout intent="warning">
              You are currently offline. Downloading requires an active connection.
            </Callout>
          ) : null}
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button onClick={() => setIsDialogOpen(false)} disabled={isDownloading}>
              Cancel
            </Button>
            <Button
              intent="primary"
              onClick={handleDownloadConfirm}
              loading={isDownloading}
              disabled={!navigator.onLine}
            >
              Download current viewport
            </Button>
          </div>
        </div>
      </Dialog>
      {(progress.active || progress.label !== "") ? (
        <div className="offlineProgressBar">
          <div className="offlineProgressLabel">{progress.label}</div>
          <ProgressBar
            value={progress.total > 0 ? progress.completed / progress.total : 0}
            animate={progress.active}
            stripes={progress.active}
            intent={progress.active ? "primary" : "success"}
          />
        </div>
      ) : null}
    </>
  );
}