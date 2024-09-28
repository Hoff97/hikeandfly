import { useState } from "react";
import "./App.css";
import {
    CircleMarker,
    ImageOverlay,
    LayersControl,
    MapContainer,
    Polyline,
    TileLayer,
    Tooltip,
    useMap,
    useMapEvents,
} from "react-leaflet";
import { Map as MapLeaflet } from "leaflet";
import { LatLng, LatLngBounds, PathOptions } from "leaflet";
import { Section, SectionCard, Slider, Button, Divider, Spinner, Intent, H3, Overlay2, OverlaysProvider, Classes, H4, Checkbox } from "@blueprintjs/core";
import { InfoSign, Share } from "@blueprintjs/icons";

interface GridTile {
    index: number[];
    height: number;
    distance: number;
    reference: number[];
    agl: number;
}

interface ConeSearchResponse {
    nodes: GridTile[];
    cell_size: number;
    lat: number[];
    lon: number[];
    grid_shape: number[];
    angular_resolution: number[];
    start_height: number;
}

interface GridState {
    loading: boolean;
    response: ConeSearchResponse | undefined;
    startPosition: LatLng | undefined;
    grid: GridTile[][] | undefined;
}

function getSearchParams(latlng: LatLng | undefined, settings: Settings) {
    let dict: any = {
        "cell_size": settings.gridSize.toString(),
        "glide_number": settings.glideNumber.toString(),
        "additional_height": settings.additionalHeight.toString(),
        "wind_speed": settings.windSpeed.toString(),
        "trim_speed": settings.trimSpeed.toString(),
        "wind_direction": settings.windDirection.toString(),
        "safety_margin": settings.safetyMargin.toString(),
        "start_distance": settings.startDistance.toString(),
    };
    if (settings.startHeight !== undefined) {
        dict["start_height"] = settings.startHeight.toString();
    }
    if (latlng !== undefined) {
        dict["lat"] = latlng.lat.toString();
        dict["lon"] = latlng.lng.toString();
    }

    return new URLSearchParams(dict);
}

function CurrentNodeDisplay({
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

interface ImageState {
    heightAGLUrl: string;
    heightUrl: string;
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
                    className="gridImage"
                ></ImageOverlay>
            </LayersControl.Overlay>
            <LayersControl.Overlay name="Height above see level">
                <ImageOverlay
                    url={state.heightUrl.toString()}
                    bounds={state.bounds}
                    opacity={0.5}
                    className="gridImage"
                ></ImageOverlay>
            </LayersControl.Overlay>
        </>
    );
}

function ixToLatLon(ix: number[], response: ConeSearchResponse) {
    let lat = response.lat[0] + (ix[0] + 0.5) / (response.grid_shape[0]) * (response.lat[1] - response.lat[0]);
    let lon = response.lon[0] + (ix[1] + 0.5) / (response.grid_shape[1]) * (response.lon[1] - response.lon[0]);
    return [lat, lon];
}

function Grid({ grid, pathAndNode }: { grid: GridState, pathAndNode: PathAndNode }) {
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
            <LayersControl position="bottomleft"></LayersControl>
            {pathAndNode.path !== undefined ? (
                <Polyline pathOptions={pathOptions} positions={pathAndNode.path} />
            ) : (
                <></>
            )}
            {pathAndNode.node !== undefined ? (
                <CurrentNodeDisplay node={pathAndNode.node} grid={grid} />
            ) : (
                <></>
            )}
        </>
    );
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
    grid: GridState;
    setGrid: (grid: GridState) => void;
    pathAndNode: PathAndNode;
}

