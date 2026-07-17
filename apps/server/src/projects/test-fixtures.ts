import { faker } from "@faker-js/faker";

import { createProjectSchema, type CreateProjectInput } from "./schemas.js";

export function buildCreateProjectInput(
  overrides: Partial<CreateProjectInput> = {},
): CreateProjectInput {
  return createProjectSchema.parse({
    localPath: `/repos/${faker.helpers.slugify(faker.company.name()).toLowerCase()}`,
    name: faker.company.name(),
    devCommand: "pnpm dev",
    ...overrides,
  });
}
