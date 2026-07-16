import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { InvalidProjectConfigFileError } from "../errors.js";

export const CONFIG_FILE_NAME = ".worktrees-manager.json";

export const projectConfigFileSchema = z.object({
  devCommand: z.string().min(1),
  portRangeStart: z.number().int().positive(),
  portRangeEnd: z.number().int().positive(),
});

export type ProjectConfigFile = z.infer<typeof projectConfigFileSchema>;

export function readProjectConfigFile(localPath: string): ProjectConfigFile | null {
  const configFilePath = join(localPath, CONFIG_FILE_NAME);

  if (!existsSync(configFilePath)) {
    return null;
  }

  let rawContent: unknown;

  try {
    rawContent = JSON.parse(readFileSync(configFilePath, "utf-8"));
  } catch {
    throw new InvalidProjectConfigFileError(`${configFilePath} no es JSON válido`);
  }

  const result = projectConfigFileSchema.safeParse(rawContent);

  if (!result.success) {
    throw new InvalidProjectConfigFileError(`${configFilePath} no cumple el esquema esperado`);
  }

  return result.data;
}

export function writeProjectConfigFile(localPath: string, config: ProjectConfigFile): void {
  const configFilePath = join(localPath, CONFIG_FILE_NAME);

  writeFileSync(configFilePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}
