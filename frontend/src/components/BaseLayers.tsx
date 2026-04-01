import { useEffect, useState } from "react";
import { LayersControl, TileLayer, useMapEvents } from "react-leaflet";

export function BaseLayers() {
    const [enabledBaseLayer, setEnabledBaseLayer] = useState<string>(window.localStorage.getItem("enabledBaseLayer") || "OpenTopoMap");
    const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

    // When the browser goes offline, switch to the proxy layer which is the
    // only one supported for offline tile caching (same-origin, no CORS issues).
    useEffect(() => {
        const updateConnectivity = () => setIsOnline(navigator.onLine);
        const handleOffline = () => {
            if (enabledBaseLayer === "OpenTopoMap") {
                setEnabledBaseLayer("OpenTopoMap Proxy");
                window.localStorage.setItem("enabledBaseLayer", "OpenTopoMap Proxy");
            }
        };
        window.addEventListener("online", updateConnectivity);
        window.addEventListener("offline", handleOffline);
        window.addEventListener("offline", updateConnectivity);
        // Also apply immediately if already offline on mount.
        if (!navigator.onLine && enabledBaseLayer === "OpenTopoMap") {
            handleOffline();
        }
        return () => {
            window.removeEventListener("online", updateConnectivity);
            window.removeEventListener("offline", handleOffline);
            window.removeEventListener("offline", updateConnectivity);
        };
    }, [enabledBaseLayer]);

    useMapEvents({
        baselayerchange(e) {
            setEnabledBaseLayer(e.name);
            window.localStorage.setItem("enabledBaseLayer", e.name);
        },
    });

    const openTopoMapProxy = `${window.location.origin}/opentopomap/{s}/{z}/{x}/{y}.png`;
    const openStreetMapProxy = `${window.location.origin}/openstreetmap/{s}/{z}/{x}/{y}.png`;
    const satelliteProxy = `${window.location.origin}/satellite/{z}/{y}/{x}.jpg`;

    return (
        <>
            <LayersControl.BaseLayer checked={enabledBaseLayer === "OpenTopoMap"} name="OpenTopoMap">
                <TileLayer
                    attribution='&copy; <a href="https://opentopomap.org/credits">OpenTopoMap</a> contributors'
                    url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer checked={enabledBaseLayer === "OpenTopoMap Proxy"} name="OpenTopoMap Proxy">
                <TileLayer
                    attribution='&copy; <a href="https://opentopomap.org/credits">OpenTopoMap</a> contributors'
                    url={openTopoMapProxy}
                />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer checked={enabledBaseLayer === "OpenStreetMap"} name="OpenStreetMap">
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url={isOnline ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : openStreetMapProxy}
                />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer checked={enabledBaseLayer === "Satellite"} name="Satellite">
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url={isOnline ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" : satelliteProxy}
                />
            </LayersControl.BaseLayer>
        </>);

}