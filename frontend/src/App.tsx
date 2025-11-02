import { useState } from "react";
import "./App.css";
import {
    CircleMarker,
    LayersControl,
    MapContainer,
} from "react-leaflet";
import { LatLng } from "leaflet";
import { Spinner, Intent, OverlaysProvider } from "@blueprintjs/core";
import { InfoPanel } from "./components/InfoPanel";
import { GridState, GridTile, HeightPoint, ImageState, SetSettings, Settings } from "./utils/types";
import { SettingsCard } from "./components/SettingsCard";
import { ImageOverlays } from "./components/ImageOverlay";
import { HoverState, SearchComponent } from "./components/SearchComponent";
import { CurrenLocationPane } from "./components/CurrentLocation";
import { HeightPlotCard } from "./components/HeightPlotCard";
import { SearchCard } from "./components/SearchCard";
import { FlyingSiteOverlay } from "./components/FlyingSiteOverlay";
import { BaseLayers } from "./components/BaseLayers";

function App() {
    const [imageState, setImageState] = useState<ImageState | undefined>();
    const [hoverState, setHoverState] = useState<HoverState>({ imageState: undefined, lastHoverSearch: 0 });

    const urlParams = new URLSearchParams(window.location.search);

    const startHeight = urlParams.get('start_height');
    const [settings, setSettingsState] = useState<Settings>({
        startHeight: (startHeight !== null ? (+startHeight) : undefined),
        additionalHeight: +(urlParams.get('additional_height') || window.localStorage.getItem("additionalHeight") || 5),
        glideNumber: +(urlParams.get('glide_number') || window.localStorage.getItem("glideNumber") || 6.5),
        gridSize: +(urlParams.get('cell_size') || window.localStorage.getItem("gridSize") || 50),
        minGridSize: 30,
        trimSpeed: +(urlParams.get('trim_speed') || window.localStorage.getItem("trimSpeed") || 37),
        windSpeed: +(urlParams.get('wind_speed') || window.localStorage.getItem("windSpeed") || 0),
        windDirection: +(urlParams.get('wind_direction') || window.localStorage.getItem("windDirection") || 0),
        safetyMargin: +(urlParams.get('safety_margin') || window.localStorage.getItem("safetyMargin") || 0),
        startDistance: +(urlParams.get('start_distance') || window.localStorage.getItem("startDistance") || 50),
        abortController: undefined,
        doLiveHoverSearch: false,
        fastInternet: false,
    });

    let updatedSavedSettings = (newSettings: Settings) => {
        window.localStorage.setItem("additionalHeight", newSettings.additionalHeight.toString());
        window.localStorage.setItem("glideNumber", newSettings.glideNumber.toString());
        window.localStorage.setItem("gridSize", newSettings.gridSize.toString());
        window.localStorage.setItem("trimSpeed", newSettings.trimSpeed.toString());
        window.localStorage.setItem("windSpeed", newSettings.windSpeed.toString());
        window.localStorage.setItem("windDirection", newSettings.windDirection.toString());
        window.localStorage.setItem("safetyMargin", newSettings.safetyMargin.toString());
        window.localStorage.setItem("startDistance", newSettings.startDistance.toString());
    }

    let setSettings: SetSettings = (newSettings) => {
        if (typeof newSettings === "function") {
            setSettingsState((settings) => {
                const updatedSettings = newSettings(settings);
                updatedSavedSettings(updatedSettings);
                return updatedSettings;
            });
        } else {
            updatedSavedSettings(newSettings);
            setSettingsState(newSettings);
        }
    };

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
                <HeightPlotCard heightPoints={pathAndNode.heightPoints} setCursorNode={setCursorNode} settings={settings} />
                <MapContainer center={[lastLocationLat, lastLocationLon]} zoom={13} scrollWheelZoom={true}>
                    <LayersControl position="bottomright">
                        <BaseLayers></BaseLayers>
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
                        <LayersControl.Overlay name="Flying sites" checked>
                            <CircleMarker center={[0, 0]} radius={0}></CircleMarker>
                        </LayersControl.Overlay>
                    </LayersControl>
                    <FlyingSiteOverlay></FlyingSiteOverlay>
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
                    <SearchCard></SearchCard>
                </MapContainer>
            </OverlaysProvider>
        </div>
    );
}

export default App;

