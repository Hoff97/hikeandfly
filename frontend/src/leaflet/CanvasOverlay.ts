import { DomUtil, LatLngBoundsLiteral, Layer, Util } from "leaflet";
import { LatLngBounds } from "leaflet";
import { Bounds } from "leaflet";
import { Map as LMap } from "leaflet";

export class CanvasOverlay extends Layer {
  _bounds?: LatLngBounds;
  _canvas?: HTMLCanvasElement;

  initialize(bounds: LatLngBoundsLiteral, options: any = {}) {
    this._bounds = new LatLngBounds(bounds);

    Util.setOptions(this, options);
  }

  onAdd(map: LMap) {
    // @ts-ignore
    if (!this._bounds && this.options.bounds) {
      this._bounds =
        // @ts-ignore
        this.options.bounds instanceof LatLngBounds
          ? // @ts-ignore
            this.options.bounds
          : // @ts-ignore
            new LatLngBounds(this.options.bounds);
    }
    if (!this._canvas) {
      this._initCanvas();
      // @ts-ignore
      if (this.options.opacity < 1) {
        this._updateOpacity();
      }
    }

    // @ts-ignore
    this.getPane()?.appendChild(this._canvas);
    this._reset();
    return this;
  }

  onRemove(map: LMap) {
    this._canvas?.remove();
    return this;
  }

  setOpacity(opacity: number) {
    // @ts-ignore
    this.options.opacity = opacity;

    if (this._canvas) {
      this._updateOpacity();
    }
    return this;
  }

  setStyle(styleOpts: { opacity?: number }) {
    if (styleOpts.opacity) {
      this.setOpacity(styleOpts.opacity);
    }
    return this;
  }

  _updateOpacity() {
    // @ts-ignore
    this._canvas.style.opacity = this.options.opacity;
  }

  // @method bringToFront(): this
  // Brings the layer to the top of all overlays.
  bringToFront() {
    if (this._map) {
      // @ts-ignore
      DomUtil.toFront(this._canvas);
    }
    return this;
  }

  // @method bringToBack(): this
  // Brings the layer to the bottom of all overlays.
  bringToBack() {
    if (this._map) {
      // @ts-ignore
      DomUtil.toBack(this._canvas);
    }
    return this;
  }

  // @method setBounds(bounds: LatLngBounds): this
  // Update the bounds that this ImageOverlay covers
  setBounds(bounds: LatLngBounds | LatLngBoundsLiteral) {
    this._bounds =
      bounds instanceof LatLngBounds ? bounds : new LatLngBounds(bounds);

    if (this._map) {
      this._reset();
    }
    return this;
  }

  getEvents() {
    const events = {
      zoom: this._reset,
      viewreset: this._reset,
    };

    return events;
  }

  // @method setZIndex(value: Number): this
  // Changes the [zIndex](#imageoverlay-zindex) of the image overlay.
  setZIndex(value: number) {
    // @ts-ignore
    this.options.zIndex = value;
    this._updateZIndex();
    return this;
  }

  // @method getBounds(): LatLngBounds
  // Get the bounds that this ImageOverlay covers
  getBounds() {
    return this._bounds;
  }

  // @method getElement(): HTMLElement
  // Returns the instance of [`HTMLImageElement`](https://developer.mozilla.org/docs/Web/API/HTMLImageElement)
  // used by this overlay.
  getElement() {
    return this._canvas;
  }

  _initCanvas() {
    const canvas = DomUtil.create("canvas");

    canvas.classList.add("leaflet-canvas-layer");
    canvas.classList.add("leaflet-zoom-animated");
    // @ts-ignore
    if (this.options.elementId) {
      // @ts-ignore
      canvas.id = this.options.elementId;
    }

    canvas.onselectstart = Util.falseFn;
    canvas.onpointermove = Util.falseFn;

    this._canvas = canvas;

    // @ts-ignore
    if (this.options.zIndex) {
      this._updateZIndex();
    }
  }

  _animateZoom(e: any) {
    const scale = this._map.getZoomScale(e.zoom);
    // @ts-ignore
    let offset = this._map._latLngBoundsToNewLayerBounds(
      this._bounds,
      e.zoom,
      e.center
    ).min;

    // @ts-ignore
    DomUtil.setTransform(this._canvas, offset, scale);
  }

  _reset() {
    const canvas = this._canvas;
    let bnd = this._bounds;
    if (!bnd) {
      return;
    }
    let bounds = new Bounds(
      this._map.latLngToLayerPoint(bnd.getNorthWest()),
      this._map.latLngToLayerPoint(bnd.getSouthEast())
    );
    let size = bounds.getSize();

    // @ts-ignore
    DomUtil.setPosition(canvas, bounds.min);

    // @ts-ignore
    canvas.style.width = `${size.x}px`;
    // @ts-ignore
    canvas.style.height = `${size.y}px`;
  }

  _updateZIndex() {
    if (
      this._canvas &&
      // @ts-ignore
      this.options.zIndex !== undefined &&
      // @ts-ignore
      this.options.zIndex !== null
    ) {
      // @ts-ignore
      this._canvas.style.zIndex = this.options.zIndex;
    }
  }

  getCenter() {
    // @ts-ignore
    return this._bounds.getCenter();
  }
}
