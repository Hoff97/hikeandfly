import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./index.css";
import App from "./App";
import { registerSW } from "virtual:pwa-register";
import { preloadWasmRuntime } from "./wasm/glide";

registerSW({
  immediate: true,
});

void preloadWasmRuntime();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
