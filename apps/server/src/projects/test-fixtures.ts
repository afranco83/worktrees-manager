import { faker } from "@faker-js/faker";

import { createProjectSchema, type CreateProjectInput } from "./schemas.js";

export function buildCreateProjectInput(
  overrides: Partial<CreateProjectInput> = {},
): CreateProjectInput {
  const portRangeStart = faker.number.int({ min: 3000, max: 8999 });

  return createProjectSchema.parse({
    localPath: `/repos/${faker.helpers.slugify(faker.company.name()).toLowerCase()}`,
    name: faker.company.name(),
    devCommand: "pnpm dev",
    portRangeStart,
    portRangeEnd: portRangeStart + 99,
    ...overrides,
  });
}
