import { Button, Intent, H3, Overlay2, Classes, H4 } from "@blueprintjs/core";

interface InfoPanelProps {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
}

export function InfoPanel({ isOpen, setIsOpen }: InfoPanelProps) {
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
                        <li>with a <b>constant glide ratio</b> even when turning</li>
                        <li>using <b>no thermals</b></li>
                    </ul>
                    <H4>Controls</H4>
                    <ul>
                        <li>
                            Click on the map to calculate the glide area from that location. Afterwards you can click on any
                            part of the glide area to see the glide path to that location.
                        </li>
                        <li>
                            Double click on any part of the glide area to start a new calculation from that location.
                        </li>
                        <li>
                            Right click/hold on any part of the glide area to start a new calculation from the clicked location
                            with the height of the glide area.
                        </li>
                    </ul>
                    <H4>Settings</H4>
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
                    <H4>Live hover search</H4>
                    <p>
                        The live hover search allows you to see the current image and grid information as you move the mouse/center over the map.
                        This will happen at a reduced resolution of 200 meters.
                    </p>
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