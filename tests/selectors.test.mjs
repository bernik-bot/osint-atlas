import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detect, normalise, expand, buildLinks, sha256Hex, placeholdersOf } from "../assets/js/selectors.js";

const pivots = JSON.parse(readFileSync(new URL("../data/pivots.json", import.meta.url), "utf8"));

test("detects every selector type", () => {
  const cases = {
    torvalds: "username",
    "@jack": "username",
    "jane_doe-99": "username",
    "someone@example.com": "email",
    "mailto:someone@example.com": "email",
    "example.com": "domain",
    "sub.example.co.uk": "domain",
    "1.1.1.1": "ip",
    "2606:4700:4700::1111": "ip",
    "https://example.com/page?id=1": "url",
    "example.com/about": "url",
    "https://example.com/img/photo.JPG": "image",
    "+421 905 123 456": "phone",
    "00421905123456": "phone",
    "(415) 555-0123": "phone",
    "Jane Doe": "name",
    "Ján Novák": "name",
    "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq": "crypto",
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa": "crypto",
    "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe": "crypto",
    "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t": "crypto",
    d41d8cd98f00b204e9800998ecf8427e: "hash",
    e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855: "hash",
  };
  for (const [input, type] of Object.entries(cases)) {
    assert.equal(detect(input)?.type, type, `${input} should be ${type}`);
  }
  assert.equal(detect("   "), null);
  assert.equal(detect("!!!"), null);
});

test("detects hash algorithm and wallet chain", () => {
  assert.equal(detect("da39a3ee5e6b4b0d3255bfef95601890afd80709").subtype, "sha1");
  assert.equal(detect("0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe").subtype, "eth");
  assert.equal(detect("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa").subtype, "btc");
});

test("normalises phone numbers to E.164", () => {
  const n = normalise("phone", "00421 905/123-456");
  assert.equal(n.value, "+421905123456");
  assert.equal(n.ctx.digits, "421905123456");
  assert.equal(n.notes.length, 0);
  assert.equal(normalise("phone", "0905 123 456").notes.length, 1);
});

test("normalises email and offers related pivots", () => {
  const n = normalise("email", " Jane.Doe+news@Example.com ");
  assert.equal(n.value, "jane.doe+news@example.com");
  assert.equal(n.ctx.domain, "example.com");
  assert.deepEqual(n.related, [
    { type: "domain", value: "example.com" },
    { type: "username", value: "jane.doe" },
  ]);
});

test("normalises domains from URLs and drops www", () => {
  const n = normalise("domain", "https://WWW.Example.com/path");
  assert.equal(n.value, "example.com");
  assert.equal(n.notes.length, 1);
});

test("builds a name slug without diacritics", () => {
  const n = normalise("name", "  Ján   Novák ");
  assert.equal(n.value, "Ján Novák");
  assert.equal(n.ctx.slug, "jan-novak");
  assert.equal(n.ctx.first, "Ján");
  assert.equal(n.ctx.last, "Novák");
});

test("expands templates with the right encoding", () => {
  assert.equal(expand("https://x.test/?q=%22{q}%22", { q: "a b&c" }), "https://x.test/?q=%22a%20b%26c%22");
  assert.equal(expand("https://web.archive.org/web/*/{uri}", { uri: "https://e.com/a b?x=1" }), "https://web.archive.org/web/*/https://e.com/a%20b?x=1");
  assert.equal(expand("https://x.test/ip/{q}", { q: "2606:4700::1111" }), "https://x.test/ip/2606:4700::1111");
  assert.equal(expand("https://x.test/{missing}", { q: "a" }), null);
});

test("sha256 matches the known digest", async () => {
  assert.equal(await sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("every pivot type produces links", async () => {
  const samples = {
    username: "torvalds",
    email: "someone@example.com",
    domain: "example.com",
    ip: "1.1.1.1",
    url: "https://example.com/page",
    image: "https://example.com/photo.jpg",
    phone: "+421905123456",
    name: "Jane Doe",
    crypto: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  };
  for (const type of pivots.types.map((t) => t.id)) {
    const n = normalise(type, samples[type]);
    if (type === "email") n.ctx.sha256 = await sha256Hex(n.value);
    const links = buildLinks(pivots.pivots, type, n);
    assert.ok(links.length >= 5, `${type} has only ${links.length} links`);
    for (const link of links) assert.match(link.href, /^https:\/\/[^\s{}]+$/, `${type}: ${link.name}`);
  }
});

test("pivots only use placeholders their type provides", () => {
  const allowed = Object.fromEntries(pivots.types.map((t) => [t.id, new Set(["q", ...t.placeholders])]));
  for (const pivot of pivots.pivots) {
    for (const key of placeholdersOf(pivot.url)) {
      assert.ok(allowed[pivot.type].has(key), `${pivot.type}/${pivot.name} uses unknown {${key}}`);
    }
  }
});

test("chain-specific explorers only appear for their chain", () => {
  const eth = normalise("crypto", "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe");
  const names = buildLinks(pivots.pivots, "crypto", eth).map((l) => l.name);
  assert.ok(names.includes("Etherscan"));
  assert.ok(!names.includes("mempool.space"));
});
