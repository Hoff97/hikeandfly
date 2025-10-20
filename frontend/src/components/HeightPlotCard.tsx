import { Button, Drawer, Radio, RadioGroup } from "@blueprintjs/core";
import { HeightPoint, Settings } from "../utils/types";
import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, Tooltip, TooltipContentProps, XAxis, YAxis } from "recharts";

interface HeightPlotCardProps {
    setCursorNode: (cursorNode: HeightPoint | undefined) => void;
    heightPoints: HeightPoint[] | undefined;
    settings: Settings,
}

interface CustomTooltipProps extends TooltipContentProps<string | number, string> {
    setFlightHeightItem: (d: HeightPoint) => void;
}

const CustomTooltip = ({ active, payload, label, setFlightHeightItem }: CustomTooltipProps) => {
    const isVisible = active && payload && payload.length;

    if (isVisible) {
        setFlightHeightItem(payload[0].payload.node);
    }

    return (
        <div className="custom-tooltip" style={{ visibility: isVisible ? 'visible' : 'hidden' }}>
            {isVisible && (
                <>
                    <table>
                        <tbody>
                            <tr>
                                <td>Distance:</td>
                                <td>{Math.round(payload[0].payload.distance)}m</td>
                            </tr>
                            <tr style={{ color: payload[0].stroke }}>
                                <td>Height:</td>
                                <td>{Math.round(payload[0].payload.Height)}m</td>
                            </tr>
                            <tr style={{ color: payload[1].stroke }}>
                                <td>Ground:</td>
                                <td>{Math.round(payload[0].payload.Ground)}m</td>
                            </tr>
                        </tbody>
                    </table>

                </>
            )
            }
        </div >
    );
};

export function HeightPlotCard({ setCursorNode, heightPoints, settings }: HeightPlotCardProps) {
    let [drawerOpen, setDrawerOpen] = useState(false);
    let [plotType, setPlotType] = useState<"h" | "agl">("h");

    const setFlightHeightItem = (d: HeightPoint) => {
        setCursorNode(d);
    };

    const close = () => {
        setDrawerOpen(false);
        setCursorNode(undefined);
    }

    if (heightPoints === undefined) {
        return (<></>);
    }

    let minFlightHeight = 100000;
    let maxFlightHeight = -1000;
    let maxDistance = 0;

    const data = []

    let start_safety_margin = undefined;
    for (let point of heightPoints) {
        let height = point.height;
        if (plotType === "agl") {
            height = point.height - point.groundHeight;
        }

        minFlightHeight = Math.min(minFlightHeight, height);
        maxFlightHeight = Math.max(maxFlightHeight, height);
        maxDistance = Math.max(maxDistance, point.distance);

        let dataPoint = {
            distance: point.distance,
            Height: height,
            Ground: plotType === "agl" ? 0 : point.groundHeight,
            "Safety margin": undefined,
            node: point
        };

        let safety_margin_eps = 14.0;
        if (start_safety_margin === undefined && point.height - settings.safetyMargin + safety_margin_eps < point.groundHeight && point.distance >= settings.startDistance) {
            start_safety_margin = point.distance;
        }

        if (settings.safetyMargin > 0 && point.distance >= settings.startDistance) {
            if (plotType === "agl") {
                // @ts-ignore
                dataPoint["Safety margin"] = settings.safetyMargin;
            } else {
                // @ts-ignore
                dataPoint["Safety margin"] = height - settings.safetyMargin;
            }
        }
        data.push(dataPoint);
    }

    const mobile = window.innerWidth < 600;
    const plotHeight = 400;
    const drawerSize = plotHeight + (mobile ? 100 : 50); // Increased to 120 for better mobile layout with vertical stacking

    const plotWidth = Math.min(window.innerWidth * 0.8);
    const aspectRatio = plotWidth / plotHeight;

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
                    <LineChart style={{ width: plotWidth, aspectRatio: aspectRatio, maxWidth: plotWidth }} responsive data={data}>
                        <CartesianGrid />
                        <Line dataKey="Height" stroke="green" strokeWidth={1} animationDuration={500} />
                        <Line dataKey="Ground" stroke="red" strokeWidth={1} animationDuration={500} />
                        <Line dataKey="Safety margin" stroke="blue" strokeDasharray="5 5" strokeWidth={1} animationDuration={500} />
                        <XAxis dataKey="distance" tickCount={10} tickFormatter={(v) => `${Math.round(v / 100) * 100} m`} />
                        <YAxis domain={['dataMin - 50', 'dataMax + 50']} tickFormatter={(v) => `${Math.round(v)} m`} />
                        <Legend />
                        <Tooltip content={(props) => {
                            // @ts-ignore
                            return (<CustomTooltip setFlightHeightItem={setFlightHeightItem} {...props} />);
                        }} animationDuration={0} />
                    </LineChart>
                    <RadioGroup label="Plot" onChange={(e) => {
                        setPlotType(e.currentTarget.value as "h" | "agl");
                        setCursorNode(undefined);
                    }} selectedValue={plotType} inline={mobile}>
                        <Radio label="Height" value="h" />
                        <Radio label="AGL" value="agl" />
                    </RadioGroup>
                </div>
            </Drawer>
        </>
    )
}