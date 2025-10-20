import { Button } from "@blueprintjs/core";
import { useMap } from "react-leaflet";
import { GridState, ImageState, PathAndNode, SetSettings, Settings } from "../utils/types";
import { searchFromCurrentLocation } from "../utils/utils";

interface CurrentLocationProps {
    setImageState: (state: ImageState | undefined) => void;
    settings: Settings;
    setSettings: SetSettings;
    setGrid: (grid: GridState) => void;
    pathAndNode: PathAndNode;
}

export function CurrenLocationPane({ setImageState, setGrid, setSettings, settings, pathAndNode }: CurrentLocationProps) {
    const map = useMap();

    return <>
        {
            "geolocation" in navigator ? <Button
                onClick={(ev) => {
                    searchFromCurrentLocation(setImageState, setGrid, setSettings, settings, pathAndNode, map);
                    ev.stopPropagation();
                    ev.preventDefault();
                }}
                size={"large"}
                intent="primary"
                className="locationButton"
                text="From my location">
            </Button> : <></>
        }
    </>;
}