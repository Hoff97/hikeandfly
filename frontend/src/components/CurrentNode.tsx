import { CircleMarker, Tooltip, useMap } from "react-leaflet";
import { GridState, GridTile } from "../utils/types";
import { LatLng } from "leaflet";
import { ixToLatLon } from "../utils/utils";

export function CurrentNode({
    node,
    grid,
}: {
    node: GridTile;
    grid: GridState;
}) {
    const map = useMap();

    const blackOptions = {
        color: "black",
        weight: 1.0,
        opacity: 1.0,
        fillColor: "white",
        fillOpacity: 0.5,
    };

    let lat = 0;
    let lon = 0;
    if (grid.response !== undefined) {
        [lat, lon] = ixToLatLon(node.index, grid.response);
    }

    return (
        <CircleMarker
            center={new LatLng(lat, lon)}
            radius={(map.getZoom() / 12) * 10}
            pathOptions={blackOptions}
        >
            <Tooltip direction="top">
                AGL: {Math.round(node.agl)}m<br />
                Height: {Math.round(node.height)}m<br />
                Distance: {Math.round(node.distance / 100) / 10}km
            </Tooltip>
        </CircleMarker>
    );
}