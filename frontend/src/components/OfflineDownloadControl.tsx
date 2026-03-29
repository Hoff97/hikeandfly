import {
  Button,
  Callout,
  Classes,
  Dialog,
  H5,
  HTMLTable,
  ProgressBar,
} from "@blueprintjs/core";
import { Download, Trash } from "@blueprintjs/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Rectangle, useMap, useMapEvents } from "react-leaflet";
import {
  buildTileZoomLevels,
  clearOfflineDownloads,
  deleteOfflineDownload,
  downloadOfflineWindow,
  type OfflineDownloadProgress,
  type OfflineDownloadRecord,
  getOfflineDownloadForBounds,
  getPreferredOfflineGridSize,
  listOfflineDownloads,
} from "../utils/offline";
import type { SetSettings, Settings } from "../utils/types";

interface OfflineDownloadControlProps {
  settings: Settings;
  setSettings: SetSettings;
  onStartupReady?: () => void;
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
  onStartupReady,
}: OfflineDownloadControlProps) {
  const map = useMap();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [downloads, setDownloads] = useState<OfflineDownloadRecord[]>([]);
  const [progress, setProgress] = useState<OfflineDownloadProgress>(EMPTY_PROGRESS);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [coveredDownloadId, setCoveredDownloadId] = useState<string | undefined>();
  const startupReadyRef = useRef(false);

  const currentBounds = map.getBounds();
  const currentZoom = Math.round(map.getZoom());

  const tileZoomLabel = useMemo(() => {
    return buildTileZoomLevels(currentZoom).join(", ");
  }, [currentZoom]);

  async function refreshDownloads() {
    const items = await listOfflineDownloads();
    setDownloads(items.sort((a, b) => b.createdAt - a.createdAt));
  }

  async function syncOfflineState() {
    const bounds = map.getBounds();
    const coveredDownload = await getOfflineDownloadForBounds(bounds);
    setCoveredDownloadId(coveredDownload?.id);

    if (navigator.onLine) {
      return;
    }

    const preferred = await getPreferredOfflineGridSize(bounds);
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
    let cancelled = false;

    const initialize = async () => {
      await refreshDownloads();
      if (cancelled) {
        return;
      }
      await syncOfflineState();
      if (!cancelled && !startupReadyRef.current) {
        startupReadyRef.current = true;
        onStartupReady?.();
      }
    };

    void initialize();

    const handleConnectivityChange = () => {
      void syncOfflineState();
    };
    window.addEventListener("online", handleConnectivityChange);
    window.addEventListener("offline", handleConnectivityChange);
    return () => {
      cancelled = true;
      window.removeEventListener("online", handleConnectivityChange);
      window.removeEventListener("offline", handleConnectivityChange);
    };
  }, [map, onStartupReady]);

  useMapEvents({
    moveend() {
      void syncOfflineState();
    },
  });

  async function handleDownloadConfirm() {
    setIsDownloading(true);
    try {
      await downloadOfflineWindow(
        currentBounds,
        settings.gridSize,
        currentZoom,
        setProgress,
      );
      await refreshDownloads();
      await syncOfflineState();
      setIsDialogOpen(false);
      setTimeout(() => {
        setProgress(EMPTY_PROGRESS);
      }, 2500);
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleDeleteDownload(downloadId: string) {
    setIsDeleting(true);
    try {
      await deleteOfflineDownload(downloadId);
      await refreshDownloads();
      await syncOfflineState();
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleClearAllDownloads() {
    setIsDeleting(true);
    try {
      await clearOfflineDownloads();
      await refreshDownloads();
      await syncOfflineState();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      {downloads.map((download) => (
        <Rectangle
          key={download.id}
          bounds={[
            [download.bounds[0], download.bounds[1]],
            [download.bounds[2], download.bounds[3]],
          ]}
          pathOptions={{
            color: coveredDownloadId === download.id ? "#1a7a42" : "#2d6a4f",
            weight: coveredDownloadId === download.id ? 3 : 2,
            opacity: coveredDownloadId === download.id ? 0.9 : 0.65,
            fillOpacity: coveredDownloadId === download.id ? 0.15 : 0.07,
          }}
        />
      ))}
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
        className="offlineDialog"
      >
        <div className={Classes.DIALOG_BODY}>
          <Callout>
            The current viewport will be stored for offline use with height maps at {settings.gridSize} m grid size, flying-site data, and map tiles (OpenTopoMap Proxy) for zoom levels {tileZoomLabel}.
          </Callout>
          {coveredDownloadId !== undefined ? (
            <Callout intent="success" className="offlineCoverageCallout">
              The current viewport is already covered by a downloaded area.
            </Callout>
          ) : null}
          <p>
            Viewport: {currentBounds.getSouth().toFixed(4)}, {currentBounds.getWest().toFixed(4)} to {currentBounds.getNorth().toFixed(4)}, {currentBounds.getEast().toFixed(4)}
          </p>
          <p>
            Existing downloaded windows: {downloads.length}
          </p>
          {downloads.length > 0 ? (
            <>
              <div className="offlineDownloadsHeaderRow">
                <H5>Downloaded areas</H5>
                <Button
                  minimal
                  intent="danger"
                  disabled={isDownloading || isDeleting}
                  onClick={handleClearAllDownloads}
                >
                  Remove all
                </Button>
              </div>
              <HTMLTable condensed striped className="offlineDownloadsTable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Grid</th>
                    <th>Layer</th>
                    <th>Tiles</th>
                    <th>Sites</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {downloads.map((download) => (
                    <tr key={download.id}>
                      <td>{new Date(download.createdAt).toLocaleString()}</td>
                      <td>{download.gridSize} m</td>
                      <td>{download.baseLayerName}</td>
                      <td>{download.tileCount}</td>
                      <td>{download.siteCount}</td>
                      <td className="offlineDownloadActions">
                        <Button
                          small
                          minimal
                          onClick={() =>
                            map.fitBounds([
                              [download.bounds[0], download.bounds[1]],
                              [download.bounds[2], download.bounds[3]],
                            ])
                          }
                          disabled={isDownloading || isDeleting}
                        >
                          Show
                        </Button>
                        <Button
                          small
                          minimal
                          intent="danger"
                          icon={<Trash />}
                          onClick={() => handleDeleteDownload(download.id)}
                          disabled={isDownloading || isDeleting}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </HTMLTable>
            </>
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
              disabled={!navigator.onLine || isDeleting}
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