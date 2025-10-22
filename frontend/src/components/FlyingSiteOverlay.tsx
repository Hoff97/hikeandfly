import {
    CircleMarker,
    LayersControl,
    Tooltip,
    useMap,
    useMapEvents,
} from "react-leaflet";
import { SearchResult } from "./SearchCard";
import { useCallback, useEffect, useState } from "react";

function isSubset(boundsA: L.LatLngBounds, boundsB: L.LatLngBounds) {
    return boundsA.getSouth() >= boundsB.getSouth() &&
        boundsA.getNorth() <= boundsB.getNorth() &&
        boundsA.getWest() >= boundsB.getWest() &&
        boundsA.getEast() <= boundsB.getEast();
}

export function FlyingSiteOverlay() {
    const map = useMap();

    const [sites, setSites] = useState<SearchResult[]>([]);
    const [loadedBounds, setLoadedBounds] = useState<L.LatLngBounds | null>(null);

    let searchSites = useCallback(async () => {
        let url = new URL(window.location.origin + "/flying_sites");
        const bounds = map.getBounds();
        url.search = new URLSearchParams({
            min_lat: bounds.getSouth().toString(),
            max_lat: bounds.getNorth().toString(),
            min_lon: bounds.getWest().toString(),
            max_lon: bounds.getEast().toString()
        }).toString();

        let response = await fetch(url);
        let body: SearchResult[] = await response.json();

        setLoadedBounds(bounds);
        setSites(body);
    }, [map, setLoadedBounds, setSites]);

    useEffect(() => {
        setTimeout(() => {
            if (map.getZoom() >= 10) {
                searchSites();
            }
        }, 500);
    }, [map, searchSites]);

    useMapEvents({
        moveend: (e) => {
            if (map.getZoom() < 10) {
                setSites([]);
                return;
            }
            const bounds = map.getBounds();
            if (loadedBounds && isSubset(bounds, loadedBounds) && sites.length < 100 && sites.length > 0) {
                return;
            }
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