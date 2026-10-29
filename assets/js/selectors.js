// Detects what kind of selector the user typed, normalises it and expands
// pivot URL templates. No DOM access, so the same code runs in Node tests.

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i;
const HOST_WITH_PATH = /^[a-z0-9.-]+\.[a-z]{2,63}\/\S*$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif|heic|tiff?)$/i;
const BTC = /^(?:bc1[a-z0-9]{25,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
const ETH = /^0x[a-fA-F0-9]{40}$/;
const TRON = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const HEX = /^[a-f0-9]+$/i;
const HASH_ALGOS = { 32: "md5", 40: "sha1", 64: "sha256" };
const PHONE = /^\+?[\d\s().\/-]{6,24}$/;
const USERNAME = /^@?[\w.-]{1,64}$/;
const NAME = /^[\p{L}\p{M}'’.&-]+(?:\s+[\p{L}\p{M}\d'’.&,-]+)+$/u;

export function isIPv6(value) {
  if (!value.includes(":")) return false;
  try {
    new URL(`http://[${value}]/`);
    return true;
  } catch {
    return false;
  }
}

function parseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function digitCount(value) {
  return (value.match(/\d/g) || []).length;
}

/**
 * Guess the selector type. Returns { type, subtype? } or null when unsure.
 * Order matters: a wallet or hash would otherwise look like a username.
 */
export function detect(input) {
  const value = String(input ?? "").trim().replace(/^mailto:/i, "");
  if (!value) return null;

  if (/^https?:\/\//i.test(value) || HOST_WITH_PATH.test(value)) {
    const url = parseUrl(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url) return { type: IMAGE_EXT.test(url.pathname) ? "image" : "url" };
  }
  if (EMAIL.test(value)) return { type: "email" };
  if (IPV4.test(value) || isIPv6(value)) return { type: "ip" };
  if (ETH.test(value)) return { type: "crypto", subtype: "eth" };
  if (TRON.test(value)) return { type: "crypto", subtype: "tron" };
  if (HEX.test(value) && HASH_ALGOS[value.length]) return { type: "hash", subtype: HASH_ALGOS[value.length] };
  if (BTC.test(value)) return { type: "crypto", subtype: "btc" };
  if (PHONE.test(value) && digitCount(value) >= 7 && digitCount(value) <= 15) return { type: "phone" };
  if (DOMAIN.test(value.replace(/\.$/, ""))) return { type: "domain" };
  if (NAME.test(value)) return { type: "name" };
  if (USERNAME.test(value)) return { type: "username" };
  return null;
}

function stripWww(host) {
  return host.replace(/^www\./i, "");
}

function cryptoSubtype(value) {
  if (ETH.test(value)) return "eth";
  if (TRON.test(value)) return "tron";
  if (BTC.test(value)) return "btc";
  return null;
}

/**
 * Clean the input for a given type and collect the template placeholders.
 * Returns { value, subtype, ctx, notes, related } where ctx feeds expand().
 */
export function normalise(type, input) {
  let value = String(input ?? "").trim();
  const notes = [];
  const related = [];
  const ctx = {};
  let subtype = null;

  switch (type) {
    case "username":
      value = value.replace(/^@+/, "");
      break;

    case "email": {
      value = value.replace(/^mailto:/i, "").toLowerCase();
      const at = value.lastIndexOf("@");
      ctx.local = at > 0 ? value.slice(0, at) : value;
      ctx.domain = at > 0 ? value.slice(at + 1) : "";
      if (ctx.domain) related.push({ type: "domain", value: ctx.domain });
      if (ctx.local) related.push({ type: "username", value: ctx.local.split("+")[0] });
      break;
    }

    case "domain": {
      const url = parseUrl(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      const host = (url ? url.hostname : value).toLowerCase().replace(/\.$/, "");
      value = stripWww(host);
      if (value !== host) notes.push(`Dropped "www." and looked up ${value}.`);
      break;
    }

    case "ip":
      value = value.toLowerCase();
      break;

    case "url":
    case "image": {
      if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
      const url = parseUrl(value);
      ctx.uri = value;
      ctx.host = url ? url.hostname.toLowerCase() : "";
      if (ctx.host) related.push({ type: "domain", value: stripWww(ctx.host) });
      if (type === "image") related.push({ type: "url", value });
      break;
    }

    case "phone": {
      let cleaned = value.replace(/[^\d+]/g, "");
      if (cleaned.startsWith("00")) cleaned = `+${cleaned.slice(2)}`;
      const hasCountry = cleaned.startsWith("+");
      ctx.digits = cleaned.replace(/\D/g, "");
      ctx.e164 = `+${ctx.digits}`;
      value = ctx.e164;
      if (!hasCountry) {
        notes.push("No country code given. Links assume the digits already start with one; add + and the code (e.g. +421) if not.");
      }
      break;
    }

    case "name": {
      value = value.replace(/\s+/g, " ");
      const parts = value.split(" ");
      ctx.first = parts[0];
      ctx.last = parts.length > 1 ? parts[parts.length - 1] : "";
      ctx.slug = value
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      break;
    }

    case "crypto":
      subtype = cryptoSubtype(value);
      if (!subtype) notes.push("Unrecognised address format, so only chain-independent links are shown.");
      break;

    case "hash":
      value = value.toLowerCase();
      subtype = HASH_ALGOS[value.length] || null;
      ctx.algo = subtype || "sha256";
      if (!subtype) notes.push("Expected 32, 40 or 64 hex characters (MD5, SHA-1 or SHA-256).");
      break;

    default:
      break;
  }

  ctx.q = value;
  return { value, subtype, ctx, notes, related };
}

/** Lower-case hex SHA-256, or null where WebCrypto is unavailable (plain http). */
export async function sha256Hex(text) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Placeholders used by a template, e.g. ["q", "algo"]. */
export function placeholdersOf(template) {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

/**
 * Fill a URL template. {uri} keeps URL structure (encodeURI); every other
 * placeholder is encoded as a single component, except ":" which is legal in
 * paths and queries and keeps IPv6 paths readable. Returns null if a value is missing.
 */
export function expand(template, ctx) {
  let missing = false;
  const url = template.replace(/\{(\w+)\}/g, (_, key) => {
    const raw = ctx[key];
    if (raw === undefined || raw === null || raw === "") {
      missing = true;
      return "";
    }
    return key === "uri" ? encodeURI(raw) : encodeURIComponent(raw).replace(/%3A/gi, ":");
  });
  return missing ? null : url;
}

/** All pivot links for a normalised selector, in data order. */
export function buildLinks(pivots, type, normalised) {
  const links = [];
  for (const pivot of pivots) {
    if (pivot.type !== type) continue;
    if (pivot.subtype && pivot.subtype !== normalised.subtype) continue;
    const url = expand(pivot.url, normalised.ctx);
    if (url) links.push({ ...pivot, href: url });
  }
  return links;
}
