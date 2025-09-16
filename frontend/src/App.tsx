import { useState } from "react";
import "./App.css";
import {
    LayersControl,
    MapContainer,
    TileLayer,
} from "react-leaflet";
import { LatLng } from "leaflet";
import { Spinner, Intent, OverlaysProvider } from "@blueprintjs/core";
import { InfoPanel } from "./components/InfoPanel";
import { GridState, GridTile, HeightPoint, ImageState, Settings } from "./utils/types";
import { SettingsCard } from "./components/SettingsCard";
import { ImageOverlays } from "./components/ImageOverlay";
import { HoverState, SearchComponent } from "./components/SearchComponent";
import { CurrenLocationPane } from "./components/CurrentLocation";
import { HeightPlotCard } from "./components/HeightPlotCard";

function App() {
    const [imageState, setImageState] = useState<ImageState | undefined>();
    const [hoverState, setHoverState] = useState<HoverState>({ imageState: undefined, lastHoverSearch: 0 });

    const urlParams = new URLSearchParams(window.location.search);

    const startHeight = urlParams.get('start_height');
    const [settings, setSettings] = useState<Settings>({
        startHeight: (startHeight !== null ? (+startHeight) : undefined),
        additionalHeight: +(urlParams.get('additional_height') || 5),
        glideNumber: +(urlParams.get('glide_number') || 6.5),
        gridSize: +(urlParams.get('cell_size') || 50),
        minGridSize: 30,
        trimSpeed: +(urlParams.get('trim_speed') || 37),
        windSpeed: +(urlParams.get('wind_speed') || 0),
        windDirection: +(urlParams.get('wind_direction') || 0),
        safetyMargin: +(urlParams.get('safety_margin') || 0),
        startDistance: +(urlParams.get('start_distance') || 50),
        abortController: undefined,
        doLiveHoverSearch: false
    });
    const [grid, setGrid] = useState<GridState>({
        loading: "done",
        grid: undefined,
        response: undefined,
        startPosition: undefined
    });
    const [path, setPath] = useState<LatLng[] | undefined>();
    const [fixed, setFixed] = useState<boolean>(false);
    const [node, setNode] = useState<GridTile | undefined>();
    const [heightPoints, setHeightPoints] = useState<HeightPoint[] | undefined>();
    const [cursorNode, setCursorNode] = useState<HeightPoint | undefined>();
    const pathAndNode = {
        path, setPath, node, setNode, fixed, setFixed, heightPoints, setHeightPoints, cursorNode, setCursorNode
    };
    const [isInfoOpen, setIsisInfoOpen] = useState<boolean>(false);

    const lastLocationLat = +(window.localStorage.getItem("lastLocationLat") || "47.42280178926773");
    const lastLocationLon = +(window.localStorage.getItem("lastLocationLon") || "10.984954833984375");

    return (
        <div className="App">
            <OverlaysProvider>
                <div className="loading">
                    {grid.loading !== "done" ?
                        <Spinner
                            intent={grid.loading === "image" ? Intent.PRIMARY : Intent.SUCCESS}
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
                <HeightPlotCard pathAndNode={pathAndNode} settings={settings} />
                <MapContainer center={[lastLocationLat, lastLocationLon]} zoom={13} scrollWheelZoom={true}>
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
                        {hoverState.imageState !== undefined ? (
                            <ImageOverlays state={hoverState.imageState}></ImageOverlays>
                        ) : (
                            <></>
                        )}
                    </LayersControl>
                    <SearchComponent
                        setImageState={setImageState}
                        imageState={imageState}
                        setHoverState={setHoverState}
                        hoverState={hoverState}
                        settings={settings}
                        grid={grid}
                        setGrid={setGrid}
                        pathAndNode={pathAndNode}
                        setSettings={setSettings}></SearchComponent>
                    <CurrenLocationPane
                        setImageState={setImageState}
                        settings={settings}
                        setGrid={setGrid}
                        pathAndNode={pathAndNode}
                        setSettings={setSettings}></CurrenLocationPane>
                </MapContainer>
            </OverlaysProvider>
        </div>
    );
}

export default App;

