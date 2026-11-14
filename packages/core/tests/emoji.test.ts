import { describe, expect, it } from "vitest";
import {
  EMOJI_CATEGORIES,
  EMOJI_SHORTCODES,
  EMOJI_TABLE,
  emojiItems,
  emojiSource,
  findEmoji,
  searchEmoji,
} from "../src/emoji";
import { EMOJI_NAMES_RU } from "../src/emoji-ru";

const names = (query: string, limit = 10) =>
  searchEmoji(query, limit, EMOJI_NAMES_RU).map(({ name }) => name);

describe("emoji table", () => {
  it("lists every category once, in picker order, and flattens in that order", () => {
    expect(EMOJI_CATEGORIES).toEqual([
      "people",
      "nature",
      "food",
      "activities",
      "travel",
      "objects",
      "symbols",
      "flags",
    ]);
    expect(Object.keys(EMOJI_TABLE).sort()).toEqual([...EMOJI_CATEGORIES].sort());
    expect(EMOJI_SHORTCODES).toEqual(EMOJI_CATEGORIES.flatMap((category) => EMOJI_TABLE[category]));
    for (const category of EMOJI_CATEGORIES) {
      expect(EMOJI_TABLE[category].length, category).toBeGreaterThanOrEqual(30);
      expect(EMOJI_TABLE[category].length, category).toBeLessThanOrEqual(150);
    }
    expect(EMOJI_SHORTCODES.length).toBeGreaterThanOrEqual(450);
    expect(EMOJI_SHORTCODES.length).toBeLessThanOrEqual(600);
  });

  it("has unique shortcodes and characters, all fully-qualified RGI emoji", () => {
    const shortcodes = EMOJI_SHORTCODES.flatMap(([name, , ...aliases]) => [name, ...aliases]);
    expect(shortcodes.filter((name, index) => shortcodes.indexOf(name) !== index)).toEqual([]);
    const characters = EMOJI_SHORTCODES.map(([, emoji]) => emoji);
    expect(characters.filter((emoji, index) => characters.indexOf(emoji) !== index)).toEqual([]);
    const rgi = /^\p{RGI_Emoji}$/v;
    for (const [name, emoji] of EMOJI_SHORTCODES) {
      expect(emoji.length, name).toBeGreaterThan(0);
      expect(/[a-z]/i.test(emoji), name).toBe(false);
      expect(rgi.test(emoji), name).toBe(true);
      expect(/^[a-z0-9_+-]+$/.test(name), name).toBe(true);
    }
  });

  it("starts the people grid with the common faces of the picker frame", () => {
    expect(
      emojiItems("people")
        .slice(0, 45)
        .map(({ emoji }) => emoji)
        .join(" "),
    ).toBe(
      "😀 😃 😄 😁 😆 😅 😂 🙂 😉 😊 😇 🥰 😍 🤩 😋 😛 🤔 🤨 😐 😑 😶 🙄 😏 😬 😌 😴 😷 🥳 😎 🤓 " +
        "🧐 😕 😟 😮 😲 😳 😢 😭 😤 😠 🤯 😱 🥶 🤗 🤭",
    );
  });

  it("builds a category grid and finds table entries by character", () => {
    const flags = emojiItems("flags");
    expect(flags).toHaveLength(EMOJI_TABLE.flags.length);
    expect(flags[0]).toEqual({ name: "checkered_flag", emoji: "🏁", category: "flags" });
    expect(flags.every(({ category }) => category === "flags")).toBe(true);
    expect(findEmoji("🤔")).toEqual({ name: "thinking", emoji: "🤔", category: "people" });
    expect(findEmoji("✍️")).toEqual({ name: "writing_hand", emoji: "✍️", category: "people" });
    expect(findEmoji("✍")?.name).toBe("writing_hand");
    expect(findEmoji("🇷🇺")?.category).toBe("flags");
    expect(findEmoji("x")).toBeUndefined();
    expect(findEmoji("")).toBeUndefined();
  });
});

describe("Russian emoji names", () => {
  it("names every shortcode of the table and nothing else", () => {
    const shortcodes = EMOJI_SHORTCODES.map(([name]) => name);
    expect(Object.keys(EMOJI_NAMES_RU).sort()).toEqual([...shortcodes].sort());
    for (const name of shortcodes) {
      const local = EMOJI_NAMES_RU[name] ?? "";
      expect(local.trim().length, name).toBeGreaterThan(0);
      expect(local, name).toBe(local.toLowerCase());
    }
    expect(EMOJI_NAMES_RU.thinking).toBe("задумчивое лицо");
  });

  it("answers the frame query `:пра` with the celebration, check, edit and right", () => {
    const found = searchEmoji("пра", 10, EMOJI_NAMES_RU);
    expect(
      found
        .slice(0, 3)
        .map(({ name }) => name)
        .sort(),
    ).toEqual(["tada", "white_check_mark", "writing_hand"]);
    expect(found.map(({ name }) => EMOJI_NAMES_RU[name]).slice(0, 4)).toEqual([
      "правка",
      "праздник",
      "правильно",
      "направо",
    ]);
    expect(found[3]).toEqual({ name: "point_right", emoji: "👉", category: "people" });
    const prefixed = EMOJI_SHORTCODES.filter(([name]) =>
      (EMOJI_NAMES_RU[name] ?? "").split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith("пра")),
    ).map(([name]) => name);
    expect(prefixed.sort()).toEqual(["tada", "white_check_mark", "writing_hand"]);
  });

  it("matches names case-insensitively, by word start, and treats ё as е", () => {
    expect(names("задумч")).toEqual(["thinking"]);
    expect(names("ЗАДУМЧИВОЕ ЛИЦО")).toEqual(["thinking"]);
    expect(names("еж")).toEqual(names("ёж"));
    expect(names("еж")[0]).toBe("hedgehog");
    expect(names("елка")).toContain("christmas_tree");
    expect(names("ЁЛКА")).toContain("christmas_tree");
    expect(names("франц")).toEqual(["fr"]);
    // Any word start is a prefix match, so the order stays the table order.
    expect(names("лицо", 3)).toEqual(["smiley", "blush", "innocent"]);
    // Word starts rank before matches inside a word (ярость, скоростной).
    expect(names("рост")).toEqual([
      "seedling",
      "chart_with_upwards_trend",
      "rage",
      "bullettrain_side",
    ]);
  });

  it("still matches shortcodes and aliases when names are given", () => {
    expect(names("tada")).toEqual(["tada"]);
    expect(names("thumbs")).toEqual(["+1", "-1"]);
    expect(searchEmoji("пра")).toEqual([]);
    expect(searchEmoji("пра", 0, EMOJI_NAMES_RU)).toEqual([]);
    expect(searchEmoji("", 4, EMOJI_NAMES_RU).map(({ emoji }) => emoji)).toEqual([
      "😀",
      "😃",
      "😄",
      "😁",
    ]);
  });

  it("keeps the suggestion source on shortcodes only", () => {
    expect(emojiSource.search("tad", { signal: new AbortController().signal })).toEqual([
      { name: "tada", emoji: "🎉", category: "activities" },
    ]);
  });
});