async function doSearchFromLocation(
    setImageState: (state: ImageState | undefined) => void,
    setGrid: (grid: GridState) => void,
    latLng: LatLng, settings: Settings,
    pathAndNode: PathAndNode,
    map: MapLeaflet | undefined,
) {
    setImageState(undefined);
    setGrid({
        loading: true,
        grid: undefined,
        response: undefined,
        startPosition: undefined
    });
    pathAndNode.setNode(undefined);
    pathAndNode.setPath(undefined);

    let url = new URL(window.location.origin + "/flight_cone");
    url.search = getSearchParams(latLng, settings).toString();

    let response = await fetch(url);

    if (response.status === 404) {
        setGrid({
            loading: false,
            grid: undefined,
            response: undefined,
            startPosition: undefined
        });
        alert("Location not yet supported!");
        return;
    }

    let cone: ConeSearchResponse = await response.json();

    const grid = setupGrid(cone)
    setGrid({
        loading: false,
        grid: grid,
        response: cone,
        startPosition: latLng
    });

    const searchParams = getSearchParams(latLng, settings).toString();
    let heightAglUrl = new URL(window.location.origin + "/agl_image");
    heightAglUrl.search = searchParams;
    let heightUrl = new URL(window.location.origin + "/height_image");
    heightUrl.search = searchParams;

    const bounds = new LatLngBounds(
        new LatLng(cone.lat[0], cone.lon[0]),
        new LatLng(cone.lat[1], cone.lon[1])
    );
    setImageState({
        heightAGLUrl: heightAglUrl.toString(),
        heightUrl: heightUrl.toString(),
        bounds
    });
    if (map !== undefined) {
        map.flyToBounds(bounds);
    }

    updateSearchParams(latLng, settings);
}

function updateSearchParams(latLng: LatLng | undefined, settings: Settings) {
    const searchParams = getSearchParams(latLng, settings);

    const url = new URL(window.location.origin);
    url.pathname = window.location.pathname;
    url.search = searchParams.toString();

    window.history.replaceState({}, "", url);
}

interface PathAndNode {
    path: LatLng[] | undefined;
    node: GridTile | undefined;
    setPath: (path: LatLng[] | undefined) => void;
    setNode: (node: GridTile | undefined) => void;
}

function SearchComponent({ setImageState, settings, grid, setGrid, pathAndNode }: SearchComponentProps) {
    const map = useMap();
    useMapEvents({
        async click(e) {
            await doSearchFromLocation(setImageState, setGrid, e.latlng, settings, pathAndNode, map);
        },
    });
    const urlParams = new URLSearchParams(window.location.search);

    const lat = urlParams.get('lat');
    const lon = urlParams.get('lon');
    if (lat !== null && lon !== null && grid.loading === false && grid.grid === undefined) {
        const latlon = new LatLng(+lat, +lon);
        doSearchFromLocation(setImageState, setGrid, latlon, settings, pathAndNode, map);
    }

    return grid === undefined ? (
        <></>
    ) : (
        <>
            <Grid grid={grid} pathAndNode={pathAndNode}></Grid>
        </>
    );
}

interface Settings {
    startHeight: number | undefined;
    additionalHeight: number;
    glideNumber: number;
    gridSize: number;
    trimSpeed: number;
    windSpeed: number;
    windDirection: number;
    safetyMargin: number;
    startDistance: number;
}

interface SettingsCardProps {
    settings: Settings;
    setSettings: (settings: Settings) => void;
    setImageState: (state: ImageState | undefined) => void;
    setGrid: (grid: GridState) => void;
    grid: GridState;
    pathAndNode: PathAndNode;
    setIsInfoOpen: (open: boolean) => void;
}

function copyUrlToClipBoard() {
    navigator.clipboard.writeText(window.location.href);
}

