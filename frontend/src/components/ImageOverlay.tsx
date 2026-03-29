import { ReactCanvasOverlay } from "../leaflet/ReactCanvasOverlay";
import { ImageState } from "../utils/types";
import { LayersControl } from "react-leaflet";

export function ImageOverlays({ state }: { state: ImageState }) {
    return (
        <>
            <LayersControl.Overlay name="Height above ground" checked>
                <div>
                    <ReactCanvasOverlay bounds={state.bounds} elementId="canvas-image" opacity={0.5} />
                    <ReactCanvasOverlay bounds={state.bounds} elementId="canvas-overlay" opacity={0.4} />
                </div>
            </LayersControl.Overlay>
        </>
    );
}