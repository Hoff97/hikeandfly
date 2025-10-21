import {
    CircleMarker,
    LayersControl,
    Marker,
    Tooltip,
    useMap,
    useMapEvents,
} from "react-leaflet";
import { SearchResult } from "./SearchCard";
import { useState } from "react";

export function FlyingSiteOverlay() {
    const map = useMap();

    const [sites, setSites] = useState<SearchResult[]>([]);

    let searchSites = async () => {
        let url = new URL(window.location.origin + "/flying_sites");
        url.search = new URLSearchParams({
            min_lat: map.getBounds().getSouth().toString(),
            max_lat: map.getBounds().getNorth().toString(),
            min_lon: map.getBounds().getWest().toString(),
            max_lon: map.getBounds().getEast().toString()
        }).toString();

        let response = await fetch(url);
        let body: SearchResult[] = await response.json();

        setSites(body);
    };

    useMapEvents({
        zoomend: (e) => {
            if (map.getZoom() < 10) {
                setSites([]);
                return;
            }
            const bounds = map.getBounds();
            setTimeout(() => {
                if (map.getBounds().equals(bounds)) {
                    searchSites();
                }
            }, 200);
        },
        moveend: (e) => {
            if (map.getZoom() < 10) {
                setSites([]);
                return;
            }
            const bounds = map.getBounds();
            setTimeout(() => {
                if (map.getBounds().equals(bounds)) {
                    searchSites();
                }
            }, 200);
        }
    });

    return (
        <>
            <LayersControl.Overlay name="Flying sites" checked>
                <>
                    {sites.map((site, index) => (
                        <CircleMarker key={index} center={[site.center[1], site.center[0]]} radius={6} pathOptions={{ color: site.additional_info === "Start" ? "green" : "blue" }}>
                            <Tooltip>{site.name}</Tooltip>
                        </CircleMarker>
                    ))}
                </>
            </LayersControl.Overlay>
        </>
    );
}