function SettingsCard({ settings, setSettings, setImageState, setGrid, grid, pathAndNode, setIsInfoOpen }: SettingsCardProps) {
    const setStartHeight = (value: number | undefined) => {
        if (value !== undefined && grid.response !== undefined) {
            if (value > grid.response.start_height) {
                setSettings({
                    ...settings,
                    startHeight: Math.max(grid.response.start_height, Math.round(value / 100) * 100)
                });
            } else {
                setSettings({
                    ...settings,
                    startHeight: grid.response.start_height
                });
            }
        } else {
            setSettings({
                ...settings,
                startHeight: value,
            });
        }

    };
    const handleUseModelHeightChanged = (value: string) => {
        if (settings.startHeight !== undefined) {
            setStartHeight(undefined);
        } else {
            if (grid.response !== undefined) {
                setStartHeight(grid.response.start_height);
            } else {
                setStartHeight(1000);
            }
        }
    }
    const setAdditionalHeight = (value: number) => {
        setSettings({
            ...settings,
            additionalHeight: value,
        });
    };
    const setGlideNumber = (value: number) => {
        setSettings({
            ...settings,
            glideNumber: value,
        });
    };
    const setGridSize = (value: number) => {
        setSettings({
            ...settings,
            gridSize: value,
        });
    };
    const setTrimSpeed = (value: number) => {
        setSettings({
            ...settings,
            trimSpeed: value,
        });
    };
    const setWindSpeed = (value: number) => {
        setSettings({
            ...settings,
            windSpeed: value,
        });
    };
    const setWindDirection = (value: number) => {
        setSettings({
            ...settings,
            windDirection: value,
        });
    }
    const setSafetyMargin = (value: number) => {
        setSettings({
            ...settings,
            safetyMargin: value,
        });
    }
    const setStartDistance = (value: number) => {
        setSettings({
            ...settings,
            startDistance: value,
        });
    }

    function rerun() {
        if (grid.startPosition !== undefined) {
            doSearchFromLocation(setImageState, setGrid, grid.startPosition, settings, pathAndNode, undefined);
        }
    }

    function clear() {
        setGrid({
            ...grid,
            response: undefined,
            startPosition: undefined,
            grid: undefined,
        });
        setImageState(undefined);
        updateSearchParams(undefined, settings);
    }

    let kmlUrl = undefined;
    if (grid.startPosition !== undefined) {
        const searchParams = getSearchParams(grid.startPosition, settings).toString();
        let kml = new URL(window.location.origin + "/kml");
        kml.search = searchParams;

        kmlUrl = kml.toString();
    }

    return (
        <div className="settings">
            <Section
                collapsible
                compact
                title="Settings"
                collapseProps={{ defaultIsOpen: false }}
            >
                <SectionCard>
                    Glide number:
                    <Slider
                        initialValue={1}
                        min={1}
                        max={12}
                        onChange={setGlideNumber}
                        value={settings.glideNumber}
                        labelStepSize={2}
                        stepSize={0.5}
                    ></Slider>
                    Grid size (m):
                    <Slider
                        initialValue={30}
                        min={30}
                        max={200}
                        onChange={setGridSize}
                        value={settings.gridSize}
                        labelStepSize={50}
                        stepSize={10}
                    ></Slider>
                    <Checkbox checked={settings.startHeight === undefined} label="Use model height" onChange={e => handleUseModelHeightChanged(e.target.value)} />
                    {
                        settings.startHeight !== undefined ?
                            <>
                                Start Height (m):
                                <Slider
                                    initialValue={grid.response !== undefined ? grid.response.start_height : 0}
                                    showTrackFill={true}
                                    min={0}
                                    max={5000}
                                    onChange={setStartHeight}
                                    value={settings.startHeight}
                                    labelStepSize={1000}
                                    stepSize={100}
                                    className="startHeightSlider"
                                ></Slider>
                            </> : <>
                                Additional Height (m):
                                <Slider
                                    initialValue={0}
                                    min={0}
                                    max={500}
                                    onChange={setAdditionalHeight}
                                    value={settings.additionalHeight}
                                    labelStepSize={100}
                                    stepSize={5}
                                ></Slider>
                            </>
                    }
                    <Divider />
                    Wind speed (km/h):
                    <Slider
                        initialValue={0}
                        min={0}
                        max={50}
                        onChange={setWindSpeed}
                        value={settings.windSpeed}
                        labelStepSize={10}
                        stepSize={5}
                    ></Slider>
                    Wind direction (°):
                    <Slider initialValue={0} min={0} max={360}
                        onChange={setWindDirection} value={settings.windDirection}
                        labelStepSize={90} stepSize={15}></Slider>
                    Trim speed (km/h):
                    <Slider
                        initialValue={20}
                        min={20}
                        max={80}
                        onChange={setTrimSpeed}
                        value={settings.trimSpeed}
                        labelStepSize={10}
                        stepSize={1}
                    ></Slider>
                    <Divider />
                    Safety margin (m):
                    <Slider initialValue={0} min={0} max={200}
                        onChange={setSafetyMargin} value={settings.safetyMargin}
                        labelStepSize={40} stepSize={10}></Slider>
                    Start distance (m):
                    <Slider initialValue={0} min={0} max={300}
                        onChange={setStartDistance} value={settings.startDistance}
                        labelStepSize={50} stepSize={10}></Slider>
                    {grid.response !== undefined ?
                        <>
                            <Button text="Clear" onClick={clear} className="marginRight" />
                            <Button text="Rerun" onClick={rerun} className="marginRight" />
                            <a href={kmlUrl} download="glideArea.kml" className="marginRight"><Button text="KML File" /></a>
                            <Button
                                icon={<Share />}
                                onClick={copyUrlToClipBoard}
                                className="marginRight"
                                text="Share">
                            </Button>
                        </> : <></>}
                </SectionCard>
            </Section>
            <br />
            <Button
                icon={<InfoSign />}
                onClick={() => setIsInfoOpen(true)}
                large={true}
                intent="primary"
                className="right">
            </Button>
        </div>
    );
}

