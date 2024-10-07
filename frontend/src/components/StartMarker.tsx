import { Circle, CircleMarker, useMap } from "react-leaflet";
import { ConeSearchResponse, Settings } from "../utils/types";
import { ixToLatLon } from "../utils/utils";

interface StartMarkerProps {
    response: ConeSearchResponse;
    settings: Settings;
}

export function StartMarker({ response, settings }: StartMarkerProps) {
    const map = useMap();

    const startOptions = {
        color: "black",
        weight: 1.0,
        opacity: 1.0,
        fillColor: "white",
        fillOpacity: 1.0,
    };

    const safety_margin_options = {
        color: "black",
        weight: 1.0,
        opacity: 1.0,
        fillColor: "white",
        fillOpacity: 0.0,
    };

    const start_location = ixToLatLon(response.start_ix, response);

    return (
        <>
            {settings.safetyMargin > 0 && settings.startDistance > 0 ? (
                <Circle
                    center={start_location}
                    radius={settings.startDistance}
                    pathOptions={safety_margin_options}
                ></Circle >
            ) : <></>
            }
            <CircleMarker
                center={start_location}
                radius={(map.getZoom() / 17) * 10}
                pathOptions={startOptions}
            ></CircleMarker>
        </>
    );
}