import { LatLng, LeafletMouseEvent } from "leaflet";
import { computeHeights, doSearchFromLocation, nodeInGrid, setPath } from "../utils/utils";
import { useMap, useMapEvents } from "react-leaflet";
import { GridState, ImageState, PathAndNode, SetSettings, Settings } from "../utils/types";
import { Grid } from "./Grid";
import { StartMarker } from "./StartMarker";

interface SearchComponentProps {
    setImageState: (state: ImageState | undefined) => void;
    setHoverState: (state: HoverState) => void;
    hoverState: HoverState;
    settings: Settings;
    setSettings: SetSettings;
    grid: GridState;
    setGrid: (grid: GridState) => void;
    pathAndNode: PathAndNode;
}

function abortEvent(e: LeafletMouseEvent) {
    return ("classList" in (e.originalEvent.target as any) &&
        (e.originalEvent.target as any).classList.contains("locationButton"))
        || ("parentElement" in (e.originalEvent.target as any) && "classList" in (e.originalEvent.target as any).parentElement &&
            (e.originalEvent.target as any).parentElement.classList.contains("locationButton"));
}

function doHoverSearch(grid: GridState, hoverState: HoverState, settings: Settings) {
    return grid.loading !== "grid" && grid.loading !== "image" && (Date.now() - hoverState.lastHoverSearch) > 200 && grid.response === undefined && grid.grid === undefined && settings.doLiveHoverSearch;
}

export interface HoverState {
    imageState: ImageState | undefined;
    lastHoverSearch: number;
}

export function SearchComponent({ setImageState, setHoverState, hoverState, settings, setSettings, grid, setGrid, pathAndNode }: SearchComponentProps) {
    const map = useMap();

    let continueFromLocation = (e: LeafletMouseEvent) => {
        if (abortEvent(e)) {
            return;
        }

        let node = nodeInGrid(e.latlng, grid);

        if (node === undefined) {
            return;
        }

        let newSettings = { ...settings, startHeight: node.height };
        setSettings(newSettings);

        doSearchFromLocation(setImageState, setGrid, setSettings, e.latlng, newSettings, pathAndNode, map);

        return false;
    }

    useMapEvents({
        click(e) {
            if (abortEvent(e) || grid.loading !== "done") {
                return;
            }

            let node = nodeInGrid(e.latlng, grid);

            setHoverState({ imageState: undefined, lastHoverSearch: hoverState.lastHoverSearch });

            if (node === undefined) {
                doSearchFromLocation(setImageState, setGrid, setSettings, e.latlng, settings, pathAndNode, map);
                return;
            }

            let nodes = setPath(node, grid, pathAndNode);
            pathAndNode.setFixed(true);
            let heights = computeHeights(nodes, grid);
            pathAndNode.setHeightPoints(heights);
        },
        mousemove(e) {
            if (abortEvent(e) || !doHoverSearch(grid, hoverState, settings)) {
                return;
            }

            setHoverState({ imageState: hoverState.imageState, lastHoverSearch: Date.now() });
            doSearchFromLocation(
                (is) => { setHoverState({ imageState: is, lastHoverSearch: Date.now() }); },
                (g) => { }, (g) => { }, e.latlng, {
                ...settings, gridSize: 200
            }, {
                path: undefined,
                node: undefined,
                fixed: true,
                heightPoints: undefined,
                cursorNode: undefined,
                setPath: (_) => { },
                setNode: (_) => { },
                setFixed: (_) => { },
                setHeightPoints: (_) => { },
                setCursorNode: (_) => { },
            }, undefined, true);
        },
        contextmenu(e) {
            continueFromLocation(e);
        },
        dblclick(e) {
            if (abortEvent(e)) {
                return;
            }
            if (grid.response !== undefined && grid.grid !== undefined) {
                e.originalEvent.stopPropagation();
                let newSettings = { ...settings, startHeight: undefined, additionalHeight: 5 };
                setSettings(newSettings);
                doSearchFromLocation(setImageState, setGrid, setSettings, e.latlng, newSettings, pathAndNode, map);
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