import { EntityTitle, Intent, MenuItem, Spinner, SpinnerSize } from "@blueprintjs/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Suggest } from "@blueprintjs/select";
import { useMap } from "react-leaflet";

export interface SearchResult {
    name: string;
    center: number[];
    additional_info?: string;
    id?: string;
}

export function SearchCard() {
    let [searchValue, setSearchValue] = useState("");
    let [items, setItems] = useState<SearchResult[]>([]);
    let [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);
    let [searching, setSearching] = useState<boolean>(false);

    const ws = useRef<WebSocket | null>(null);

    const map = useMap();

    useEffect(() => {
        const url = new URL(window.location.origin + "/search_ws/ws");
        ws.current = new WebSocket(
            `${window.location.protocol === "https:" ? "wss" : "ws"}://${url.host}/search_ws/ws`
        );

        ws.current.onmessage = (event) => {
            let body: SearchResult[] = JSON.parse(event.data) as SearchResult[]

            let result = [];
            let existingIds = new Set<string>();

            for (let item of body) {
                item.id = item.name + "_" + item.center[0] + "_" + item.center[1];
                if (existingIds.has(item.id)) {
                    continue;
                }
                existingIds.add(item.id);
                result.push(item);
            }

            setItems(result);
            if (result.length > 0) {
                setSelectedItem(result[0]);
            }
            setSearching(false);
        };

        return () => {
            ws.current?.close();
        };
    }, []);

    let handleFilterChange = useCallback(async (e: string, event: React.ChangeEvent<HTMLInputElement> | undefined) => {
        if (e.length < 3) {
            return;
        }
        setSearchValue(e);

        await new Promise(resolve => setTimeout(resolve, 50));
        if (event === undefined || e !== event?.target.value) {
            return;
        }

        setSearching(true);
        ws.current?.send(e);
    }, [ws]);

    let renderItem = (item: SearchResult) => {
        return (
            <MenuItem
                key={item.id}
                text={item.name}
                label={item.additional_info}
                active={selectedItem?.id === item.id}
                onClick={() => goToItem(item)}
            />
        );
    }

    let goToItem = (item: SearchResult) => {
        setSearchValue("");
        setItems([]);
        setSelectedItem(null);
        map.flyTo([item.center[1], item.center[0]], 16);
    }

    return (
        <div className="search-card">
            <Suggest
                closeOnSelect={true}
                onQueryChange={(q, e) => handleFilterChange(q, e)}
                query={searchValue}
                resetOnQuery={true}
                items={items}
                itemRenderer={renderItem}
                fill={true}
                openOnKeyDown={true}
                onActiveItemChange={(e, _) => setSelectedItem(e)}
                onItemSelect={(e) => goToItem(e)}
                inputValueRenderer={(e) => e.name}
                inputProps={
                    {
                        rightElement: searching ? <Spinner
                            intent={Intent.PRIMARY}
                            size={SpinnerSize.SMALL}
                        /> : <></>,
                    }
                }
            />
        </div>
    );
}