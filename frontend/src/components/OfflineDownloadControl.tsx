import {
  Button,
  Callout,
  Checkbox,
  Classes,
  Dialog,
  H5,
  HTMLTable,
  ProgressBar,
} from "@blueprintjs/core";
import { Download, Trash } from "@blueprintjs/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { LatLngBounds } from "leaflet";
import { Rectangle, useMap, useMapEvents } from "react-leaflet";
import {
  buildTileZoomLevels,
  clearOfflineDownloads,
  deleteOfflineDownload,
  downloadOfflineWindow,
  OFFLINE_TILE_LAYERS,
  setOfflineAreaSelectionActive,
  type OfflineTileLayer,
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
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [drawStart, setDrawStart] = useState<{ lat: number; lng: number } | undefined>();
  const [selectedBounds, setSelectedBounds] = useState<LatLngBounds | undefined>();
  const [selectedTileLayers, setSelectedTileLayers] = useState<OfflineTileLayer[]>([
    "OpenTopoMap Proxy",
  ]);
  const startupReadyRef = useRef(false);

  const currentBounds = selectedBounds ?? map.getBounds();
  const currentZoom = Math.round(map.getZoom());

  const tileZoomLabel = useMemo(() => {
    return buildTileZoomLevels(currentZoom).join(", ");
  }, [currentZoom]);

  const formatGridSize = (gridSize: number) => `${Math.round(gridSize)} m`;

  const getDownloadLayersLabel = (download: OfflineDownloadRecord) => {
    const layers =
      download.tileLayers && download.tileLayers.length > 0
        ? download.tileLayers
        : [download.baseLayerName || "OpenTopoMap Proxy"];
    return layers.join(", ");
  };

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

  useEffect(() => {
    setOfflineAreaSelectionActive(isDrawMode);
    return () => setOfflineAreaSelectionActive(false);
  }, [isDrawMode]);

  useMapEvents({
    moveend() {
      void syncOfflineState();
    },
    mousedown(e) {
      if (!isDrawMode) {
        return;
      }
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      setDrawStart({ lat: e.latlng.lat, lng: e.latlng.lng });
      setSelectedBounds(new LatLngBounds(e.latlng, e.latlng));
    },
    mousemove(e) {
      if (!isDrawMode || drawStart === undefined) {
        return;
      }
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      setSelectedBounds(
        new LatLngBounds([drawStart.lat, drawStart.lng], [e.latlng.lat, e.latlng.lng]),
      );
    },
    mouseup(e) {
      if (!isDrawMode || drawStart === undefined) {
        return;
      }
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      setSelectedBounds(
        new LatLngBounds([drawStart.lat, drawStart.lng], [e.latlng.lat, e.latlng.lng]),
      );
      setDrawStart(undefined);
      setIsDrawMode(false);
      map.dragging.enable();
      setIsDialogOpen(true);
    },
  });

  useEffect(() => {
    return () => {
      if (!map.dragging.enabled()) {
        map.dragging.enable();
      }
    };
  }, [map]);

  const selectedBoundsTuple = [
    currentBounds.getSouth(),
    currentBounds.getWest(),
    currentBounds.getNorth(),
    currentBounds.getEast(),
  ] as const;

  const isCurrentSelectionCovered = downloads.some((download) =>
    selectedBoundsTuple[0] >= download.bounds[0] &&
    selectedBoundsTuple[1] >= download.bounds[1] &&
    selectedBoundsTuple[2] <= download.bounds[2] &&
    selectedBoundsTuple[3] <= download.bounds[3],
  );

  const toggleTileLayer = (layer: OfflineTileLayer, checked: boolean) => {
    setSelectedTileLayers((prev) => {
      if (checked) {
        return prev.includes(layer) ? prev : [...prev, layer];
      }
      return prev.filter((entry) => entry !== layer);
    });
  };

  async function handleDownloadConfirm() {
    setIsDownloading(true);
    try {
      await downloadOfflineWindow(
        currentBounds,
        settings.gridSize,
        currentZoom,
        selectedTileLayers,
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
      {selectedBounds !== undefined && (isDialogOpen || isDrawMode) ? (
        <Rectangle
          bounds={selectedBounds}
          pathOptions={{
            color: "#f39c12",
            weight: 2,
            dashArray: "4,6",
            opacity: 0.9,
            fillOpacity: 0.06,
          }}
        />
      ) : null}
      <Button
        icon={<Download />}
        text="Offline"
        className="offlineButton"
        intent="success"
        onClick={() => {
          refreshDownloads();
          setSelectedBounds(undefined);
          setDrawStart(undefined);
          setIsDrawMode(false);
          setSelectedTileLayers(["OpenTopoMap Proxy"]);
          setIsDialogOpen(true);
        }}
      />
      <Dialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="Download Offline Data"
        className="offlineDialog"
        hasBackdrop={false}
        enforceFocus={false}
      >
        <div className={Classes.DIALOG_BODY}>
          <Callout>
            Download an area for offline use with height maps at {formatGridSize(settings.gridSize)} grid size, flying-site data, and selected map tiles for zoom levels {tileZoomLabel}.
          </Callout>
          {coveredDownloadId !== undefined && selectedBounds === undefined ? (
            <Callout intent="success" className="offlineCoverageCallout">
              The current viewport is already covered by a downloaded area.
            </Callout>
          ) : null}
          {isCurrentSelectionCovered ? (
            <Callout intent="success" className="offlineCoverageCallout">
              The selected area is already covered by a downloaded area.
            </Callout>
          ) : null}
          <div className="offlineSelectionRow">
            <Button
              small
              outlined
              intent={isDrawMode ? "primary" : "none"}
              disabled={isDownloading || isDeleting}
              onClick={() => {
                if (isDrawMode) {
                  setIsDrawMode(false);
                  setDrawStart(undefined);
                  setIsDialogOpen(true);
                  if (!map.dragging.enabled()) {
                    map.dragging.enable();
                  }
                } else {
                  setIsDrawMode(true);
                  setDrawStart(undefined);
                  setSelectedBounds(undefined);
                  setIsDialogOpen(false);
                  map.dragging.disable();
                }
              }}
            >
              {isDrawMode ? "Drawing enabled" : "Draw area on map"}
            </Button>
            {selectedBounds !== undefined ? (
              <Button
                small
                minimal
                disabled={isDownloading || isDeleting}
                onClick={() => {
                  setSelectedBounds(undefined);
                  setDrawStart(undefined);
                }}
              >
                Use viewport instead
              </Button>
            ) : null}
          </div>
          <div className="offlineLayerSelection">
            <H5>Map layers to download</H5>
            <div className="offlineLayerSelectionGrid">
              {OFFLINE_TILE_LAYERS.map((layer) => (
                <Checkbox
                  key={layer}
                  checked={selectedTileLayers.includes(layer)}
                  onChange={(e) =>
                    toggleTileLayer(layer, (e.target as HTMLInputElement).checked)
                  }
                  label={layer}
                  disabled={isDownloading || isDeleting}
                />
              ))}
            </div>
          </div>
          <p>
            Area: {currentBounds.getSouth().toFixed(4)}, {currentBounds.getWest().toFixed(4)} to {currentBounds.getNorth().toFixed(4)}, {currentBounds.getEast().toFixed(4)}
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
                    <th>Grid</th>
                    <th>Layers</th>
                    <th>Tiles</th>
                    <th>Sites</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {downloads.map((download) => (
                    <tr key={download.id}>
                      <td>{formatGridSize(download.gridSize)}</td>
                      <td>{getDownloadLayersLabel(download)}</td>
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
              disabled={!navigator.onLine || isDeleting || selectedTileLayers.length === 0}
            >
              Download selected area
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