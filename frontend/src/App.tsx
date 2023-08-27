import { useState } from "react";
import "./App.css";
import {
    ImageOverlay,
    MapContainer,
    Polyline,
    SVGOverlay,
    TileLayer,
    useMapEvents
} from "react-leaflet";
import { LatLng, LatLngBounds } from "leaflet";

interface GridTile {
    index: number[];
    height: number;
    distance: number;
    lat: number;
    lon: number;
    ref: number[];
    agl: number;
    gl: number;
};

interface ConeSearchResponse {
    nodes: GridTile[];
    cell_size: number;
    lat: number[];
    lon: number[];
    grid_shape: number[];
    angular_resolution: number[];
}

interface GridState {
    response: ConeSearchResponse;
    startPosition: LatLng;
    grid: GridTile[][];
}

function getSearchParams(lat: number, lon: number) {
    return new URLSearchParams({
        "lat": lat.toString(),
        "lon": lon.toString(),
        "cell_size": "30",
    });
}

function Grid({ grid }: { grid: GridState }) {
    const [path, setPath] = useState<LatLng[] | undefined>();

    useMapEvents({
        mousemove(ev) {
            if (ev.latlng.lat >= grid.response.lat[0] && ev.latlng.lat <= grid.response.lat[1] && ev.latlng.lng >= grid.response.lon[0]
                && ev.latlng.lng <= grid.response.lon[1]) {
                const latIx = Math.floor((ev.latlng.lat - grid.response.lat[0]) / (grid.response.lat[1] - grid.response.lat[0]) * grid.response.grid_shape[0]);
                const lonIx = Math.floor((ev.latlng.lng - grid.response.lon[0]) / (grid.response.lon[1] - grid.response.lon[0]) * grid.response.grid_shape[1]);

                if (grid.grid[latIx] !== undefined && grid.grid[latIx][lonIx] !== undefined) {
                    const node = grid.grid[latIx][lonIx];
                    let current = node;
                    let path = [];
                    while (current.ref !== null) {
                        path.push(new LatLng(current.lat, current.lon, current.height));
                        current = grid.grid[current.ref[0]][current.ref[1]];
                    }
                    path.push(new LatLng(current.lat, current.lon, current.height));
                    setPath(path);
                }
            }
        }
    });

    let imageUrl = new URL("http://localhost:3000/agl_image");
    imageUrl.search = getSearchParams(grid.startPosition.lat, grid.startPosition.lng).toString();

    const bounds = new LatLngBounds(
        new LatLng(grid.response.lat[0], grid.response.lon[0]),
        new LatLng(grid.response.lat[1], grid.response.lon[1])
    );

    const redOptions = { color: 'red' };

    return <>
        <ImageOverlay
            url={imageUrl.toString()}
            bounds={bounds}
            opacity={0.4}>
        </ImageOverlay>
        {path !== undefined ? (
            <Polyline pathOptions={redOptions} positions={path} />
        ) : <></>}
    </>
}

function setupGrid(cone: ConeSearchResponse): GridTile[][] {
    const grid = new Array(cone.grid_shape[0]);
    for (let node of cone.nodes) {
        if (grid[node.index[0]] === undefined) {
            grid[node.index[0]] = new Array(cone.grid_shape[1]);
        }

        grid[node.index[0]][node.index[1]] = node;
    }
    return grid;
}

function SearchComponent() {
    const [grid, setGrid] = useState<GridState | undefined>();

    useMapEvents({
        async click(e) {
            let url = new URL("http://localhost:3000/flight_cone");
            url.search = getSearchParams(e.latlng.lat, e.latlng.lng).toString();

            let response = await fetch(url);
            let cone: ConeSearchResponse = await response.json();

            console.log(cone);
            const grid = setupGrid(cone)
            setGrid({
                grid: grid,
                response: cone,
                startPosition: e.latlng
            });
        },
    });

    return grid === undefined ? <></> : (<>
        <Grid grid={grid}></Grid>
    </>);
}

function App() {
    return (
        <div className="App">
            <MapContainer center={[47.67844930525105, 11.905059814453125]} zoom={13} scrollWheelZoom={true}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                />
                <SearchComponent></SearchComponent>
            </MapContainer>
        </div>
    );
}

export default App;
