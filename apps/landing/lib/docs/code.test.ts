import { describe, expect, it } from "vitest";
import { installVariants } from "./code";

describe("install tabs", () => {
  it("offer pnpm, yarn and bun for npm install lines", () => {
    const panels = installVariants("npm install @gotipe/core @gotipe/react\nnpm i -D shiki\n");
    expect(panels?.map((panel) => [panel.label, panel.code])).toEqual([
      ["npm", "npm install @gotipe/core @gotipe/react\nnpm i -D shiki"],
      ["pnpm", "pnpm add @gotipe/core @gotipe/react\npnpm add -D shiki"],
      ["yarn", "yarn add @gotipe/core @gotipe/react\nyarn add --dev shiki"],
      ["bun", "bun add @gotipe/core @gotipe/react\nbun add -d shiki"],
    ]);
  });

  it("leave any other command alone", () => {
    expect(installVariants("pnpm install --frozen-lockfile")).toBeNull();
    expect(installVariants("npm install a\ncargo build")).toBeNull();
    expect(installVariants("npm run build")).toBeNull();
    expect(installVariants("")).toBeNull();
  });
});
