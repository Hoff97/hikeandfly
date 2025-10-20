from collections import defaultdict
import json
import polars as pl


def find_geometry_center(geometry, centroid=None):
    if centroid is not None:
        if len(centroid) != 2:
            raise ValueError("Centroid must be a list of two elements")
        return centroid
    if geometry["type"] == "LineString":
        coordinates = geometry["coordinates"]
        n = len(coordinates)
        if n % 2 == 1:
            return coordinates[n // 2]
        else:
            mid1 = coordinates[n // 2 - 1]
            mid2 = coordinates[n // 2]
            return [(mid1[0] + mid2[0]) / 2, (mid1[1] + mid2[1]) / 2]
    elif geometry["type"] == "Point":
        return geometry["coordinates"]
    elif geometry["type"] in ("Polygon", "MultiLineString"):
        result = [0, 0]
        l = len(geometry["coordinates"])
        for coord in geometry["coordinates"][0]:
            result[0] += coord[0] / l
            result[1] += coord[1] / l
        return result
    elif geometry["type"] in ("MultiPolygon"):
        result = [0, 0]
        l = len(geometry["coordinates"])
        for polygon in geometry["coordinates"][0]:
            for coord in polygon:
                result[0] += coord[0] / l
                result[1] += coord[1] / l
        return result
    print(geometry)
    raise ValueError(f"Unsupported geometry type: {geometry['type']}")


IGNORED_UNNAMED_CATEGORIES = [
    "osm.waterway.weir",
    "osm.water.reservoir",
    "osm.landuse.*",
    "osm.highway.*",
    "osm.leisure.park",
    "osm.waterway.boatyard",
    "osm.natural.grassland",
    "osm.place.square",
    "osm.place.locality",
    "osm.place.house",
    "osm.building.*",
    "osm.amenity.*",
]

IGNORED_CATEGORIES = [
    "osm.building.yes",
    "osm.place.house",
    "osm.building.house",
    "osm.building.apartments",
    "osm.building.residential",
    "osm.highway.path",
    "osm.amenity.doctors",
    "osm.information.board",
    "osm.shop.*",
    "osm.office.company",
    "osm.boundary.*",
    "osm.aerialway.*",
    "osm.lock.*",
    "osm.highway.*",
    "osm.building.terrace",
]

USED_NAMES = [
    "name",
    "name:de",
    "name:old",
    "name:en",
    "name:alt",
    "name:it",
    "name:fr",
    "name:reg",
]
IGNORED_NAMES = ["name:loc", "name:ko", "name:cs"]

NO_ADDRESS_NEEDED = set(
    ["osm.place.state", "osm.place.archipelago", "osm.natural.bay", "osm.natural.cape"]
)

COUNTRY_CODE_TO_NAME = {
    "fr": "France",
    "mc": "Monacco",
    "at": "Austria",
    "de": "Germany",
    "lu": "Luxemburg",
    "ch": "Switzerland",
    "li": "Liechtenstein",
    "it": "Italy",
    "si": "Slovenia",
}


def preprocess_data():
    i = 0

    files = [
        ("photon-dump-france-monacco-0.7-latest.jsonl", "france-monacco", "France"),
        ("photon-dump-austria-0.7-latest.jsonl", "austria", "Austria"),
        ("photon-dump-germany-0.7-latest.jsonl", "germany", "Germany"),
        ("photon-dump-luxemburg-0.7-latest.jsonl", "luxemburg", "Luxemburg"),
        (
            "photon-dump-switzerland-liechtenstein-0.7-latest.jsonl",
            "switzerland-liechtenstein",
            "Switzerland",
        ),
        ("photon-dump-italy-0.7-latest.jsonl", "italy", "Italy"),
        ("photon-dump-slovenia-0.7-latest.jsonl", "slovenia", "Slovenia"),
    ]

    for f, region, region_name in files:
        result = []
        categories = defaultdict(int)

        print(f"Processing file: {f}")
        file = open(f"data/{f}", "r")
        for line in file:
            i += 1
            if i % 100_000 == 0:
                print(f"   Processed {i} objects")
            object_data = json.loads(line)

            if object_data["type"] in ("NominatimDumpFile", "CountryInfo"):
                continue

            if object_data["type"] == "Place":
                content = object_data["content"][0]

                if any(
                    cat == ignore
                    or (ignore.endswith(".*") and cat.startswith(ignore[:-2]))
                    for cat in content.get("categories", [])
                    for ignore in IGNORED_CATEGORIES
                ):
                    continue

                for x in content.get("categories", []):
                    categories[x] += 1

                if "name" not in content:
                    continue
                elif "geometry" not in content:
                    if any(
                        cat == ignore
                        or (ignore.endswith(".*") and cat.startswith(ignore[:-2]))
                        for cat in content.get("categories", [])
                        for ignore in IGNORED_UNNAMED_CATEGORIES
                    ):
                        continue
                    print(content)
                    raise ValueError("Missing name or geometry in Place object")

                name = ""
                if any(n in content for n in USED_NAMES):
                    for n in USED_NAMES:
                        if n in content["name"]:
                            name = content["name"][n]
                            break
                elif any(n in content["name"] for n in IGNORED_NAMES):
                    continue
                else:
                    print(content)
                    print(content["name"])
                    raise ValueError("No valid name field found in Place object")

                geometry = content["geometry"]
                centroid = content.get("centroid", None)
                center = find_geometry_center(geometry, centroid)

                additional_info = ""
                if "address" in content:
                    if "state:en" in content["address"]:
                        additional_info = content["address"]["state:en"]
                    else:
                        if "country_code" in content:
                            cc = content["country_code"]
                            if cc in COUNTRY_CODE_TO_NAME:
                                additional_info = COUNTRY_CODE_TO_NAME[cc]
                            else:
                                additional_info = region_name
                        else:
                            additional_info = region_name
                else:
                    if "country_code" in content:
                        cc = content["country_code"]
                        if cc in COUNTRY_CODE_TO_NAME:
                            additional_info = COUNTRY_CODE_TO_NAME[cc]
                        else:
                            additional_info = region_name
                    else:
                        additional_info = region_name

                result.append(
                    {
                        "name": name,
                        "center": center,
                        "categories": content.get("categories", []),
                        "additional_info": additional_info,
                    }
                )
            else:
                raise ValueError(f"Unsupported object type: {object_data['type']}")

        c = list(categories.items())
        c.sort(key=lambda x: x[1], reverse=True)
        print(f"Found categories: {c}")
        categories_contained_once = [k for k, v in categories.items() if v == 1]

        second_level = defaultdict(int)
        for name, count in categories.items():
            splitted = name.split(".")
            second_level[".".join(splitted[:2])] += count
        sl = list(second_level.items())
        sl.sort(key=lambda x: x[1], reverse=True)
        print(f"Found categories: {sl}")

        df = pl.DataFrame(result)
        df = df.filter(
            pl.col("categories")
            .list.set_intersection(categories_contained_once)
            .list.len()
            == 0
        )
        print(df)
        df.write_ndjson(f"data/augmented_search_data_{region}.jsonl")
        df = df.drop("categories")
        df.write_ndjson(f"data/search_data_{region}.jsonl")

        print(f"Wrote {len(df)} entries to data/search_data_{region}.jsonl")


if __name__ == "__main__":
    preprocess_data()
