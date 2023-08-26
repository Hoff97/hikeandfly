from io import BytesIO
from flask import Flask, request, send_file
from matplotlib import pyplot as plt
import numpy as np
from src.data_analysis.height_data import ARC_SECOND_IN_DEGREE, meter_in_arcseconds
from PIL import Image
from src.data_analysis.search import search_from_point
from skimage.io import imsave

app = Flask(__name__)


@app.route("/")
def hello_world():
    return "Hike & Fly tool"


@app.route("/flight_cone")
def get_flight_cone():
    lat = request.args.get("lat", type=float)
    lon = request.args.get("lon", type=float)
    cell_size = request.args.get("cell_size", default=200.0, type=float)
    glide_number = request.args.get("glide_number", default=8.0, type=float)
    additional_height = request.args.get("additional_height", default=10.0, type=float)

    state, grid = search_from_point(
        lat, lon, cell_size, 1 / glide_number, additional_height
    )

    lats, lons = grid.get_coordinates_for_indices()
    resolution = grid.get_angular_resolution()

    response = {
        "nodes": [],
        "cell_size": grid.cell_size,
        "angular_resolution": resolution,
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


def lerp(a: np.ndarray, b: np.ndarray, m: float):
    return (b - a) * np.clip(m, 0, 1) + a


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


@app.route("/height_image")
def get_height_image():
    lat = request.args.get("lat", type=float)
    lon = request.args.get("lon", type=float)
    cell_size = request.args.get("cell_size", default=200.0, type=float)
    glide_number = request.args.get("glide_number", default=8.0, type=float)
    additional_height = request.args.get("additional_height", default=10.0, type=float)

    state, grid = search_from_point(
        lat, lon, cell_size, 1 / glide_number, additional_height
    )

    heights = np.zeros_like(grid.heights)
    heights[:] = np.nan

    for (a, b), node in state.explored.items():
        if node.reachable:
            heights[a, b] = node.height
        else:
            heights[a, b] = np.nan

    colors = np.array([[255.0, 0, 0], [180, 190, 0], [0, 150, 255]]) / 255
    fractions = np.array([0, 0.5, 1])

    image = lerpMulti(colors, fractions, (heights - hmin) / (hmax - hmin))
    print(image.shape)

    image = np.transpose(image, (1, 2, 0))
    image = np.floor(image * 255).astype(np.uint8)

    pil_img = Image.fromarray(image)

    img_io = BytesIO()
    pil_img.save(img_io, "png")
    img_io.seek(0)
    return send_file(img_io, mimetype="image/png")

def crop_to_not_nan(arr: np.array):
    not_na = ~np.isnan(arr)

    rows = np.any(not_na, axis=0)
    cols = np.any(not_na, axis=1)

    r_min = np.min(np.arange(arr.shape[1])[rows])
    r_max = np.max(np.arange(arr.shape[1])[rows])

    c_min = np.min(np.arange(arr.shape[0])[cols])
    c_max = np.max(np.arange(arr.shape[0])[cols])

    return arr[c_min:c_max+1, r_min:r_max+1]

@app.route("/contour_image")
def get_contour_image():
    lat = request.args.get("lat", type=float)
    lon = request.args.get("lon", type=float)
    cell_size = request.args.get("cell_size", default=200.0, type=float)
    glide_number = request.args.get("glide_number", default=8.0, type=float)
    additional_height = request.args.get("additional_height", default=10.0, type=float)

    state, grid = search_from_point(
        lat, lon, cell_size, 1 / glide_number, additional_height
    )

    heights = np.zeros_like(grid.heights)
    heights[:] = np.nan

    for (a, b), node in state.explored.items():
        if node.reachable:
            heights[a, b] = node.height
        else:
            heights[a, b] = np.nan

    agl = heights - grid.heights
    agl = crop_to_not_nan(agl)

    X, Y = np.indices(agl.T.shape)
    fig, ax = plt.subplots(figsize=(20, 20))
    ax.contour(X, Y, agl.T, levels=30)

    img_io = BytesIO()
    plt.savefig(img_io, format="png")
    img_io.seek(0)
    return send_file(img_io, mimetype="image/png")


@app.route("/agl_image")
def get_agl_image():
    lat = request.args.get("lat", type=float)
    lon = request.args.get("lon", type=float)
    cell_size = request.args.get("cell_size", default=200.0, type=float)
    glide_number = request.args.get("glide_number", default=8.0, type=float)
    additional_height = request.args.get("additional_height", default=10.0, type=float)

    state, grid = search_from_point(
        lat, lon, cell_size, 1 / glide_number, additional_height
    )

    heights = np.zeros_like(grid.heights)
    heights[:] = np.nan

    for (a, b), node in state.explored.items():
        if node.reachable:
            heights[a, b] = node.height
        else:
            heights[a, b] = np.nan

    agl = heights - grid.heights
    agl = agl[::-1]

    colors = np.array([[255.0, 0, 0], [180, 190, 0], [0, 150, 255]]) / 255
    fractions = np.array([0, 0.5, 1])

    image = lerpMulti(colors, fractions, agl / 1200)
    print(image.shape)

    image = np.transpose(image, (1, 2, 0))
    image = np.floor(image * 255).astype(np.uint8)

    pil_img = Image.fromarray(image)

    img_io = BytesIO()
    pil_img.save(img_io, "png")
    img_io.seek(0)
    return send_file(img_io, mimetype="image/png")
