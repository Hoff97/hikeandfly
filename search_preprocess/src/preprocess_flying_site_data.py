from xml.etree import ElementTree as ET
import polars as pl

name_parts_to_remove = [
    "Startplatz",
    "Landeplatz",
    "Flugplatz",
    "SP",
    "LP",
    "Start",
    "Landung",
    "Hauptlandeplatz",
]


def process_name(name: str) -> str:
    # Remove name_parts_to_remove including when pre/suffixed by spaces, comma, hyphens, suffixed by numbers
    for part in name_parts_to_remove:
        for i in range(10):
            name = name.replace(f"{part} {i}", "")
            name = name.replace(f"{part} ({i})", "")
        name = name.replace(f", {part}", "")
        name = name.replace(f"{part},", "")
        name = name.replace(f"-{part}", "")
        name = name.replace(f"{part}-", "")
        name = name.replace(f" - {part}", "")
        name = name.replace(f"{part} - ", "")
        name = name.replace(f"({part})", "")
        name = name.replace(f" {part}", "")
        name = name.replace(f"{part} ", "")
        name = name.replace(part, "")

    return name.strip()


def main():
    tree = ET.parse("data/dhvgelaende_dhvxml_alle.xml")
    root = tree.getroot()

    flying_sites = root.find("FlyingSites")

    search_results = []

    for flying_site in flying_sites.findall("FlyingSite"):
        locations = flying_site.findall("Location")
        if locations is None:
            continue
        for location in locations:
            if location is None:
                continue
            loc_name = location.find("LocationName").text
            loc_name = process_name(loc_name)
            loc_type = location.find("LocationType").text
            coordinates = location.find("Coordinates").text
            if loc_type == "3":
                continue  # Skip towing sites
            print(
                f"  Location: {loc_name}, Type: {loc_type}, Coordinates: {coordinates}"
            )

            coordinates = list(map(float, coordinates.split(",")))

            search_results.append(
                {
                    "name": loc_name,
                    "center": coordinates,
                    "additional_info": "Start" if loc_type == "1" else "Landing",
                }
            )

    df = pl.DataFrame(search_results)
    print(f"Exporting {len(search_results)} flying sites")
    df.write_ndjson("data/search_data_flying_sites.jsonl")


if __name__ == "__main__":
    main()
