import { Polyline, useMapEvents, CircleMarker, useMap } from "react-leaflet";
import { CurrentNode } from "./CurrentNode";
import { PathOptions } from "leaflet";
import { nodeInGrid, setPath } from "../utils/utils";
import { GridState, PathAndNode } from "../utils/types";

interface GridProps {
    grid: GridState;
    pathAndNode: PathAndNode;
}

export function Grid({ grid, pathAndNode }: GridProps) {
    const map = useMap();

    useMapEvents({
        mousemove(ev) {
            if (grid.response === undefined || grid.grid === undefined || pathAndNode.fixed) {
                return;
            }

            const node = nodeInGrid(ev.latlng, grid);
            if (node !== undefined) {
                setPath(node, grid, pathAndNode);
            } else {
                pathAndNode.setPath(undefined);
                pathAndNode.setNode(undefined);
            }
        },
    });

    const pathOptions: PathOptions = {
        color: "black",
        weight: 4,
        dashArray: [5],
        lineCap: "round",
        lineJoin: "round",
    };

    const blackOptions = {
        color: "black",
        weight: 1.0,
        opacity: 1.0,
        fillColor: "black",
        fillOpacity: 1.0,
    };

    return (
        <>
            {pathAndNode.path !== undefined ? (
                <Polyline pathOptions={pathOptions} positions={pathAndNode.path} />
            ) : (
                <></>
            )}
            {pathAndNode.node !== undefined ? (
                <CurrentNode node={pathAndNode.node} grid={grid} />
            ) : (
                <></>
            )}
            {pathAndNode.cursorNode !== undefined ? (<>
                <CircleMarker
                    center={pathAndNode.cursorNode.location}
                    radius={(map.getZoom() / 20) * 10}
                    pathOptions={blackOptions}
                ></CircleMarker>
            </>) : <></>}
        </>
    );
}