import {
  createElementObject,
  createLayerComponent,
  extendContext,
  type MediaOverlayProps,
  updateMediaOverlay,
} from "@react-leaflet/core";
import { LatLngBounds } from "leaflet";
import type { ReactNode } from "react";
import { CanvasOverlay } from "./CanvasOverlay";

export interface CanvasOverlayProps extends MediaOverlayProps {
  children?: ReactNode;
  elementId?: string;
}
export const ReactCanvasOverlay = createLayerComponent<
  CanvasOverlay,
  CanvasOverlayProps
>(
  function createCanvasOverlay(options, ctx) {
    // @ts-ignore
    const overlay = new CanvasOverlay(options.bounds, options);
    return createElementObject(
      overlay,
      extendContext(ctx, { overlayContainer: overlay })
    );
  },
  function updateCanvasOverlay(overlay, props, prevProps) {
    // @ts-ignore
    updateMediaOverlay(overlay, props, prevProps);
    if (props.bounds !== prevProps.bounds) {
      const bounds =
        props.bounds instanceof LatLngBounds
          ? props.bounds
          : new LatLngBounds(props.bounds);
      overlay.setBounds(bounds);
    }
  }
);
