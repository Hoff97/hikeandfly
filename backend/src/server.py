from functools import lru_cache
from io import BytesIO
from flask import Flask, request, send_file
from matplotlib import pyplot as plt
import numpy as np
from PIL import Image
from src.data_analysis.search import search_from_point

app = Flask(__name__)


@app.route("/")
def hello_world():
    return "Hike & Fly tool"


memoized_search = lru_cache(maxsize=128)(search_from_point)


def search_from_request():
    lat = request.args.get("lat", type=float)
    lon = request.args.get("lon", type=float)
    cell_size = request.args.get("cell_size", default=200.0, type=float)
    glide_number = request.args.get("glide_number", default=8.0, type=float)
    additional_height = request.args.get("additional_height", default=10.0, type=float)

    lat = round(lat, 4)
    lon = round(lon, 4)

    state, grid = memoized_search(
        lat, lon, cell_size, 1 / glide_number, additional_height
    )

    heights = np.zeros_like(grid.heights)
    heights[:] = np.nan

    for (a, b), node in state.explored.items():
        if node.reachable:
            heights[a, b] = node.height
        else:
            heights[a, b] = np.nan

    return state, grid, heights


@app.route("/flight_cone")
def get_flight_cone():
    state, grid, _ = search_from_request()

    lats, lons = grid.get_coordinates_for_indices()
    resolution = grid.get_angular_resolution()

    response = {
        "nodes": [],
        "cell_size": grid.cell_size,
        "angular_resolution": resolution,
        "lat": grid.latitudes,
        "lon": grid.longitudes,
        "grid_shape": (grid.heights.shape[0], grid.heights.shape[1]),
    }

    for grid_ix, node in state.explored.items():
        if node.reachable:
            response["nodes"].append(
                {
                    "index": grid_ix,
                    "height": node.height,
                    "distance": node.distance,
                    "lat": lats[grid_ix[0]],
                    "lon": lons[grid_ix[1]],
                    "ref": node.ref,
                    "size": grid.cell_size,
                    "agl": node.height - grid.heights[grid_ix[0], grid_ix[1]],
                    "gl": grid.heights[grid_ix[0], grid_ix[1]],
                }
            )

    return response


def lerpMulti(steps: np.ndarray, fractions: np.ndarray, m: float):
    """
    Steps: (N, C)
    fractions: (N+1)
    m: (X, Y, ...)
    """
    m = np.clip(m, 0, 1)

    c_m = len(m.shape)
    expand_to_m = [None] * c_m

    fracts = (m[None] - fractions[:-1][:, *expand_to_m]) / (
        fractions[1:][:, *expand_to_m] - fractions[:-1][:, *expand_to_m]
    )

    step_diffs = steps[1:] - steps[:-1]

    result = (
        steps[:-1].T[:, :, *expand_to_m] + step_diffs.T[:, :, *expand_to_m] * fracts
    )

    result[:, fracts <= 0] = 0
    result[:, fracts > 1] = 0

    result = result.sum(axis=1)

    return result


def crop_to_not_nan(arr: np.array):
    not_na = ~np.isnan(arr)

    rows = np.any(not_na, axis=0)
    cols = np.any(not_na, axis=1)

    r_min = np.min(np.arange(arr.shape[1])[rows])
    r_max = np.max(np.arange(arr.shape[1])[rows])

    c_min = np.min(np.arange(arr.shape[0])[cols])
    c_max = np.max(np.arange(arr.shape[0])[cols])

    return arr[c_min : c_max + 1, r_min : r_max + 1]


@app.route("/height_image")
def get_height_image():
    _, _, heights = search_from_request()

    heights = heights[::-1]
    heights = crop_to_not_nan(heights)

    hmax = heights[~np.isnan(heights)].max()
    hmin = heights[~np.isnan(heights)].min()

    colors = (
        np.array([[255.0, 0, 0, 255], [180, 190, 0, 255], [0, 150, 255, 255]]) / 255
    )
    fractions = np.array([0, 0.5, 1])

    image = lerpMulti(colors, fractions, (heights - hmin) / (hmax - hmin))

    image = np.transpose(image, (1, 2, 0))
    image = np.floor(image * 255).astype(np.uint8)

    pil_img = Image.fromarray(image)

    img_io = BytesIO()
    pil_img.save(img_io, "png")
    img_io.seek(0)
    return send_file(img_io, mimetype="image/png")


@app.route("/agl_contour_image")
def get_agl_contour_image():
    _, grid, heights = search_from_request()

    agl = heights - grid.heights
    agl = crop_to_not_nan(agl)

    X, Y = np.indices(agl.T.shape)
    fig, ax = plt.subplots(figsize=(20, 20))
    ax.contour(X, Y, agl.T, levels=30)
    ax.axis("off")

    img_io = BytesIO()
    plt.savefig(
        img_io, format="png", bbox_inches="tight", transparent=True, pad_inches=0
    )
    img_io.seek(0)
    return send_file(img_io, mimetype="image/png")


@app.route("/height_contour_image")
def get_height_contour_image():
    _, _, heights = search_from_request()

    heights = crop_to_not_nan(heights)

    X, Y = np.indices(heights.T.shape)
    fig, ax = plt.subplots(figsize=(20, 20))
    ax.contour(X, Y, heights.T, levels=30)
    ax.axis("off")

    img_io = BytesIO()
    plt.savefig(
        img_io, format="png", bbox_inches="tight", transparent=True, pad_inches=0
    )
    img_io.seek(0)
    return send_file(img_io, mimetype="image/png")


@app.route("/agl_image")
def get_agl_image():
    _, grid, heights = search_from_request()

    agl = heights - grid.heights
    agl = agl[::-1]
    agl = crop_to_not_nan(agl)

    colors = (
        np.array([[255.0, 0, 0, 255], [180, 190, 0, 255], [0, 150, 255, 255]]) / 255
    )
    fractions = np.array([0, 0.5, 1])

    image = lerpMulti(colors, fractions, agl / 1200)

    image = np.transpose(image, (1, 2, 0))
    image = np.floor(image * 255).astype(np.uint8)

    pil_img = Image.fromarray(image)

    img_io = BytesIO()
    pil_img.save(img_io, "png")
    img_io.seek(0)
    return send_file(img_io, mimetype="image/png")
