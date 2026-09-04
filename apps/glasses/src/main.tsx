import { RegistryContext } from "@effect/atom-react";
import React from "react";
import ReactDOM from "react-dom/client";

import { appAtomRegistry } from "./connection/runtime";
import { startGlassesController } from "./glasses/controller";
import { App } from "./phone/App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RegistryContext.Provider value={appAtomRegistry}>
      <App />
    </RegistryContext.Provider>
  </React.StrictMode>,
);

void startGlassesController();
