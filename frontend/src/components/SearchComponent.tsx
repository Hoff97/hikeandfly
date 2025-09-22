import { LatLng, LeafletMouseEvent } from "leaflet";
import { computeHeights, doSearchFromLocation, nodeInGrid, setPath } from "../utils/utils";
import { Circle, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import { GridState, ImageState, PathAndNode, SetSettings, Settings } from "../utils/types";
import { Grid } from "./Grid";
import { StartMarker } from "./StartMarker";

interface SearchComponentProps {
    setImageState: (state: ImageState | undefined) => void;
    imageState: ImageState | undefined;
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

function doHoverSearch(grid: GridState, hoverState: HoverState, imageState: ImageState | undefined, settings: Settings, useTimer = true) {
    return grid.loading !== "grid"
        && grid.loading !== "image"
        && ((Date.now() - hoverState.lastHoverSearch) > (settings.fastInternet ? 50 : 200) || !useTimer)
        && grid.response === undefined
        && grid.grid === undefined
        && settings.doLiveHoverSearch
        && imageState === undefined;
}

export interface HoverState {
    imageState: ImageState | undefined;
    lastHoverSearch: number;
}

export function SearchComponent({ setImageState, imageState, setHoverState, hoverState, settings, setSettings, grid, setGrid, pathAndNode }: SearchComponentProps) {
    const map = useMap();

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (imageState !== undefined && hoverState.imageState !== undefined) {
        setHoverState({ imageState: undefined, lastHoverSearch: hoverState.lastHoverSearch });
    }

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
            if (abortEvent(e) || !doHoverSearch(grid, hoverState, imageState, settings)) {
                return;
            }

            setHoverState({ imageState: hoverState.imageState, lastHoverSearch: Date.now() });
            doSearchFromLocation(
                (is) => { setHoverState({ imageState: is, lastHoverSearch: Date.now() }); },
                (g) => { }, (g) => { }, e.latlng, {
                ...settings, gridSize: settings.fastInternet ? settings.gridSize : 200
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
        move(e) {
            if (!doHoverSearch(grid, hoverState, imageState, settings) || !isMobile) {
                return;
            }

            setHoverState({ imageState: hoverState.imageState, lastHoverSearch: Date.now() });
            doSearchFromLocation(
                (is) => { setHoverState({ imageState: is, lastHoverSearch: Date.now() }); },
                (g) => { }, (g) => { }, map.getCenter(), {
                ...settings, gridSize: settings.fastInternet ? settings.gridSize : 200
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

    const blackOptions = {
        color: "black",
        weight: 1.0,
        opacity: 1.0,
        fillColor: "white",
        fillOpacity: 0.5,
    };

    const loadedOptions = {
        color: "green",
        weight: 2.0,
        opacity: 1.0,
        fillColor: "white",
        fillOpacity: 0.1,
    };

    return (<>
        {grid.startPosition !== undefined && grid.maxLoadDistance !== undefined ? (
            <Circle
                center={grid.startPosition}
                radius={grid.maxLoadDistance}
                pathOptions={loadedOptions}
            >
            </Circle>
        ) : (<></>)}
        {grid.response === undefined ? <></> : <StartMarker response={grid.response} settings={settings}></StartMarker>}
        {
            grid === undefined ? (<></>) : (
                <Grid grid={grid} pathAndNode={pathAndNode}></Grid>
            )
        }
        {
            isMobile && settings.doLiveHoverSearch && doHoverSearch(grid, hoverState, imageState, settings, false) ? (<>
                <CircleMarker
                    center={map.getCenter()}
                    radius={(map.getZoom() / 12) * 10}
                    pathOptions={blackOptions}
                >
                </CircleMarker>
            </>) : (<></>)}
    </>);
}