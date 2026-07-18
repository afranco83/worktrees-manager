import { describe, expect, it } from "vitest";

import { stripAnsiCodes } from "./strip-ansi-codes";

describe("stripAnsiCodes", () => {
  it("should remove SGR color codes while keeping the surrounding text", () => {
    const content = "[34m@store-demo/storybook:dev: [0mhello";

    const result = stripAnsiCodes(content);

    expect(result).toBe("@store-demo/storybook:dev: hello");
  });

  it("should remove cursor visibility sequences", () => {
    const content = "[?25hdone[?25l";

    const result = stripAnsiCodes(content);

    expect(result).toBe("done");
  });

  it("should return plain text unchanged when it has no escape codes", () => {
    const content = "Ready in 1117ms";

    const result = stripAnsiCodes(content);

    expect(result).toBe("Ready in 1117ms");
  });
});
