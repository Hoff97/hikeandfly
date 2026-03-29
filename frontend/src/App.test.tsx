import { describe, expect, it } from "vitest";
import { getSearchParams } from "./utils/utils";

describe("getSearchParams", () => {
  it("serializes location and settings", () => {
    const params = getSearchParams({ lat: 47.1, lng: 11.5 } as any, {
      startHeight: 1234,
      additionalHeight: 20,
      glideNumber: 8,
      gridSize: 50,
      minGridSize: 30,
      trimSpeed: 38,
      windSpeed: 10,
      windDirection: 120,
      safetyMargin: 15,
      startDistance: 50,
      abortController: undefined,
      doLiveHoverSearch: false,
      fastInternet: true,
    });

    expect(params.get("lat")).toBe("47.1");
    expect(params.get("lon")).toBe("11.5");
    expect(params.get("start_height")).toBe("1234");
    expect(params.get("grid_size")).toBeNull();
    expect(params.get("cell_size")).toBe("50");
  });
});
