export type Theme = "light" | "dark";

// Preferencia puramente de presentación en este navegador — a diferencia de
// los ajustes globales de `features/settings` (terminal preferida, rango de
// puertos), no tiene sentido persistirla en el servidor: no es configuración
// de la app, y este es un tool local de un único usuario.
const THEME_STORAGE_KEY = "worktrees-manager:theme";

// `localStorage` puede lanzar (modo privado con restricciones en algunos
// navegadores) o no estar disponible del todo (entorno de test) — claro por
// defecto es una degradación aceptable en ambos casos, mismo criterio que el
// script inline de `index.html` que aplica el tema antes del primer pintado.
export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Aplica `theme` al `<html>` (para las variantes `dark:` de Tailwind) y lo persiste. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Preferencia no persistida esta vez — el toggle ya sigue funcionando
    // dentro de la sesión actual vía el estado de React.
  }
}
