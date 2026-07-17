import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { getRouter } from "./router";
import "./styles.css";

const router = getRouter();

createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />
);
