import { LatLngBounds } from "leaflet";
import { describe, expect, it } from "vitest";
import { buildTileUrlsForBounds, buildTileZoomLevels } from "./offline";

describe("offline tile coverage", () => {
  it("always includes zoom 13 and 15", () => {
    // low zoom — appends 13 and 15 beyond the ±2 band
    const low = buildTileZoomLevels(8);
    expect(low).toContain(13);
    expect(low).toContain(15);
    expect(low).toEqual([6, 8, 10, 13, 15]);
  });

  it("deduplicates when current zoom is already 13 or 15", () => {
    expect(buildTileZoomLevels(13)).toEqual([11, 13, 15]);
    expect(buildTileZoomLevels(15)).toEqual([13, 15, 17]);
  });

  it("does not include sub-zero or above-18 zooms", () => {
    const zooms = buildTileZoomLevels(1);
    expect(zooms.every((z) => z >= 0 && z <= 18)).toBe(true);
  });

  it("includes every intersecting tile for a viewport", () => {
    const bounds = new LatLngBounds([-1, -1], [1, 1]);
    const urls = buildTileUrlsForBounds(bounds, [2]);
    const tileSuffixes = urls.map((url) => url.split("/opentopomap/")[1]);

    expect(urls).toHaveLength(4);
    expect(tileSuffixes.some((suffix) => suffix.endsWith("/2/1/1.png"))).toBe(
      true,
    );
    expect(tileSuffixes.some((suffix) => suffix.endsWith("/2/1/2.png"))).toBe(
      true,
    );
    expect(tileSuffixes.some((suffix) => suffix.endsWith("/2/2/1.png"))).toBe(
      true,
    );
    expect(tileSuffixes.some((suffix) => suffix.endsWith("/2/2/2.png"))).toBe(
      true,
    );
  });

  it("generates proxy URLs for all selected layers", () => {
    const bounds = new LatLngBounds([-1, -1], [1, 1]);
    const urls = buildTileUrlsForBounds(
      bounds,
      [2],
      ["OpenTopoMap Proxy", "OpenStreetMap", "Satellite"],
    );

    expect(urls.some((url) => url.includes("/opentopomap/"))).toBe(true);
    expect(urls.some((url) => url.includes("/openstreetmap/"))).toBe(true);
    expect(urls.some((url) => url.includes("/satellite/"))).toBe(true);
  });
});
