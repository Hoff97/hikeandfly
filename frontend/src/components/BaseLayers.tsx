import { useState } from "react";
import { LayersControl, TileLayer, useMapEvents } from "react-leaflet";

export function BaseLayers() {
    const [enabledBaseLayer, setEnabledBaseLayer] = useState<string>(window.localStorage.getItem("enabledBaseLayer") || "OpenTopoMap");

    useMapEvents({
        baselayerchange(e) {
            setEnabledBaseLayer(e.name);
            window.localStorage.setItem("enabledBaseLayer", e.name);
        },
    });

    const openTopoMapProxy = `${window.location.origin}/opentopomap/{s}/{z}/{x}/{y}.png`;

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
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer checked={enabledBaseLayer === "Satellite"} name="Satellite">
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
            </LayersControl.BaseLayer>
        </>);

}