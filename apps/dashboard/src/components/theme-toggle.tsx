import { Moon, Sun } from "lucide-react";
import { useState } from "react";

import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";

import { IconButton } from "./ui/icon-button";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  function handleToggle(): void {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <IconButton
      icon={theme === "light" ? Moon : Sun}
      label={theme === "light" ? "Activar modo oscuro" : "Activar modo claro"}
      onClick={handleToggle}
    />
  );
}
