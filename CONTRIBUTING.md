# Contributing

Suggestions and fixes are welcome, whether it's a new tool, a dead link or a better pivot.

## What gets in

A tool is a good fit when it:

- works today and is maintained (or is a stable archive or dataset),
- is useful to an investigator, not just a general-purpose website,
- is lawful to use for open-source research, and
- adds something the catalogue doesn't already cover. Five near-identical people-search sites are less useful than one good one.

Not accepted: tools whose main purpose is stalking, doxxing or bypassing access controls, paid services with no public description of what they do, and affiliate links.

## Writing the entry

- **description**: one sentence, at most 140 characters, ending with a full stop. Say what it is good for, not how great it is. Write it yourself. Do not paste text from the tool's site or from other lists.
- **pricing**: `free`, `freemium` (useful free tier, paid extras) or `paid`.
- **type**: `web`, `cli`, `extension`, `app` (desktop or self-hosted), `api`, `dataset` or `guide`.
- **account**: `true` if you need to sign up before it is useful.
- **region** (optional): a two-letter code (`EU`, `US`, `SK`, `CZ`, …) when the tool mainly covers one country or region.

## Pivots

Pivot URLs must be passive. They may query a service's own index, archive or database, but must not make that service actively scan, crawl or contact the target (no "scan this site now" links). Only use placeholders listed for the selector type in `data/pivots.json`.

## Checks

```bash
python scripts/validate.py
npm test
```

Both run in CI on every push and pull request.
