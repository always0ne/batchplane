import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./app/App";
import "./i18n/i18n";
import "./shared/styles/global.css";

restoreGitHubPagesRedirect();

const browserBaseName =
  import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter basename={browserBaseName}>
      <App />
    </BrowserRouter>
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