interface InfoPanelProps {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
}

function InfoPanel({ isOpen, setIsOpen }: InfoPanelProps) {
    let handleClose = () => {
        setIsOpen(false);
    };
    return (
        <Overlay2
            onClose={handleClose}
            canEscapeKeyClose={true}
            canOutsideClickClose={true}
            hasBackdrop={true}
            isOpen={isOpen}
            className={Classes.OVERLAY_SCROLL_CONTAINER}
        >
            <div className="overlay">
                <H3>About</H3>
                <p>
                    This is a tool for calculating the area reachable by a paraglider when
                    starting from a specific location. It assumes that you fly
                    <ul>
                        <li>with a <b>constant glide ration</b> even when turning</li>
                        <li>using <b>no thermals</b></li>
                    </ul>
                    You can change the following settings:
                    <ul>
                        <li><b>Glide ratio</b>: Meters flown horizontally for every vertical meter lost</li>
                        <li>
                            <b>Grid size</b>: By default, the height grid uses a resolution of 100 meters, which should be accurate enough for many use cases. You can increase the resolution
                            if needed - note however that a higher resolution will result in a longer calculation.
                        </li>
                        <li>
                            <b>Additional starting height</b>: By default, the model height will be used as the start height. By default a small margin of 5 Meters is
                            added, because otherwise the tool sometimes will determine that you stop flying immediately. You can change this additional starting height, or set a fixed
                            start height by unchecking "Use model height". If the fixed height is below the model height, the model height will be used instead.
                        </li>
                    </ul>
                    <H4>WIND</H4>
                    By default, this tool assumes no wind. You can however simulate wind.
                    <ul>
                        <li><b>Wind speed</b>: The wind speed - will be constant for all heights</li>
                        <li>
                            <b>Wind direction</b>: The wind direction in degrees - will be constant for all heights. 0° is wind from the North, 90° East, 180° South and 270° wind from the west.
                        </li>
                        <li>
                            <b>Trim speed</b>: The tool will assume that you fly at trim (ie. no breaking/accelerating) and with an "optimal" lead angle to reach a certain location.
                            We can not simulate breaking/accelerating, since this would require knowing the polar curve of the paraglider (if someone has access to this, please let me know).
                        </li>
                    </ul>
                    <H4>Safety margin</H4>
                    By default, the tool will calculate the the reachable area by flying as close as possible to the terrain.
                    <ul>
                        <li>
                            <b>Safety margin</b>: You can set a custom safety margin. The reachable area will then be calculated assuming you can not
                            fly closer to the terrain <b>vertically</b> than this safety margin.
                        </li>
                        <li>
                            <b>Start distance</b>: The safety margin will be ignored below this start distance. It makes sense setting this, as otherwise the tool
                            will likely stop the calculation immediately at the start.
                        </li>
                    </ul>
                </p>
                <H3>Attribution</H3>
                This page is heavily inspired by <a href="https://hikeandfly.org/">hikeandfly.org</a>. The Digital evalation model comes
                from <a href="https://viewfinderpanoramas.org/dem3.html">Viewfinder Panoramas</a>. Maps are provided by
                <a href="https://opentopomap.org/about">OpenTopoMap</a>, <a href="https://opentopomap.org/about">OpenStreetMap</a> and <a href="https://www.arcgis.com/apps/mapviewer/">ArcGIS</a> and are rendered using <a href="https://leafletjs.com/">Leaflet</a>.<br />
                The code for this page is open source and can be found on <a href="https://github.com/Hoff97/hikeandfly">Github</a>.
                <br />
                <br />
                <Button intent={Intent.DANGER} onClick={handleClose} style={{ margin: "" }}>
                    Close
                </Button>
            </div>
        </Overlay2>
    );
}

