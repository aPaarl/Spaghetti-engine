import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import SpaghettiEngine from "./SpaghettiEngine.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SpaghettiEngine />
  </StrictMode>,
);
