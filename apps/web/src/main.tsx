import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { createAppRouter } from "./app/router";
import { BatchPlaneClientContext } from "./client/batch-plane-client-context";
import "./i18n/i18n";
import { createRuntimeBatchPlaneClient } from "./runtime/runtime-batch-plane-client";
import "./ui/tokens.css";
import "./shared/styles/global.css";

restoreGitHubPagesRedirect();

const browserBaseName =
  import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL;
const batchPlaneClient = createRuntimeBatchPlaneClient();
const router = createAppRouter(browserBaseName);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BatchPlaneClientContext.Provider value={batchPlaneClient}>
      <RouterProvider router={router} />
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
