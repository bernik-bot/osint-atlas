# OSINT Atlas

[![Validate](https://github.com/skriptkiddy98x/osint-atlas/actions/workflows/validate.yml/badge.svg)](https://github.com/skriptkiddy98x/osint-atlas/actions/workflows/validate.yml)
![Static site](https://img.shields.io/badge/static-no%20build%20step-black)
![License](https://img.shields.io/badge/license-MIT-green)

**A curated, searchable catalogue of OSINT tools, plus a pivot board that turns one selector into dozens of ready-made lookups.** It is one static page with no backend, no tracking and no API keys.

**[Open OSINT Atlas](https://skriptkiddy98x.github.io/osint-atlas/)**

![Pivot board with an email address broken out into breach, account, code and search lookups](docs/pivot.png)

## Why

Long "awesome" lists are great for discovering tools and slow to use in the middle of an investigation. OSINT Atlas covers both needs:

- **Pivot**: paste a username, email, domain, IP, phone number, URL, image URL, crypto wallet, file hash or a name. The type is detected for you, the value is normalised (`00421 905/123-456` becomes `+421905123456`, `https://www.Example.com/x` becomes `example.com`), and you get the lookups an analyst would open next, grouped by purpose.
- **Catalogue**: 200+ hand-picked tools in 19 categories, each with a one-line description written for this project. Filter by free, no sign-up, open source or tool type, and share the filtered view as a link.

## Pivot board

| Selector | Example | What you get |
|---|---|---|
| Username | `torvalds` | WhatsMyName, 30+ direct profile URLs (social, code, gaming), exact-match searches |
| Email | `someone@example.com` | Have I Been Pwned, Gravatar (SHA-256 hashed in the browser), Epieos, Hunter, GitHub commits by author, PGP keys |
| Domain | `example.com` | RDAP/WHOIS, Certificate Transparency subdomains, DNS history, tech stack, reputation, Wayback, Google dorks |
| IP | `1.1.1.1`, IPv6 | ASN and owner, Shodan, AbuseIPDB, GreyNoise, VirusTotal, reverse IP |
| Phone | `+421 905 123 456` | Normalised to E.164, Epieos, Sync.ME, libphonenumber, WhatsApp/Telegram, search engines |
| URL / image URL | `https://…/photo.jpg` | Google Lens, Bing, Yandex, TinEye, archives, Safe Browsing, URLhaus |
| Name | `Jane Doe` | Exact-match and LinkedIn dorks, OpenSanctions, OpenCorporates officers, ICIJ Offshore Leaks |
| Wallet | `bc1…`, `0x…`, `T…` | Chain-specific explorers (BTC, ETH, TRON), wallet attribution, Chainabuse reports |
| File hash | MD5 / SHA-1 / SHA-256 | VirusTotal, MalwareBazaar, Hybrid Analysis, OTX, ThreatFox |

Each result also suggests **related pivots**: an email offers its domain and the handle before the `@`, and a URL offers its host. **Copy all as checklist** puts every link into a Markdown checklist for your case notes.

<p align="center"><img src="docs/pivot-mobile.png" alt="Pivot board on a phone" width="300"></p>

## Catalogue

![Catalogue filtered to free tools](docs/catalogue.png)

Search matches names, descriptions, categories, regions and tags. Category chips show live counts for the current filters. The view state is kept in the address bar (`#catalogue?cat=domain&free=1&type=cli`), so a filtered list can be bookmarked or sent to a colleague. Press <kbd>/</kbd> to jump to the search box and <kbd>Esc</kbd> to clear it.

The list leans towards tools that are maintained, free to start with and useful in Europe, including Slovak and Czech company registers and EU sources such as Copernicus, TED and the Transparency Register.

## Passive and private by design

- **No third-party requests.** The page loads only its own HTML, CSS, JS and JSON. A strict Content-Security-Policy (`default-src 'self'`) enforces it, so there are no fonts, analytics or favicons fetched from elsewhere.
- **Selectors stay in the tab.** They are never written to the URL, history, `localStorage` or cookies. Only catalogue filters go into the URL.
- **No referrer.** Every outbound link uses `rel="noopener noreferrer"`, so the services you open cannot see where you came from.
- **No scraping, no keys.** The app only builds links. Nothing is sent anywhere until you click one, and then only to that service.
- **No `innerHTML`.** The DOM is built with `createElement`/`textContent`, so data files cannot inject markup.

Opening a lookup still tells that service what you searched for. For sensitive work, use a separate browser profile, a VPN or Tor, and research accounts.

## Run it locally

No build step and no dependencies. Any static file server works:

```bash
git clone https://github.com/skriptkiddy98x/osint-atlas.git
cd osint-atlas
python -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` straight from disk does not work because browsers block `fetch()` on `file://` URLs.

## Project layout

```text
index.html               page shell, CSP, three views (Pivot, Catalogue, About)
assets/style.css         black theme, responsive down to 320 px
assets/js/selectors.js   type detection, normalisation, URL template expansion (no DOM, unit-tested)
assets/js/pivot.js       pivot board UI
assets/js/catalogue.js   catalogue search, filters and URL state
assets/js/main.js        data loading and routing
data/tools.json          the catalogue: categories and tools
data/pivots.json         selector types and lookup URL templates
scripts/validate.py      schema and consistency checks for both data files
scripts/check_links.py   reports dead tool links
tests/                   Node test runner tests for selectors.js
```

## Add a tool or a pivot

A tool is one JSON object in `data/tools.json`:

```json
{
  "name": "crt.sh",
  "url": "https://crt.sh",
  "category": "domain",
  "description": "Certificate Transparency search. Every certificate ever issued for a domain, so subdomains too.",
  "pricing": "free",
  "type": "web",
  "account": false,
  "openSource": true
}
```

A pivot is a URL template in `data/pivots.json`. `{q}` is the normalised selector, and some types add extra placeholders such as `{sha256}` for email, `{digits}` and `{e164}` for phones, `{host}` for URLs or `{algo}` for hashes:

```json
{ "type": "domain", "group": "Reputation", "name": "VirusTotal", "url": "https://www.virustotal.com/gui/domain/{q}" }
```

Before opening a pull request:

```bash
python scripts/validate.py      # data format, categories, placeholders, duplicates
npm test                        # detection and URL building (Node 20+)
python scripts/check_links.py   # optional: are the tool URLs still alive?
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the inclusion criteria.

## Use it responsibly

Public information is not a free-for-all. Have a lawful purpose, collect only what you need, and follow privacy law such as the GDPR. Face search and people-search services in particular are legally sensitive in the EU.

## Credits

Inspired by [awesome-osint](https://github.com/jivoi/awesome-osint) by jivoi and contributors, the much larger community list. OSINT Atlas is an independent selection: no list entries or descriptions were copied, and every description was written for this project.

## License

[MIT](LICENSE)
