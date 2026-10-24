// Point d'entrée de l'interface React (lot E6).
import { createRoot } from "react-dom/client";
import type { WeCraftApi } from "../../shared/api";
import { App } from "./App";

declare global {
  interface Window {
    wecraft: WeCraftApi;
  }
}

createRoot(document.getElementById("root")!).render(<App />);
