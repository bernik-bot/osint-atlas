import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toolId } from "../assets/js/catalogue.js";
import { importPrefs } from "../assets/js/storage.js";

const data = JSON.parse(readFileSync(new URL("../data/tools.json", import.meta.url), "utf8"));

test("tool ids are stable slugs", () => {
  assert.equal(toolId("Have I Been Pwned"), "have-i-been-pwned");
  assert.equal(toolId("Hlídač státu"), "hlidac-statu");
  assert.equal(toolId("Who posted what?"), "who-posted-what");
});

test("every tool has a unique id, so stars and notes never clash", () => {
  const ids = data.tools.map((t) => toolId(t.name));
  assert.equal(new Set(ids).size, ids.length);
});

test("import merges stars and notes and rejects foreign files", () => {
  const prefs = { starred: new Set(["bing"]), notes: { bing: "old" } };
  const file = JSON.stringify({ app: "osint-atlas", version: 1, starred: ["bing", "shodan"], notes: { bing: "new", crtsh: "  ", shodan: "ports" } });
  const added = importPrefs(prefs, file);
  assert.deepEqual([...prefs.starred].sort(), ["bing", "shodan"]);
  assert.deepEqual(prefs.notes, { bing: "new", shodan: "ports" });
  assert.equal(added, 3);
  assert.throws(() => importPrefs(prefs, JSON.stringify({ starred: [] })), /Not an OSINT Atlas export/);
});
