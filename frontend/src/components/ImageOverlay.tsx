import { ReactCanvasOverlay } from "../leaflet/ReactCanvasOverlay";
import { ImageState } from "../utils/types";

import {
    ImageOverlay,
    LayersControl,
} from "react-leaflet";

export function ImageOverlays({ state }: { state: ImageState }) {
    return (
        <>
            <LayersControl.Overlay name="Height above ground" checked>
                <ImageOverlay
                    url={state.heightAGLUrl.toString()}
                    bounds={state.bounds}
                    opacity={0.5}
                    className="gridImage"
                ></ImageOverlay>
                <ReactCanvasOverlay bounds={state.bounds} elementId="canvas-overlay" opacity={0.4} key={state.heightAGLUrl.toString()} />
            </LayersControl.Overlay>
            <LayersControl.Overlay name="Height above see level">
                <ImageOverlay
                    url={state.heightUrl.toString()}
                    bounds={state.bounds}
                    opacity={0.5}
                    className="gridImage"
                ></ImageOverlay>
            </LayersControl.Overlay>
        </>
    );
}