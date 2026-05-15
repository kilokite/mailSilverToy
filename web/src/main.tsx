import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { AuthProvider } from "@/lib/auth"
import { RouterShell } from "./router-shell"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <RouterShell />
    </AuthProvider>
  </StrictMode>,
)
