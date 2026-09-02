import React from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./Root";
import { initTheme } from "./lib/theme";
import "./styles.css";

initTheme();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
