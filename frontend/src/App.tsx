import { useState } from "react";
import "./App.css";
import {
    Circle,
    CircleMarker,
    ImageOverlay,
    LayersControl,
    MapContainer,
    Polyline,
    Rectangle,
    TileLayer,
    Tooltip,
    useMap,
    useMapEvents
} from "react-leaflet";
import { LatLng, LatLngBounds, PathOptions } from "leaflet";
import { Section, SectionCard, Slider } from "@blueprintjs/core";

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

function getSearchParams(lat: number, lon: number, settings: Settings) {
    return new URLSearchParams({
        "lat": lat.toString(),
        "lon": lon.toString(),
        "cell_size": settings.gridSize.toString(),
        "glide_number": settings.glideNumber.toString(),
        "additional_height": settings.additionalHeight.toString(),
        "wind_speed": settings.windSpeed.toString(),
        "trim_speed": settings.trimSpeed.toString(),
        "wind_direction": settings.windDirection.toString()
    });
}

function CurrentNodeDisplay({ node, grid }: { node: GridTile, grid: GridState }) {
    const map = useMap();

    const blackOptions = { color: 'black', weight: 1.0, opacity: 1.0, fillColor: "white", fillOpacity: 0.5 };

    return (
        <CircleMarker center={new LatLng(node.lat, node.lon)} radius={map.getZoom() / 12 * 10} pathOptions={blackOptions}>
            <Tooltip direction='top'>
                AGL: {Math.round(node.agl)}m<br />
                Height: {Math.round(node.height)}m<br />
                Distance: {Math.round(node.distance / 100) / 10}km
            </Tooltip>
        </CircleMarker>
    );
}

interface ImageState {
    heightAGLUrl: string;
    heightUrl: string;
    aglContourUrl: string;
    heightContourUrl: string;
    bounds: LatLngBounds;
}

function ImageOverlays({ state }: { state: ImageState }) {
    return (
        <>
            <LayersControl.Overlay name="Height above ground" checked>
                <ImageOverlay
                    url={state.heightAGLUrl.toString()}
                    bounds={state.bounds}
                    opacity={0.5}
                    className="gridImage">
                </ImageOverlay>
            </LayersControl.Overlay>
            <LayersControl.Overlay name="Height above see level">
                <ImageOverlay
                    url={state.heightUrl.toString()}
                    bounds={state.bounds}
                    opacity={0.5}
                    className="gridImage">
                </ImageOverlay>
            </LayersControl.Overlay>
            <LayersControl.Overlay name="AGL Contour lines">
                <ImageOverlay
                    url={state.aglContourUrl.toString()}
                    bounds={state.bounds}
                    opacity={0.4}>
                </ImageOverlay>
            </LayersControl.Overlay>
            <LayersControl.Overlay name="Height Contour lines">
                <ImageOverlay
                    url={state.heightContourUrl.toString()}
                    bounds={state.bounds}
                    opacity={0.9}>
                </ImageOverlay>
            </LayersControl.Overlay>
        </>
    );
}

