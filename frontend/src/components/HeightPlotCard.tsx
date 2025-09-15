import { Button, Drawer, Radio, RadioGroup } from "@blueprintjs/core";
import { PathAndNode, Settings } from "../utils/types";
import { useState } from "react";

import { AreaSeries, Crosshair, HorizontalGridLines, LineSeries, LineSeriesPoint, MarkSeries, VerticalGridLines, XAxis, XYPlot, YAxis } from "react-vis";

interface HeightPlotCardProps {
    pathAndNode: PathAndNode;
    settings: Settings,
}

export function HeightPlotCard({ pathAndNode, settings }: HeightPlotCardProps) {
    let [drawerOpen, setDrawerOpen] = useState(false);
    let [groundHeight, setGroundHeight] = useState<LineSeriesPoint | undefined>(undefined);
    let [flightHeight, setFlightHeight] = useState<LineSeriesPoint | undefined>(undefined);
    let [plotType, setPlotType] = useState<"h" | "agl">("h");

    const setFlightHeigthItem = (d: LineSeriesPoint) => {
        setFlightHeight(d);
        pathAndNode.setCursorNode(d.node);
    };

    const close = () => {
        setDrawerOpen(false);
        setGroundHeight(undefined);
        setFlightHeight(undefined);
        pathAndNode.setCursorNode(undefined);
    }

    if (pathAndNode.heightPoints === undefined) {
        return (<></>);
    }

    let minFlightHeight = 100000;
    let maxFlightHeight = -1000;
    let maxDistance = 0;
    const flightData = [];
    const groundData = [];
    let safetyMargin = [];
    let start_safety_margin = undefined;
    for (let point of pathAndNode.heightPoints) {
        let height = point.height;
        if (plotType === "agl") {
            height = point.height - point.groundHeight;
        }

        minFlightHeight = Math.min(minFlightHeight, height);
        maxFlightHeight = Math.max(maxFlightHeight, height);
        maxDistance = Math.max(maxDistance, point.distance);
        flightData.push({ x: point.distance, y: height, node: point });
        groundData.push({ x: point.distance, y: plotType === "agl" ? 0 : point.groundHeight });

        let safety_margin_eps = 20.0;
        if (start_safety_margin === undefined && point.height - settings.safetyMargin + safety_margin_eps < point.groundHeight && point.distance >= settings.startDistance) {
            console.log("In safety margin");
            start_safety_margin = point.distance;
        }

        if (settings.safetyMargin > 0 && point.distance >= settings.startDistance) {
            if (plotType === "agl") {
                safetyMargin.push({ x: point.distance, y: settings.safetyMargin });
            } else {
                safetyMargin.push({ x: point.distance, y: height - settings.safetyMargin });
            }
        }
    }

    let flightMarks = [];
    let groundMarks = [];
    let aglData = []
    if (flightHeight !== undefined && groundHeight !== undefined) {
        flightMarks.push({
            x: flightHeight.x,
            y: flightHeight.y,
            size: 1
        });
        groundMarks.push({
            x: groundHeight.x,
            y: groundHeight.y,
            size: 1
        });
        aglData.push({ x: groundHeight.x, y: groundHeight.y });
        aglData.push({ x: flightHeight.x, y: flightHeight.y });
    }

    // Type hints are not quite correct
    let Xaxis = XAxis as any;
    let Yaxis = YAxis as any;

    const mobile = window.innerWidth < 600;
    const plotHeight = 400;
    const drawerSize = plotHeight + (mobile ? 100 : 50); // Increased to 120 for better mobile layout with vertical stacking

    let crosshairPostion = 0;
    let crossHairOffset = 10
    let crossHairOrientation = "right";
    let crossHairVerticalOffset = plotType === "agl" ? 10 : 45;
    if (flightHeight !== undefined) {
        crosshairPostion = (flightHeight.y - minFlightHeight) / (maxFlightHeight - minFlightHeight);
        crosshairPostion = Math.max(Math.round((1 - crosshairPostion) * plotHeight * 0.85 - crossHairVerticalOffset), 0);

        if (flightHeight.x > 0.75 * (flightData[0].x + flightData[flightData.length - 1].x)) {
            crossHairOrientation = "left";
            crossHairOffset = -10;
        }
    }

    return (
        <>
            <div className="heightPlotButton">
                <Button onClick={() => setDrawerOpen(true)} icon={"arrow-up"}>Height Plot</Button>
            </div>
            <Drawer
                icon="chart"
                onClose={close}
                title="Path height plot"
                size={drawerSize}
                isOpen={drawerOpen}
                className="heightPlotDrawer"
                canEscapeKeyClose={true}
                canOutsideClickClose={false}
                hasBackdrop={false}
                position={"bottom"}>
                <div className={"heightPlotDrawerBody"}>
                    <XYPlot height={plotHeight} width={window.innerWidth * 0.8} >
                        <VerticalGridLines />
                        <HorizontalGridLines />
                        <Xaxis title={"Distance (m)"} position="middle" />
                        <Yaxis title={"Height (m)"} position="middle" />
                        {
                            start_safety_margin !== undefined ? (
                                <AreaSeries
                                    data={[{ x: start_safety_margin, y: maxFlightHeight }, { x: maxDistance, y: maxFlightHeight }]}
                                    color={"rgba(200,170,50,0.2)"}
                                />
                            ) : <></>}
                        <LineSeries data={flightData} color={"green"}
                            onNearestX={setFlightHeigthItem} />
                        <LineSeries data={groundData}
                            color={"red"}
                            curve={"curveMonotoneX"}
                            onNearestX={d => setGroundHeight(d)} />
                        <LineSeries data={safetyMargin} color={"#66D"} strokeStyle="dashed" />
                        {
                            groundHeight !== undefined && flightHeight !== undefined ? (
                                <Crosshair values={[groundHeight, flightHeight]} className={'invisibleCrosshair'} orientation={crossHairOrientation as any}>
                                    <div style={{ background: 'black', minWidth: '80px', maxWidth: '110px', transform: `translate(${crossHairOffset}px, ${crosshairPostion}px)` }}>
                                        {plotType === "agl" ? (<></>
                                        ) : (
                                            <>
                                                Height: {Math.round(flightHeight.y)}m<br />
                                                Ground: {Math.round(groundHeight.y)}m<br />
                                            </>
                                        )}
                                        AGL: {Math.round(flightHeight.y - groundHeight.y)}m
                                    </div>
                                </Crosshair>) : <></>
                        }
                        <MarkSeries
                            strokeWidth={1}
                            data={flightMarks}
                            color={"green"}
                            opacity={0.8}
                            sizeRange={[0, 5]}
                        />
                        <MarkSeries
                            strokeWidth={1}
                            data={groundMarks}
                            color={"red"}
                            opacity={0.8}
                            sizeRange={[0, 5]}
                        />
                        <LineSeries data={aglData}
                            color="red"
                            stroke={3}
                            strokeStyle="dashed" />
                    </XYPlot>
                    <RadioGroup label="Plot" onChange={(e) => {
                        setPlotType(e.currentTarget.value as "h" | "agl");
                        setGroundHeight(undefined);
                        setFlightHeight(undefined);
                        pathAndNode.setCursorNode(undefined);
                    }} selectedValue={plotType} inline={mobile}>
                        <Radio label="Height" value="h" />
                        <Radio label="AGL" value="agl" />
                    </RadioGroup>
                </div>
            </Drawer>
        </>
    )
}