import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./app/App";
import { BatchPlaneClientContext } from "./client/batch-plane-client-context";
import "./i18n/i18n";
import { createRuntimeBatchPlaneClient } from "./runtime/runtime-batch-plane-client";
import "./ui/tokens.css";
import "./shared/styles/global.css";

restoreGitHubPagesRedirect();

const browserBaseName =
  import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL;
const batchPlaneClient = createRuntimeBatchPlaneClient();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BatchPlaneClientContext.Provider value={batchPlaneClient}>
      <BrowserRouter basename={browserBaseName}>
        <App />
      </BrowserRouter>
    </BatchPlaneClientContext.Provider>
  </React.StrictMode>,
);

function restoreGitHubPagesRedirect() {
  const redirect = new URLSearchParams(window.location.search).get("redirect");

  if (!redirect) {
    return;
  }

  window.history.replaceState(
    null,
    "",
    redirect.startsWith("/") ? redirect : `/${redirect}`,
  );
}
