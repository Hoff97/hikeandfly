import { InputGroup } from "@blueprintjs/core";
import { useState } from "react";
import { searchLocation } from "../utils/search";

export function SearchCard() {
    let [searchValue, setSearchValue] = useState("");

    let handleFilterChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        // Handle the filter change logic here
        console.log("Filter changed to:", value);
        setSearchValue(value);

        await searchLocation(value);
    }

    //rightElement={filterValue && <Spinner size={IconSize.STANDARD} />}

    return (
        <div className="search-card">
            <InputGroup
                asyncControl={true}
                onChange={handleFilterChange}
                placeholder="Filter histogram..."
                value={searchValue}
            />
        </div>
    );
}