function Grid({ grid }: { grid: GridState }) {
    const [path, setPath] = useState<LatLng[] | undefined>();
    const [node, setNode] = useState<GridTile | undefined>();


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
                    setNode(node);
                } else {
                    setPath(undefined);
                    setNode(undefined);
                }
            }
        }
    });

    const pathOptions: PathOptions = {
        color: 'black',
        weight: 4,
        dashArray: [5],
        lineCap: 'round',
        lineJoin: 'round'
    };

    return <>
        <LayersControl position="bottomleft">

        </LayersControl>
        {path !== undefined ? (
            <Polyline pathOptions={pathOptions} positions={path} />
        ) : <></>}
        {node !== undefined ? (
            <CurrentNodeDisplay node={node} grid={grid} />
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

interface SearchComponentProps {
    setImageState: (state: ImageState | undefined) => void;
    settings: Settings;
}

function SearchComponent({ setImageState, settings }: SearchComponentProps) {
    const [grid, setGrid] = useState<GridState | undefined>();

    useMapEvents({
        async click(e) {
            setImageState(undefined);
            setGrid(undefined);
            let url = new URL("http://localhost:3000/flight_cone");
            url.search = getSearchParams(e.latlng.lat, e.latlng.lng, settings).toString();

            let response = await fetch(url);
            let cone: ConeSearchResponse = await response.json();

            const grid = setupGrid(cone)
            setGrid({
                grid: grid,
                response: cone,
                startPosition: e.latlng
            });

            const searchParams = getSearchParams(e.latlng.lat, e.latlng.lng, settings).toString();
            let heightAglUrl = new URL("http://localhost:3000/agl_image");
            heightAglUrl.search = searchParams;
            let heightUrl = new URL("http://localhost:3000/height_image");
            heightUrl.search = searchParams;
            let aglContourUrl = new URL("http://localhost:3000/agl_contour_image");
            aglContourUrl.search = searchParams;
            let heightContourUrl = new URL("http://localhost:3000/height_contour_image");
            heightContourUrl.search = searchParams;

            const bounds = new LatLngBounds(
                new LatLng(cone.lat[0], cone.lon[0]),
                new LatLng(cone.lat[1], cone.lon[1])
            );
            setImageState({
                heightAGLUrl: heightAglUrl.toString(),
                heightUrl: heightUrl.toString(),
                aglContourUrl: aglContourUrl.toString(),
                heightContourUrl: heightContourUrl.toString(),
                bounds
            })
        },
    });

    return grid === undefined ? <></> : (<>
        <Grid grid={grid}></Grid>
    </>);
}

interface Settings {
    additionalHeight: number;
    glideNumber: number;
    gridSize: number;
    trimSpeed: number;
    windSpeed: number;
    windDirection: number;
}

function SettingsCard({ settings, setSettings }: { settings: Settings, setSettings: (settings: Settings) => void }) {
    const setAdditionalHeight = (value: number) => {
        setSettings({
            ...settings,
            additionalHeight: value,
        });
    }
    const setGlideNumber = (value: number) => {
        setSettings({
            ...settings,
            glideNumber: value,
        });
    }
    const setGridSize = (value: number) => {
        setSettings({
            ...settings,
            gridSize: value,
        });
    }
    const setTrimSpeed = (value: number) => {
        setSettings({
            ...settings,
            trimSpeed: value,
        });
    }
    const setWindSpeed = (value: number) => {
        setSettings({
            ...settings,
            windSpeed: value,
        });
    }
    const setWindDirection = (value: number) => {
        setSettings({
            ...settings,
            windDirection: value,
        });
    }

    return (
        <div className="settings">
            <Section collapsible compact title="Settings" collapseProps={{ defaultIsOpen: false }}>
                <SectionCard>
                    Additional Height:
                    <Slider initialValue={0} min={0} max={1000}
                        onChange={setAdditionalHeight} value={settings.additionalHeight}
                        labelStepSize={500} ></Slider>
                    Glide number:
                    <Slider initialValue={1} min={1} max={12}
                        onChange={setGlideNumber} value={settings.glideNumber}
                        labelStepSize={2} stepSize={0.5}></Slider>
                    Grid size:
                    <Slider initialValue={30} min={30} max={200}
                        onChange={setGridSize} value={settings.gridSize}
                        labelStepSize={50} stepSize={10}></Slider>
                    Trim speed:
                    <Slider initialValue={25} min={25} max={45}
                        onChange={setTrimSpeed} value={settings.trimSpeed}
                        labelStepSize={5} stepSize={1}></Slider>
                    Wind speed:
                    <Slider initialValue={0} min={0} max={50}
                        onChange={setWindSpeed} value={settings.windSpeed}
                        labelStepSize={10} stepSize={5}></Slider>
                    Wind direction:
                    <Slider initialValue={0} min={0} max={360}
                        onChange={setWindDirection} value={settings.windDirection}
                        labelStepSize={90} stepSize={15}></Slider>
                </SectionCard>
            </Section>
        </div>
    );
}

function App() {
    const [imageState, setImageState] = useState<ImageState | undefined>();
    const [settings, setSettings] = useState<Settings>({
        additionalHeight: 10,
        glideNumber: 8,
        gridSize: 50,
        trimSpeed: 38,
        windSpeed: 0,
        windDirection: 0
    })

    return (
        <div className="App">
            <SettingsCard settings={settings} setSettings={setSettings}></SettingsCard>
            <MapContainer center={[47.67844930525105, 11.905059814453125]} zoom={13} scrollWheelZoom={true}>
                <LayersControl position="bottomright">
                    <LayersControl.BaseLayer checked name="OpenTopoMap">
                        <TileLayer
                            attribution='&copy; <a href="https://opentopomap.org/credits">OpenTopoMap</a> contributors'
                            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="OpenStreetMap">
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Satellite">
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                        />
                    </LayersControl.BaseLayer>
                    {imageState !== undefined ? <ImageOverlays state={imageState}></ImageOverlays> : <></>}

                </LayersControl>
                <SearchComponent setImageState={setImageState} settings={settings}></SearchComponent>
            </MapContainer>
        </div>
    );
}

export default App;
