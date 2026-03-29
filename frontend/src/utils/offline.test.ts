import { LatLngBounds } from "leaflet";
import { describe, expect, it } from "vitest";
import { buildTileUrlsForBounds, buildTileZoomLevels } from "./offline";

describe("offline tile coverage", () => {
  it("downloads the current zoom band around the viewport", () => {
    expect(buildTileZoomLevels(13)).toEqual([11, 13, 15]);
  });

  it("includes every intersecting tile for a viewport", () => {
    const bounds = new LatLngBounds([-1, -1], [1, 1]);
    const urls = buildTileUrlsForBounds(bounds, [2], "OpenTopoMap Proxy");
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
});
