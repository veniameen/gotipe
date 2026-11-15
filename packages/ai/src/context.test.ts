// @vitest-environment node
import { describe, expect, it } from "vitest";
import { defineAiContext } from "./context";

describe("defineAiContext's / rows (D-34)", () => {
  it("draw the sparkle of the shared icon set, not emoji", () => {
    const rows = (defineAiContext.slashCommands ?? []).map(({ name, icon, group }) => ({
      name,
      icon,
      group,
    }));
    expect(rows).toEqual([
      { name: "Continue Writing", icon: "sparkles", group: "ai" },
      { name: "Ask AI", icon: "sparkles", group: "ai" },
    ]);
  });
});
