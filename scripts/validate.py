#!/usr/bin/env python3
"""Validate data/tools.json and data/pivots.json.

Run before every commit (CI does it on each push and pull request):

    python scripts/validate.py

Exits with status 1 and a list of problems if anything is off.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "data" / "tools.json"
PIVOTS = ROOT / "data" / "pivots.json"

PRICING = {"free", "freemium", "paid"}
TYPES = {"web", "cli", "extension", "app", "api", "dataset", "guide"}
TOOL_KEYS = {"name", "url", "category", "description", "pricing", "type", "account", "openSource", "apiKey", "region", "tags"}
REQUIRED_TOOL_KEYS = TOOL_KEYS - {"apiKey", "region", "tags"}
MAX_DESCRIPTION = 140

PIVOT_KEYS = {"type", "subtype", "group", "name", "url", "note"}
SUBTYPES = {"crypto": {"btc", "eth", "tron"}, "hash": {"md5", "sha1", "sha256"}}
PLACEHOLDER = re.compile(r"\{(\w+)\}")


def slug(name: str) -> str:
    """Same id the web app uses for stars and notes (see toolId in catalogue.js)."""
    import unicodedata

    folded = unicodedata.normalize("NFD", name)
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch)).lower()
    return re.sub(r"[^a-z0-9]+", "-", folded).strip("-")


def check_url(url: str, where: str, errors: list[str], allow_http: bool = False) -> None:
    parsed = urlparse(url)
    schemes = {"https", "http"} if allow_http else {"https"}
    if parsed.scheme not in schemes or not parsed.netloc:
        errors.append(f"{where}: URL must be absolute https://, got {url!r}")
    if any(ch.isspace() for ch in url):
        errors.append(f"{where}: URL contains whitespace")


def validate_tools(data: dict, errors: list[str]) -> int:
    categories = data.get("categories", [])
    cat_ids = [c.get("id") for c in categories]
    for dup in {c for c in cat_ids if cat_ids.count(c) > 1}:
        errors.append(f"categories: duplicate id {dup!r}")
    for cat in categories:
        for key in ("id", "name", "blurb"):
            if not cat.get(key):
                errors.append(f"categories: {cat!r} is missing {key!r}")

    seen_names: dict[str, str] = {}
    seen_ids: dict[str, str] = {}
    seen_urls: dict[str, str] = {}
    used_categories: set[str] = set()
    for i, tool in enumerate(data.get("tools", [])):
        where = f"tools[{i}] {tool.get('name', '?')}"
        keys = set(tool)
        if missing := REQUIRED_TOOL_KEYS - keys:
            errors.append(f"{where}: missing {sorted(missing)}")
        if extra := keys - TOOL_KEYS:
            errors.append(f"{where}: unknown keys {sorted(extra)}")

        name = str(tool.get("name", "")).strip()
        url = str(tool.get("url", ""))
        desc = str(tool.get("description", ""))

        check_url(url, where, errors, allow_http=True)
        if tool.get("category") not in cat_ids:
            errors.append(f"{where}: unknown category {tool.get('category')!r}")
        used_categories.add(tool.get("category"))
        if tool.get("pricing") not in PRICING:
            errors.append(f"{where}: pricing must be one of {sorted(PRICING)}")
        if tool.get("type") not in TYPES:
            errors.append(f"{where}: type must be one of {sorted(TYPES)}")
        for flag in ("account", "openSource", "apiKey"):
            if flag in tool and not isinstance(tool[flag], bool):
                errors.append(f"{where}: {flag} must be true or false")
        if "region" in tool and not re.fullmatch(r"[A-Z]{2}", str(tool["region"])):
            errors.append(f"{where}: region must be a two-letter code such as EU, US or SK")
        tags = tool.get("tags", [])
        if not isinstance(tags, list) or not all(isinstance(t, str) and re.fullmatch(r"[a-z0-9-]+", t) for t in tags):
            errors.append(f"{where}: tags must be a list of lower-case words")
        if not desc or len(desc) > MAX_DESCRIPTION:
            errors.append(f"{where}: description must be 1-{MAX_DESCRIPTION} characters (has {len(desc)})")
        elif not desc.endswith("."):
            errors.append(f"{where}: description should end with a full stop")

        tool_id = slug(name)
        if tool_id in seen_ids:
            errors.append(f"{where}: name gives the same id {tool_id!r} as {seen_ids[tool_id]} (stars and notes would clash)")
        seen_ids[tool_id] = where
        key = name.lower()
        if key in seen_names:
            errors.append(f"{where}: duplicate name, also {seen_names[key]}")
        seen_names[key] = where
        norm_url = url.rstrip("/").lower()
        if norm_url in seen_urls:
            errors.append(f"{where}: duplicate URL, also {seen_urls[norm_url]}")
        seen_urls[norm_url] = where

    for cat in set(cat_ids) - used_categories:
        errors.append(f"categories: {cat!r} has no tools")
    return len(data.get("tools", []))


def validate_pivots(data: dict, errors: list[str]) -> int:
    types = {t["id"]: set(t.get("placeholders", [])) | {"q"} for t in data.get("types", [])}
    seen: set[tuple] = set()
    for i, pivot in enumerate(data.get("pivots", [])):
        where = f"pivots[{i}] {pivot.get('type', '?')}/{pivot.get('name', '?')}"
        if extra := set(pivot) - PIVOT_KEYS:
            errors.append(f"{where}: unknown keys {sorted(extra)}")
        for key in ("type", "group", "name", "url"):
            if not pivot.get(key):
                errors.append(f"{where}: missing {key!r}")
        ptype = pivot.get("type")
        if ptype not in types:
            errors.append(f"{where}: unknown type {ptype!r}")
            continue
        if "subtype" in pivot and pivot["subtype"] not in SUBTYPES.get(ptype, set()):
            errors.append(f"{where}: subtype {pivot['subtype']!r} is not valid for {ptype}")

        url = pivot.get("url", "")
        placeholders = PLACEHOLDER.findall(url)
        if not placeholders:
            errors.append(f"{where}: URL has no placeholder, so it ignores the selector")
        for name in placeholders:
            if name not in types[ptype]:
                errors.append(f"{where}: {{{name}}} is not available for {ptype} (allowed: {sorted(types[ptype])})")
        check_url(PLACEHOLDER.sub("x", url), where, errors)

        ident = (ptype, pivot.get("subtype"), pivot.get("name"))
        if ident in seen:
            errors.append(f"{where}: duplicate pivot name for this type")
        seen.add(ident)
    return len(data.get("pivots", []))


def main() -> int:
    errors: list[str] = []
    try:
        tools = json.loads(TOOLS.read_text(encoding="utf-8"))
        pivots = json.loads(PIVOTS.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Cannot read data: {exc}", file=sys.stderr)
        return 1

    n_tools = validate_tools(tools, errors)
    n_pivots = validate_pivots(pivots, errors)

    if errors:
        print(f"{len(errors)} problem(s) found:\n", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1
    print(f"OK: {n_tools} tools in {len(tools['categories'])} categories, {n_pivots} pivots for {len(pivots['types'])} selector types.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
