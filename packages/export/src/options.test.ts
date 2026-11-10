import { expect, it } from "vitest";
import { validateOptionNames } from "./options";

it("rejects unsupported options before accessing the source document", () => {
  expect(() => validateOptionNames({ includeStyles: true }, [])).toThrow(
    "Unsupported export option: includeStyles",
  );
  expect(() => validateOptionNames({ title: "Document" }, ["title"])).not.toThrow();
});
