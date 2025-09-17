import { Section, SectionCard, Slider, Button, Divider, Checkbox } from "@blueprintjs/core";
import { InfoSign, Share } from "@blueprintjs/icons";
import { GridState, ImageState, PathAndNode, SetSettings, Settings } from "../utils/types";
import { doSearchFromLocation, getSearchParams, updateSearchParams } from "../utils/utils";

interface SettingsCardProps {
    settings: Settings;
    setSettings: SetSettings;
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
    const setStartHeight = (value: number | undefined, preview: boolean = false) => {
        if (value !== undefined && grid.response !== undefined) {
            if (value > grid.response.start_height) {
                settings = {
                    ...settings,
                    startHeight: Math.max(grid.response.start_height, Math.round(value / 100) * 100)
                };
                setSettings(settings);
            } else {
                settings = {
                    ...settings,
                    startHeight: grid.response.start_height
                };
                setSettings(settings);
            }
        } else {
            settings = {
                ...settings,
                startHeight: value,
            };
            setSettings(settings);
        }
        setTimeout(() => {
            rerun(preview);
        }, 0);
    };
    const handleUseModelHeightChanged = (value: string) => {
        if (settings.startHeight !== undefined) {
            setStartHeight(undefined, false);
        } else {
            if (grid.response !== undefined) {
                setStartHeight(grid.response.start_height, false);
            } else {
                setStartHeight(1000, false);
            }
        }
    }
    const setAdditionalHeight = (value: number, preview: boolean = false) => {
        settings = {
            ...settings,
            additionalHeight: value,
        };
        setSettings(settings);
        setTimeout(() => {
            rerun(preview);
        }, 0);
    };
    const setGlideNumber = (value: number, preview: boolean = false) => {
        settings = {
            ...settings,
            glideNumber: value,
        };
        setSettings(settings);
        setTimeout(() => {
            rerun(preview);
        }, 0);
    };
    const setGridSize = (value: number, preview: boolean = false) => {
        if (value > settings.minGridSize) {
            settings = {
                ...settings,
                gridSize: Math.max(settings.minGridSize, Math.round(value / 10) * 10)
            }
            setSettings(settings);
        } else {
            settings = {
                ...settings,
                gridSize: settings.minGridSize
            };
            setSettings(settings);
        }
        if (!preview) {
            setTimeout(() => {
                rerun(preview);
            }, 0);
        }
    }
    const setTrimSpeed = (value: number, preview: boolean = false) => {
        setSettings({
            ...settings,
            trimSpeed: value,
        });
        if (settings.windSpeed > 0) {
            setTimeout(() => {
                rerun(preview);
            }, 0);
        }
    };
    const setWindSpeed = (value: number, preview: boolean = false) => {
        settings = {
            ...settings,
            windSpeed: value,
        };
        setSettings(settings);
        setTimeout(() => {
            rerun(preview);
        }, 0);
    };
    const setWindDirection = (value: number, preview: boolean = false) => {
        settings = {
            ...settings,
            windDirection: value,
        };
        setSettings(settings);
        if (settings.windSpeed > 0) {
            setTimeout(() => {
                rerun(preview);
            }, 0);
        }
    }
    const setSafetyMargin = (value: number, preview: boolean = false) => {
        settings = {
            ...settings,
            safetyMargin: value,
        };
        setSettings(settings);
        setTimeout(() => {
            rerun(preview);
        }, 0);
    }
    const setStartDistance = (value: number, preview: boolean = false) => {
        settings = {
            ...settings,
            startDistance: value,
        };
        setSettings(settings);

        if (settings.safetyMargin > 0) {
            setTimeout(() => {
                rerun(preview);
            }, 0);
        }
    }

    function rerun(preview: boolean = false) {
        if (grid.startPosition !== undefined) {
            if (preview) {
                let searchSettings = { ...settings, gridSize: 200 };
                doSearchFromLocation(setImageState, (g) => { }, (s) => { }, grid.startPosition, searchSettings, pathAndNode, undefined, preview);
            } else {
                doSearchFromLocation(setImageState, setGrid, setSettings, grid.startPosition, settings, pathAndNode, undefined, preview);
            }
        }
    }

    function clear() {
        if (settings.abortController !== undefined) {
            settings.abortController.abort();
        }
        setGrid({
            ...grid,
            response: undefined,
            startPosition: undefined,
            grid: undefined,
            loading: "done"
        });
        pathAndNode.setNode(undefined);
        pathAndNode.setPath(undefined);
        pathAndNode.setFixed(false);
        pathAndNode.setHeightPoints(undefined);
        pathAndNode.setCursorNode(undefined);
        const newSettings = {
            ...settings,
            abortController: undefined,
            lastCall: undefined,
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
                        onRelease={setGlideNumber}
                        onChange={(v) => setGlideNumber(v, true)}
                        value={settings.glideNumber}
                        labelStepSize={2}
                        stepSize={0.5}
                    ></Slider>
                    Grid size (m):
                    <Slider
                        initialValue={settings.minGridSize}
                        min={30}
                        max={200}
                        onRelease={setGridSize}
                        onChange={(v) => setGridSize(v, true)}
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
                                    onRelease={setStartHeight}
                                    onChange={(v) => setStartHeight(v, true)}
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
                                    onRelease={setAdditionalHeight}
                                    onChange={(v) => setAdditionalHeight(v, true)}
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
                        onRelease={setWindSpeed}
                        onChange={(v) => setWindSpeed(v, true)}
                        value={settings.windSpeed}
                        labelStepSize={10}
                        stepSize={5}
                    ></Slider>
                    Wind direction (°):
                    <Slider initialValue={0} min={0} max={360}
                        onRelease={setWindDirection} onChange={(v) => setWindDirection(v, true)} value={settings.windDirection}
                        labelStepSize={90} stepSize={15}></Slider>
                    Trim speed (km/h):
                    <Slider
                        initialValue={20}
                        min={20}
                        max={80}
                        onRelease={setTrimSpeed}
                        onChange={(v) => setTrimSpeed(v, true)}
                        value={settings.trimSpeed}
                        labelStepSize={10}
                        stepSize={1}
                    ></Slider>
                    <Divider />
                    Safety margin (m):
                    <Slider initialValue={0} min={0} max={200}
                        onRelease={setSafetyMargin} onChange={(v) => setSafetyMargin(v, true)} value={settings.safetyMargin}
                        labelStepSize={40} stepSize={10}></Slider>
                    Start distance (m):
                    <Slider initialValue={0} min={0} max={1000}
                        onRelease={setStartDistance} onChange={(v) => setStartDistance(v, true)} value={settings.startDistance}
                        labelStepSize={200} stepSize={10}></Slider>
                    <Divider />
                    {grid.response !== undefined ?
                        <>
                            <Button text="Clear" onClick={clear} className="marginRight" />
                            <Button text="Rerun" onClick={() => rerun(false)} className="marginRight" />
                            <a href={kmlUrl} download="glideArea.kml" className="marginRight"><Button text="KML File" /></a>
                            <Button
                                icon={<Share />}
                                onClick={copyUrlToClipBoard}
                                className="marginRight"
                                text="Share">
                            </Button>
                        </> : <>
                            <Checkbox checked={settings.doLiveHoverSearch} label="Live hover area" onChange={e => setSettings({ ...settings, doLiveHoverSearch: e.target.checked })} />
                        </>}
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