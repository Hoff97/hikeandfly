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
                {state.heightAGLUrl !== undefined ? (
                    <ImageOverlay
                        url={state.heightAGLUrl.toString()}
                        bounds={state.bounds}
                        opacity={0.5}
                        className="gridImage"
                    ></ImageOverlay>) : (<ReactCanvasOverlay bounds={state.bounds} elementId="canvas-image" opacity={0.5} />)}
                <ReactCanvasOverlay bounds={state.bounds} elementId="canvas-overlay" opacity={0.4} />
            </LayersControl.Overlay>
        </>
    );
}