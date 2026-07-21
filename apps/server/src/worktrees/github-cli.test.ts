import { describe, expect, it } from "vitest";

import { parseGhPrViewOutput } from "./github-cli.js";

describe("parseGhPrViewOutput", () => {
  it("should parse an open pull request", () => {
    const stdout = JSON.stringify({
      number: 42,
      state: "OPEN",
      url: "https://github.com/afranco83/worktrees-manager/pull/42",
    });

    expect(parseGhPrViewOutput(stdout)).toEqual({
      number: 42,
      state: "open",
      url: "https://github.com/afranco83/worktrees-manager/pull/42",
    });
  });

  it("should parse a closed pull request", () => {
    const stdout = JSON.stringify({
      number: 7,
      state: "CLOSED",
      url: "https://github.com/afranco83/worktrees-manager/pull/7",
    });

    expect(parseGhPrViewOutput(stdout)).toEqual({
      number: 7,
      state: "closed",
      url: "https://github.com/afranco83/worktrees-manager/pull/7",
    });
  });

  it("should parse a merged pull request", () => {
    const stdout = JSON.stringify({
      number: 6,
      state: "MERGED",
      url: "https://github.com/afranco83/worktrees-manager/pull/6",
    });

    expect(parseGhPrViewOutput(stdout)).toEqual({
      number: 6,
      state: "merged",
      url: "https://github.com/afranco83/worktrees-manager/pull/6",
    });
  });
});
