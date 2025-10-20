import polars as pl

regions = [
    "austria",
    "germany",
    "luxemburg",
    "switzerland-liechtenstein",
    "france-monacco",
    "italy",
    "slovenia",
]


def main():
    for region in regions:
        df = pl.read_ndjson(f"data/augmented_search_data_{region}.jsonl")
        df = df.with_columns(pl.col("categories").list.first().alias("category")).drop(
            "categories"
        )

        grouped = (
            df.group_by("category")
            .agg(pl.len().alias("category_count"))
            .sort("category_count", descending=True)
        )
        grouped_by_second_level = (
            df.with_columns(
                pl.col("category")
                .str.split(".")
                .list.slice(0, 2)
                .list.join(".")
                .alias("second_level")
            )
            .group_by("second_level")
            .agg(pl.count().alias("count"))
            .sort("count", descending=True)
        )

        ignored_categories = [
            "osm.historic.boundary_stone",
            "osm.waterway.milestone",
            "osm.railway.border",
            "osm.information.map",
            "osm.information.guidepost",
        ]
        ignored_second_level_categories = [
            "osm.boundary",
            "osm.amenity",
            "osm.leisure",
            "osm.tourism",
            "osm.landuse",
            "osm.office",
            "osm.craft",
        ]

        df = df.join(grouped, on="category", how="left")
        df = df.filter(pl.col("category_count") > 10).drop("category_count")
        df = df.filter(~pl.col("category").is_in(ignored_categories))
        df = df.with_columns(
            pl.col("category")
            .str.split(".")
            .list.slice(0, 2)
            .list.join(".")
            .alias("second_level_category")
        )
        df = df.filter(
            ~pl.col("second_level_category").is_in(ignored_second_level_categories)
        )

        name_counts = (
            df.group_by("name")
            .agg(pl.len().alias("name_counts"))
            .sort("name_counts", descending=True)
        )
        df = df.join(name_counts, on="name", how="left")
        df = df.filter(pl.col("name_counts") < 5).drop("name_counts")

        subgroups_to_keep = {
            "osm.building": [
                "cabin",
                "service",
                "public",
                "hut",
                "dormitory",
                "roof",
                "shed",
                "ruins",
            ],
            "osm.place": [
                "locality",
                "hamlet",
                "village",
                "suburb",
                "neighbourhood",
                "town",
                "quarter",
                "municipality",
                "region",
                "county",
                "island",
                "city",
            ],
            "osm.historic": [
                "castle",
                "building",
                "ruins",
                "church",
                "monument",
                "tower",
                "house",
                "razed:mineshaft",
            ],
            "osm.waterway": [
                "stream",
                "canal",
                "weir",
                "river",
                "waterfall",
                "dam",
                "rapids",
            ],
        }

        df = pl.concat(
            [
                df.filter(
                    ~pl.col("second_level_category").is_in(subgroups_to_keep.keys())
                ),
                *[
                    df.filter(
                        (pl.col("second_level_category") == second_level)
                        & pl.col("category").str.split(".").list.last().is_in(suffixes)
                    )
                    for second_level, suffixes in subgroups_to_keep.items()
                ],
            ]
        )

        df = df.select(["name", "center", "additional_info"])

        df.write_ndjson(f"data/search_data_{region}.jsonl")


if __name__ == "__main__":
    main()
