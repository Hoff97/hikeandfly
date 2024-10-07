import { LayersControl, Polyline, useMapEvents } from "react-leaflet";
import { CurrentNode } from "./CurrentNode";
import { LatLng, PathOptions } from "leaflet";
import { ixToLatLon } from "../utils/utils";
import { GridState, PathAndNode } from "../utils/types";

interface GridProps {
    grid: GridState;
    pathAndNode: PathAndNode;
}

export function Grid({ grid, pathAndNode }: GridProps) {
    useMapEvents({
        mousemove(ev) {
            if (grid.response === undefined || grid.grid === undefined)
                return

            if (
                ev.latlng.lat >= grid.response.lat[0] &&
                ev.latlng.lat <= grid.response.lat[1] &&
                ev.latlng.lng >= grid.response.lon[0] &&
                ev.latlng.lng <= grid.response.lon[1]
            ) {
                const latIx = Math.floor(
                    ((ev.latlng.lat - grid.response.lat[0]) /
                        (grid.response.lat[1] - grid.response.lat[0])) *
                    grid.response.grid_shape[0]
                );
                const lonIx = Math.floor(
                    ((ev.latlng.lng - grid.response.lon[0]) /
                        (grid.response.lon[1] - grid.response.lon[0])) *
                    grid.response.grid_shape[1]
                );

                if (
                    grid.grid[latIx] !== undefined &&
                    grid.grid[latIx][lonIx] !== undefined
                ) {
                    const node = grid.grid[latIx][lonIx];
                    let current = node;
                    let path = [];
                    while (current.reference !== null) {
                        let lat = 0;
                        let lon = 0;
                        if (grid.response !== undefined) {
                            [lat, lon] = ixToLatLon(current.index, grid.response);
                        }

                        path.push(new LatLng(lat, lon, current.height));
                        current = grid.grid[current.reference[0]][current.reference[1]];
                    }
                    let lat = 0;
                    let lon = 0;
                    if (grid.response !== undefined) {
                        [lat, lon] = ixToLatLon(current.index, grid.response);
                    }
                    path.push(new LatLng(lat, lon, current.height));
                    path.reverse();
                    pathAndNode.setPath(path);
                    pathAndNode.setNode(node);
                } else {
                    pathAndNode.setPath(undefined);
                    pathAndNode.setNode(undefined);
                }
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
        </>
    );
}