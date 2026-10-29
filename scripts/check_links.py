#!/usr/bin/env python3
"""Check that every tool URL in data/tools.json still answers.

    python scripts/check_links.py            # all tools
    python scripts/check_links.py --only crypto,geo
    python scripts/check_links.py --write data/link-status.json

--write saves the result for the web app, which flags unreachable tools,
and always exits 0 so the monthly workflow can commit the file.

Many sites block scripts (HTTP 401/403/429 or a Cloudflare challenge), so
those count as "blocked", not broken. Only DNS failures, timeouts and
404/410 responses fail the run. Uses the standard library only.
"""

from __future__ import annotations

import argparse
import json
import socket
import ssl
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
BLOCKED = {401, 402, 403, 405, 406, 429, 451, 503}
BROKEN = {404, 410}


def probe(url: str, timeout: float) -> tuple[str, str]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return "ok", str(response.status)
    except urllib.error.HTTPError as exc:
        if exc.code in BROKEN:
            return "broken", str(exc.code)
        if exc.code in BLOCKED:
            return "blocked", str(exc.code)
        return "warn", str(exc.code)
    except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError) as exc:
        reason = getattr(exc, "reason", exc)
        if isinstance(reason, ssl.SSLCertVerificationError):
            # Usually a server that omits an intermediate certificate: browsers cope, Python does not.
            return "warn", "TLS chain"
        return "broken", type(reason).__name__ if not isinstance(reason, str) else reason


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", help="comma-separated category ids")
    parser.add_argument("--timeout", type=float, default=20)
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--write", metavar="PATH", help="save non-OK results as JSON for the web app")
    args = parser.parse_args()

    data = json.loads((ROOT / "data" / "tools.json").read_text(encoding="utf-8"))
    wanted = set(args.only.split(",")) if args.only else None
    tools = [t for t in data["tools"] if not wanted or t["category"] in wanted]

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(lambda t: (t, *probe(t["url"], args.timeout)), tools))

    counts: dict[str, int] = {}
    for tool, state, detail in sorted(results, key=lambda r: (r[1] != "broken", r[1], r[0]["name"].lower())):
        counts[state] = counts.get(state, 0) + 1
        if state != "ok":
            print(f"{state:8} {detail:>16}  {tool['name']}  {tool['url']}")

    summary = ", ".join(f"{n} {state}" for state, n in sorted(counts.items()))
    print(f"\nChecked {len(results)} URLs: {summary}")

    if args.write:
        status = {
            "checked": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "total": len(results),
            "counts": dict(sorted(counts.items())),
            "issues": {
                tool["url"]: {"state": state, "detail": detail}
                for tool, state, detail in sorted(results, key=lambda r: r[0]["url"])
                if state != "ok"
            },
        }
        Path(args.write).write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {args.write}")
        return 0
    return 1 if counts.get("broken") else 0


if __name__ == "__main__":
    sys.exit(main())
