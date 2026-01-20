
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

// Global styling + Tailwind entrypoint
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(<App />);
  