function App() {
    const [imageState, setImageState] = useState<ImageState | undefined>();

    const urlParams = new URLSearchParams(window.location.search);

    const startHeight = urlParams.get('start_height');
    const [settings, setSettings] = useState<Settings>({
        startHeight: (startHeight !== null ? (+startHeight) : undefined),
        additionalHeight: +(urlParams.get('additional_height') || 5),
        glideNumber: +(urlParams.get('glide_number') || 6.5),
        gridSize: +(urlParams.get('cell_size') || 100),
        trimSpeed: +(urlParams.get('trim_speed') || 37),
        windSpeed: +(urlParams.get('wind_speed') || 0),
        windDirection: +(urlParams.get('wind_direction') || 0),
        safetyMargin: +(urlParams.get('safety_margin') || 0),
        startDistance: +(urlParams.get('start_distance') || 50),
    });
    const [grid, setGrid] = useState<GridState>({
        loading: false,
        grid: undefined,
        response: undefined,
        startPosition: undefined
    });
    const [path, setPath] = useState<LatLng[] | undefined>();
    const [node, setNode] = useState<GridTile | undefined>();
    const pathAndNode = {
        path, setPath, node, setNode
    };
    const [isInfoOpen, setIsisInfoOpen] = useState<boolean>(false);

    return (
        <div className="App">
            <OverlaysProvider>
                <div className="loading">
                    {grid.loading ?
                        <Spinner
                            intent={Intent.PRIMARY}
                            size={50}
                        /> : <></>
                    }
                </div>
                <InfoPanel isOpen={isInfoOpen} setIsOpen={setIsisInfoOpen}></InfoPanel>
                <SettingsCard
                    settings={settings}
                    setSettings={setSettings}
                    grid={grid}
                    setGrid={setGrid}
                    setImageState={setImageState}
                    pathAndNode={pathAndNode}
                    setIsInfoOpen={setIsisInfoOpen}></SettingsCard>
                <MapContainer center={[47.42280178926773, 10.984954833984375]} zoom={13} scrollWheelZoom={true}>
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
                                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                            />
                        </LayersControl.BaseLayer>
                        {imageState !== undefined ? (
                            <ImageOverlays state={imageState}></ImageOverlays>
                        ) : (
                            <></>
                        )}
                    </LayersControl>
                    <SearchComponent setImageState={setImageState} settings={settings} grid={grid} setGrid={setGrid} pathAndNode={pathAndNode}></SearchComponent>
                </MapContainer>
            </OverlaysProvider>
        </div>
    );
}

export default App;
