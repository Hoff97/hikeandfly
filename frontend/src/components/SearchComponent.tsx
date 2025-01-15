import { LatLng } from "leaflet";
import { computeHeights, doSearchFromLocation, nodeInGrid, setPath } from "../utils/utils";
import { useMap, useMapEvents } from "react-leaflet";
import { GridState, ImageState, PathAndNode, SetSettings, Settings } from "../utils/types";
import { Grid } from "./Grid";
import { StartMarker } from "./StartMarker";

interface SearchComponentProps {
    setImageState: (state: ImageState | undefined) => void;
    settings: Settings;
    setSettings: SetSettings;
    grid: GridState;
    setGrid: (grid: GridState) => void;
    pathAndNode: PathAndNode;
}

export function SearchComponent({ setImageState, settings, setSettings, grid, setGrid, pathAndNode }: SearchComponentProps) {
    const map = useMap();

    useMapEvents({
        click(e) {
            if (
                ("classList" in (e.originalEvent.target as any) &&
                    (e.originalEvent.target as any).classList.contains("locationButton"))
                || ("parentElement" in (e.originalEvent.target as any) && "classList" in (e.originalEvent.target as any).parentElement &&
                    (e.originalEvent.target as any).parentElement.classList.contains("locationButton"))) {
                return;
            }

            let node = nodeInGrid(e.latlng, grid);
            if (node !== undefined) {
                let nodes = setPath(node, grid, pathAndNode);
                pathAndNode.setFixed(true);
                let heights = computeHeights(nodes, grid);
                pathAndNode.setHeightPoints(heights);
                return;
            }

            doSearchFromLocation(setImageState, setGrid, setSettings, e.latlng, settings, pathAndNode, map);
        },
        dblclick(e) {
            if (
                ("classList" in (e.originalEvent.target as any) &&
                    (e.originalEvent.target as any).classList.contains("locationButton"))
                || ("parentElement" in (e.originalEvent.target as any) && "classList" in (e.originalEvent.target as any).parentElement &&
                    (e.originalEvent.target as any).parentElement.classList.contains("locationButton"))) {
                return;
            }
            if (grid.response !== undefined && grid.grid !== undefined) {
                e.originalEvent.stopPropagation();
                doSearchFromLocation(setImageState, setGrid, setSettings, e.latlng, settings, pathAndNode, map);
                return true;
            }
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
    if (lat !== null && lon !== null && grid.loading === "done" && grid.response === undefined) {
        const latlon = new LatLng(+lat, +lon);
        doSearchFromLocation(setImageState, setGrid, setSettings, latlon, settings, pathAndNode, map);
    }

    return (<>
        {grid.response === undefined ? <></> : <StartMarker response={grid.response} settings={settings}></StartMarker>}
        {
            grid === undefined ? (<></>) : (
                <Grid grid={grid} pathAndNode={pathAndNode}></Grid>
            )
        }
    </>);
}