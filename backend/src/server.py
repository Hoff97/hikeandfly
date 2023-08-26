from flask import Flask, request
from src.data_analysis.height_data import ARC_SECOND_IN_DEGREE, meter_in_arcseconds

from src.data_analysis.search import search_from_point

app = Flask(__name__)

@app.route("/")
def hello_world():
    return "Hike & Fly tool"

@app.route("/flight_cone")
def get_flight_cone():
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    cell_size = request.args.get('cell_size', default=200.0, type=float)
    glide_number = request.args.get('glide_number', default=8.0, type=float)
    additional_height = request.args.get('additional_height', default=10.0, type=float)

    state, grid = search_from_point(lat, lon, cell_size, 1/glide_number, additional_height)

    lats, lons = grid.get_coordinates_for_indices()
    resolution = grid.get_angular_resolution()


    response = {
        "nodes": [],
        "cell_size": grid.cell_size,
        "angular_resolution": resolution
    }

    for grid_ix, node in state.explored.items():
        if node.reachable:
            response["nodes"].append({
                "index": grid_ix,
                "height": node.height,
                "distance": node.distance,
                "lat": lats[grid_ix[0]],
                "lon": lons[grid_ix[1]],
                "ref": node.ref,
                "size": grid.cell_size,
                "agl": node.height - grid.heights[grid_ix[0], grid_ix[1]],
                "gl": grid.heights[grid_ix[0], grid_ix[1]]
            })

    return response