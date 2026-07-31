import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dashboardDist = path.resolve(scriptDir, "../../dashboard/dist");
const publicDir = path.resolve(scriptDir, "../public");

if (!existsSync(dashboardDist)) {
  console.error(
    `No se encuentra ${dashboardDist} — ejecuta antes "pnpm --filter dashboard build".`,
  );
  process.exit(1);
}

rmSync(publicDir, { recursive: true, force: true });
cpSync(dashboardDist, publicDir, { recursive: true });
