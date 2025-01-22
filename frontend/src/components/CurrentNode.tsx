import { CircleMarker, Tooltip, useMap } from "react-leaflet";
import { GridState, GridTile } from "../utils/types";
import { Direction, LatLng } from "leaflet";
import { ixToLatLon } from "../utils/utils";
import { useState } from "react";

export function CurrentNode({
    node,
    path,
    grid,
}: {
    node: GridTile;
    path: LatLng[];
    grid: GridState;
}) {
    const map = useMap();

    const [prevDirection, setPrevDirection] = useState("top");

    const blackOptions = {
        color: "black",
        weight: 1.0,
        opacity: 1.0,
        fillColor: "white",
        fillOpacity: 0.5,
    };

    let latlng = new LatLng(0, 0);
    if (grid.response !== undefined) {
        latlng = ixToLatLon(node.index, grid.response);
    }

    let direction: Direction = "top";
    if (path.length > 1) {
        const last = path[path.length - 1];
        const second = path[path.length - 2];
        let angle = Math.atan2(last.lat - second.lat, last.lng - second.lng);
        if (angle < 0) {
            angle += 2 * Math.PI;
        } else if (angle > 2 * Math.PI) {
            angle -= 2 * Math.PI;
        }

        if (angle < Math.PI / 4 || angle >= Math.PI * 7 / 4) {
            direction = "right";
        } else if (angle >= Math.PI / 4 && angle < Math.PI * 3 / 4) {
            direction = "top";
        } else if (angle >= Math.PI * 3 / 4 && angle < Math.PI * 5 / 4) {
            direction = "left";
        } else {
            direction = "bottom";
        }
    }

    const content = (<>
        AGL: {Math.round(node.agl)}m<br />
        Height: {Math.round(node.height)}m<br />
        Distance: {Math.round(node.distance / 100) / 10}km
    </>);

    if (direction !== prevDirection) {
        setTimeout(() => {
            setPrevDirection(direction);
        }, 5);
        return (<></>);
    }

    return (<CircleMarker
        center={latlng}
        radius={(map.getZoom() / 12) * 10}
        pathOptions={blackOptions}
    >
        <Tooltip direction={direction}>{content}</Tooltip>
    </CircleMarker>);
}