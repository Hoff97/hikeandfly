from functools import lru_cache
import logging
import os
import math
from typing import Final, NamedTuple
import numpy as np

from scipy import ndimage

_logger = logging.getLogger(__name__)

@lru_cache(maxsize=10)
def load_hgt(latitude: int, longitude: int) -> np.ndarray:
    # TODO: S & W!
    assert latitude >= 0
    assert longitude >= 0
    file_name = f"./data/N{latitude}E{longitude:03d}.hgt"

    _logger.info("Loading file %s", file_name)

    siz = os.path.getsize(file_name)
    dim = int(math.sqrt(siz / 2))

    assert dim * dim * 2 == siz, "Invalid file size"

    return np.fromfile(file_name, np.dtype(">i2"), dim * dim).reshape((dim, dim))


ANGLE_TO_RADIANS: Final = math.pi / 180
ARC_SECOND_IN_M_EQUATOR: Final = 1852 / 60
ARC_SECOND_IN_DEGREE: Final = 1 / (60 * 60)


def arcsecond_in_meters(latitude: float) -> float:
    return math.cos(latitude * ANGLE_TO_RADIANS) * ARC_SECOND_IN_M_EQUATOR


def meter_in_arcseconds(latitude: float) -> float:
    return 1 / arcsecond_in_meters(latitude)


class HeightGrid(NamedTuple):
    heights: np.ndarray
    cell_size: float
    latitudes: tuple[float, float]
    longitudes: tuple[float, float]

    def downsample(self, factor: float):
        return HeightGrid(
            ndimage.interpolation.zoom(self.heights, factor),
            self.cell_size / factor,
            self.latitudes,
            self.longitudes,
        )

    def get_angular_resolution(self):
        return (
            (self.latitudes[1]-self.latitudes[0])/self.heights.shape[0],
            (self.longitudes[1]-self.longitudes[0])/self.heights.shape[1]
        )

    def get_coordinates_for_indices(self):
        lats = np.linspace(
            self.latitudes[0], self.latitudes[1], num=self.heights.shape[0]
        )
        lons = np.linspace(
            self.longitudes[0], self.longitudes[1], num=self.heights.shape[1]
        )

        return lats, lons

def get_height_at_point(latitude: float, longitude: float):
    lat_i = math.floor(latitude)
    lon_i = math.floor(longitude)

    data = load_hgt(lat_i, lon_i)[::-1]

    degree_per_lat_ix = 1 / data.shape[0]
    degree_per_lon_ix = 1 / data.shape[1]

    lat_ix = math.floor((latitude - lat_i) / degree_per_lat_ix)
    lon_ix = math.floor((longitude - lon_i) / degree_per_lon_ix)

    return data[lat_ix, lon_ix]

def get_height_data_around_point(
    latitude: float, longitude: float, distance_m: float = 15000
) -> HeightGrid:
    distance_degree_lat = distance_m * ARC_SECOND_IN_DEGREE / ARC_SECOND_IN_M_EQUATOR
    distance_degree_lon = meter_in_arcseconds(latitude) * distance_m * ARC_SECOND_IN_DEGREE

    lower_latitude = latitude - distance_degree_lat
    upper_latitude = latitude + distance_degree_lat

    lower_longitude = longitude - distance_degree_lon
    upper_longitude = longitude + distance_degree_lon

    lower_lat_i = math.floor(lower_latitude)
    upper_lat_i = math.floor(upper_latitude)

    lower_lon_i = math.floor(lower_longitude)
    upper_lon_i = math.floor(upper_longitude)

    files = [
        [load_hgt(lat, lon) for lon in range(lower_lon_i, upper_lon_i + 1)]
        for lat in range(lower_lat_i, upper_lat_i + 1)
    ]
    files = files[::-1]

    data = np.concatenate([np.concatenate(xs, axis=1) for xs in files], axis=0)
    # Increasing X axis should mean increasing latitude
    data = data[::-1]

    degree_per_lat_ix = ((upper_lat_i + 1) - lower_lat_i) / data.shape[0]
    degree_per_lon_ix = ((upper_lon_i + 1) - lower_lon_i) / data.shape[1]

    lower_lat_ix = math.floor((lower_latitude - lower_lat_i) / degree_per_lat_ix)
    upper_lat_ix = math.floor((upper_latitude - lower_lat_i) / degree_per_lat_ix)

    lower_lon_ix = math.floor((lower_longitude - lower_lon_i) / degree_per_lon_ix)
    upper_lon_ix = math.floor((upper_longitude - lower_lon_i) / degree_per_lon_ix)

    result_data = data[lower_lat_ix:upper_lat_ix, lower_lon_ix:upper_lon_ix]

    # TODO: Better outlier handling here
    result_data[result_data < -1000] = 0
    result_data = result_data.astype(float)

    lat_resolution_degree = (upper_latitude-lower_latitude)/result_data.shape[0]
    lon_resolution_degree = (upper_longitude-lower_longitude)/result_data.shape[1]

    lat_resolution_meters = lat_resolution_degree / ARC_SECOND_IN_DEGREE * ARC_SECOND_IN_M_EQUATOR
    lon_resolution_meters = lon_resolution_degree / ARC_SECOND_IN_DEGREE * arcsecond_in_meters(latitude)

    max_resolution = max(lat_resolution_meters, lon_resolution_meters)

    result_data = ndimage.interpolation.zoom(result_data, (lat_resolution_meters/max_resolution, lon_resolution_meters/max_resolution))

    return HeightGrid(
        result_data,
        max_resolution,
        (lower_latitude, upper_latitude),
        (lower_longitude, upper_longitude),
    )
