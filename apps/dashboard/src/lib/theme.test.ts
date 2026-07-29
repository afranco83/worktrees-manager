import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyTheme, getStoredTheme } from "./theme";

// El entorno de test no trae un `localStorage` real (de ahí el aviso
// "localStorage is not available" que se ve en toda la suite) — se stubea uno
// en memoria para poder probar la lectura/escritura real, y por separado uno
// que lanza para probar la degradación a "light" (mismo caso que un navegador
// que bloquea el acceso, p. ej. modo privado restrictivo).
function stubWorkingLocalStorage(): void {
  const store = new Map<string, string>();

  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
}

function stubThrowingLocalStorage(): void {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("localStorage unavailable");
    },
    setItem: () => {
      throw new Error("localStorage unavailable");
    },
  });
}

describe("theme", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.classList.remove("dark");
  });

  it("should default to light when nothing is stored", () => {
    stubWorkingLocalStorage();

    expect(getStoredTheme()).toBe("light");
  });

  it("should default to light for any stored value other than dark", () => {
    stubWorkingLocalStorage();
    localStorage.setItem("worktrees-manager:theme", "not-a-real-theme");

    expect(getStoredTheme()).toBe("light");
  });

  it("should read back a stored dark preference", () => {
    stubWorkingLocalStorage();
    localStorage.setItem("worktrees-manager:theme", "dark");

    expect(getStoredTheme()).toBe("dark");
  });

  it("should add the dark class and persist the preference when applying dark", () => {
    stubWorkingLocalStorage();

    applyTheme("dark");

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(getStoredTheme()).toBe("dark");
  });

  it("should remove the dark class and persist the preference when applying light", () => {
    stubWorkingLocalStorage();
    document.documentElement.classList.add("dark");
    localStorage.setItem("worktrees-manager:theme", "dark");

    applyTheme("light");

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(getStoredTheme()).toBe("light");
  });

  it("should default to light instead of throwing when localStorage is unavailable", () => {
    stubThrowingLocalStorage();

    expect(() => getStoredTheme()).not.toThrow();
    expect(getStoredTheme()).toBe("light");
  });

  it("should still toggle the class when localStorage is unavailable, without throwing", () => {
    stubThrowingLocalStorage();

    expect(() => applyTheme("dark")).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
