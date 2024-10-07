import { Button, Drawer } from "@blueprintjs/core";
import { PathAndNode } from "../utils/types";
import { useState } from "react";

import { Crosshair, HorizontalGridLines, LineSeries, LineSeriesPoint, MarkSeries, VerticalGridLines, XAxis, XYPlot, YAxis } from "react-vis";

interface HeightPlotCardProps {
    pathAndNode: PathAndNode;
}

export function HeightPlotCard({ pathAndNode }: HeightPlotCardProps) {
    let [drawerOpen, setDrawerOpen] = useState(false);
    let [groundHeight, setGroundHeight] = useState<LineSeriesPoint | undefined>(undefined);
    let [flightHeight, setFlightHeight] = useState<LineSeriesPoint | undefined>(undefined);

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

    const flightData = [];
    const groundData = [];
    for (let point of pathAndNode.heightPoints) {
        flightData.push({ x: point.distance, y: point.height, node: point });
        groundData.push({ x: point.distance, y: point.groundHeight });
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

    return (
        <>
            <div className="heightPlotButton">
                <Button onClick={() => setDrawerOpen(true)} icon={"arrow-up"}>Height Plot</Button>
            </div>
            <Drawer
                icon="info-sign"
                onClose={close}
                title="Path height plot"
                size={"default"}
                isOpen={drawerOpen}
                className="heightPlotDrawer"
                canEscapeKeyClose={true}
                canOutsideClickClose={false}
                hasBackdrop={false}
                position={"bottom"}>
                <div className={"heightPlotDrawerBody"}>
                    <XYPlot height={400} width={window.innerWidth * 0.8} >
                        <VerticalGridLines />
                        <HorizontalGridLines />
                        <XAxis />
                        <YAxis />
                        <LineSeries data={flightData} color={"green"} fill={0}
                            onNearestX={setFlightHeigthItem} />
                        <LineSeries data={groundData}
                            color={"red"}
                            curve={"curveMonotoneX"}
                            onNearestX={d => setGroundHeight(d)} />
                        {
                            groundHeight !== undefined && flightHeight !== undefined ? (
                                <Crosshair values={[groundHeight, flightHeight]} className={'invisibleCrosshair'}>
                                    <div style={{ background: 'black', minWidth: '80px', maxWidth: '110px' }}>
                                        Height: {Math.round(flightHeight.y)}m<br />
                                        Ground: {Math.round(groundHeight.y)}m<br />
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
                            color={"blue"}
                            stroke={3} />
                    </XYPlot>
                </div>
            </Drawer>
        </>
    )
}