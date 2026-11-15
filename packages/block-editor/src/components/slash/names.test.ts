import type { SlashCommandDef } from "@gotipe/core";
import { createI18n, en, ru } from "@gotipe/i18n";
import { describe, expect, it } from "vitest";
import { withBlockEditorStrings } from "../../i18n/strings";
import { localizeCommand } from "./names";

const command = (name: string, icon: string, group = "ai"): SlashCommandDef => ({
  name,
  aliases: [],
  description: "",
  icon,
  group,
  execute() {},
});
const russian = withBlockEditorStrings(createI18n({ locale: "ru", locales: { en, ru } }));

describe("slash command names (D-34)", () => {
  it("names the commands of defineAiContext in the editor's language", () => {
    const continued = localizeCommand(command("Continue Writing", "sparkles"), russian);
    expect(continued.name).toBe("Продолжить текст");
    expect(continued.aliases).toContain("Continue Writing");
    expect(localizeCommand(command("Ask AI", "sparkles"), russian).name).toBe("Спросить модель");
  });

  it("keeps the name of a host's own AI command and of a command outside the AI group", () => {
    expect(localizeCommand(command("Draft a reply", "sparkles"), russian).name).toBe(
      "Draft a reply",
    );
    expect(localizeCommand(command("Ask AI", "sparkles", "basic"), russian).name).toBe("Ask AI");
  });
});
