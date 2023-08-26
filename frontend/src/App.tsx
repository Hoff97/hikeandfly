import { useState } from "react";
import "./App.css";
import {
  MapContainer,
  Rectangle,
  TileLayer,
  Tooltip,
  useMapEvents
} from "react-leaflet";
import { LatLng, LatLngBounds } from "leaflet";

interface GridTile {
  index: number[];
  height: number;
  distance: number;
  lat: number;
  lon: number;
  ref: number[];
  agl: number;
  gl: number;
};

interface ConeSearchResponse {
  nodes: GridTile[];
  cell_size: number;
  angular_resolution: number[];
}

interface GridMarkerProps {
  tile: GridTile;
  angular_resolution: number[];
}

function lerp(a: number[], b: number[], m: number) {
  if (m > 1) {
    return b;
  }
  let result = [];
  for (let i = 0; i < a.length; i++) {
    result.push(Math.floor((b[i] - a[i])*m + a[i]));
  }
  return result;
}

function lerpMulti(steps: number[][], fractions: number[], m: number) {
  let j = fractions.length - 2;
  for (let i = 0; i < fractions.length - 1; i++) {
    if (m >= fractions[i] && m < fractions[i+1]) {
      j = i;
      break;
    }
  }

  return lerp(steps[j], steps[j+1], (m - fractions[j])/(fractions[j+1] - fractions[j]));
}

function GridMarker({tile, angular_resolution}: GridMarkerProps) {
  const bounds = new LatLngBounds(
    new LatLng(tile.lat - angular_resolution[0]/2, tile.lon - angular_resolution[1]/2),
    new LatLng(tile.lat + angular_resolution[0]/2, tile.lon + angular_resolution[1]/2)
  );

  const col = lerpMulti([[255,0,0], [180,190,0], [0,150,255]], [0, 0.5, 1], Math.min(tile.agl/1200, 1));
  const color = `rgb(${col[0]},${col[1]},${col[2]})`;

  const colors = { fillColor: color, fillOpacity: 0.4, stroke: true, weight: 0.2, color: color };

  const mouseover = () => {
    //TODO: Show path
  };

  const mouseout = () => {
    //TODO: Hide path
  };

  return (
    <Rectangle bounds={bounds} pathOptions={colors} eventHandlers={{mouseover: mouseover, mouseout: mouseout}}>
      <Tooltip>
        Height: {Math.round(tile.height)}m<br/>
        AGL: {Math.round(tile.agl)}m<br/>
        Distance: {Math.round(tile.distance/100)/10}km
      </Tooltip>
    </Rectangle>
  )
}

function Grid({grid}: {grid: ConeSearchResponse}) {
  return (<>
    {grid.nodes.map((node) => (
        <GridMarker tile={node} angular_resolution={grid.angular_resolution} key={node.index.toString()}></GridMarker>
    ))}
  </>);
}

function LocationMarker() {
  const [cone, setCone] = useState<ConeSearchResponse | undefined>();

  const map = useMapEvents({
    async click(e) {
      let url = new URL("http://localhost:3000/flight_cone");
      url.search = new URLSearchParams({
        "lat": e.latlng.lat.toString(),
        "lon": e.latlng.lng.toString(),
        "cell_size": "50",
      }).toString();

      let response = await fetch(url);
      let cone: ConeSearchResponse = await response.json();

      console.log(cone);
      setCone(cone);
    },
  })

  return cone === undefined ? <></> : (<>
    <Grid grid={cone}></Grid>
  </>);
}

function App() {
  return (
    <div className="App">
      <MapContainer center={[47.264786047651256, 11.40106201171875 ]} zoom={13} scrollWheelZoom={true}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker></LocationMarker>
      </MapContainer>
    </div>
  );
}

export default App;
