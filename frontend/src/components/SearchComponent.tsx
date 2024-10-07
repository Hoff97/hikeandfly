import { LatLng } from "leaflet";
import { doSearchFromLocation } from "../utils/utils";
import { CircleMarker, useMap, useMapEvents } from "react-leaflet";
import { GridState, ImageState, PathAndNode, Settings } from "../utils/types";
import { Grid } from "./Grid";

interface SearchComponentProps {
    setImageState: (state: ImageState | undefined) => void;
    settings: Settings;
    setSettings: (settings: Settings) => void;
    grid: GridState;
    setGrid: (grid: GridState) => void;
    pathAndNode: PathAndNode;
}

export function SearchComponent({ setImageState, settings, setSettings, grid, setGrid, pathAndNode }: SearchComponentProps) {
    const map = useMap();

    useMapEvents({
        async click(e) {
            if (
                ("classList" in (e.originalEvent.target as any) &&
                    (e.originalEvent.target as any).classList.contains("locationButton"))
                || ("parentElement" in (e.originalEvent.target as any) && "classList" in (e.originalEvent.target as any).parentElement &&
                    (e.originalEvent.target as any).parentElement.classList.contains("locationButton"))) {
                return;
            }
            await doSearchFromLocation(setImageState, setGrid, setSettings, e.latlng, settings, pathAndNode, map);
        },
        moveend(e) {
            const center = map.getCenter();
            window.localStorage.setItem("lastLocationLat", center.lat.toString());
            window.localStorage.setItem("lastLocationLon", center.lng.toString());
        }
    });
    const urlParams = new URLSearchParams(window.location.search);

    const lat = urlParams.get('lat');
    const lon = urlParams.get('lon');
    if (lat !== null && lon !== null && grid.loading === false && grid.response === undefined) {
        const latlon = new LatLng(+lat, +lon);
        doSearchFromLocation(setImageState, setGrid, setSettings, latlon, settings, pathAndNode, map);
    }

    const blackOptions = {
        color: "black",
        weight: 1.0,
        opacity: 1.0,
        fillColor: "white",
        fillOpacity: 0.5,
    };

    return (<>
        {lat === null || lon === null ? <></> : <CircleMarker
            center={new LatLng(+lat, +lon)}
            radius={(map.getZoom() / 12) * 10}
            pathOptions={blackOptions}
        ></CircleMarker>}
        {
            grid === undefined ? (<></>) : (
                <Grid grid={grid} pathAndNode={pathAndNode}></Grid>
            )
        }
    </>);
}