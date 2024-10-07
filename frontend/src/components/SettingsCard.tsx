import { Section, SectionCard, Slider, Button, Divider, Checkbox } from "@blueprintjs/core";
import { InfoSign, Share } from "@blueprintjs/icons";
import { GridState, ImageState, PathAndNode, Settings } from "../utils/types";
import { doSearchFromLocation, getSearchParams, updateSearchParams } from "../utils/utils";

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

export function SettingsCard({ settings, setSettings, setImageState, setGrid, grid, pathAndNode, setIsInfoOpen }: SettingsCardProps) {
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
        if (value > settings.minGridSize) {
            setSettings({
                ...settings,
                gridSize: Math.max(settings.minGridSize, Math.round(value / 10) * 10)
            });
        } else {
            setSettings({
                ...settings,
                gridSize: settings.minGridSize
            });
        }
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
            doSearchFromLocation(setImageState, setGrid, setSettings, grid.startPosition, settings, pathAndNode, undefined);
        }
    }

    function clear() {
        setGrid({
            ...grid,
            response: undefined,
            startPosition: undefined,
            grid: undefined,
        });
        const newSettings = {
            ...settings,
            minGridSize: 30,
            gridSize: Math.round(settings.gridSize / 10) * 10
        };
        setSettings(newSettings);
        setImageState(undefined);
        updateSearchParams(undefined, newSettings);
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
                        initialValue={settings.minGridSize}
                        min={30}
                        max={200}
                        onChange={setGridSize}
                        value={settings.gridSize}
                        labelStepSize={50}
                        stepSize={10}
                        className="restrictedSlider"
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
                                    className="restrictedSlider"
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