# Sidesplitters Comedy - Automated Show Scraper

Automatically scrapes upcoming shows from OvationTix and displays them on the WordPress site.

## Architecture

```
OvationTix (Tampa + Wesley Chapel)
        |
        v
GitHub Actions (runs every 6 hours)
  - Puppeteer + Stealth plugin scrapes show listings
  - Writes docs/shows.json
  - Commits & pushes to main
        |
        v
GitHub Pages (serves docs/shows.json as static JSON)
        |
        v
WordPress Plugin (fetches JSON, caches it, renders via shortcode)
```

The scraper preserves the last successful data per-location -- if one location fails, the other still updates and the failed one keeps its previous data.

## JSON API

Hosted at: `https://<username>.github.io/<repo>/shows.json`

### Schema

```json
{
  "lastUpdated": "2025-01-15T12:00:00.000Z",
  "locations": {
    "<location-key>": {
      "id": "35578",
      "shows": [
        {
          "name": "Comedian Name",
          "dates": "Jan 17 - 18",
          "imageUrl": "https://...",
          "ticketUrl": "https://ci.ovationtix.com/..."
        }
      ]
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `lastUpdated` | ISO 8601 string | When the scraper last ran successfully |
| `locations` | object | Keyed by location slug (`tampa`, `wesley-chapel`) |
| `locations.*.id` | string | OvationTix venue ID |
| `locations.*.shows` | array | Shows in page order (upcoming first) |
| `shows[].name` | string | Show/performer name |
| `shows[].dates` | string | Date range as displayed on OvationTix |
| `shows[].imageUrl` | string | Promotional image URL |
| `shows[].ticketUrl` | string | Direct link to buy tickets |

Location keys are defined in `scraper/locations.json`.

## WordPress Plugin

### Installation

1. Zip the `wordpress-plugin/sidesplitters-shows/` folder
2. WordPress admin: **Plugins > Add New > Upload Plugin** > install and activate
3. **Settings > Sidesplitters Shows** > paste your GitHub Pages JSON URL

### Settings

| Option | Default | Description |
|--------|---------|-------------|
| Shows JSON URL | _(empty)_ | Full URL to your hosted `shows.json` |
| Cache Duration | `3600` (1 hour) | Seconds to cache the JSON. Minimum 300. |

Use the **Clear Cache** button on the settings page to force a fresh fetch.

### Shortcode

```
[sidesplitters_shows location="tampa" count="3"]
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `location` | `tampa` | Location key matching a key in the JSON (`tampa`, `wesley-chapel`) |
| `count` | `3` | Number of shows to display |

The plugin renders a `.sss-shows-grid` container with `.sss-show-card` elements. Each card links to the ticket URL and includes the show image, name, and dates. Styles are in `assets/shows.css`.

### Caching behavior

1. Checks WordPress transient cache (TTL from settings).
2. On cache miss, fetches the remote JSON.
3. On fetch failure, falls back to a persistent `wp_options` copy and re-caches it for 5 minutes to avoid hammering the remote.

## Local Development (Scraper)

```bash
cd scraper
npm install

# Normal run -- writes to docs/shows.json
npm run scrape

# Discovery mode -- also saves screenshots + HTML to scraper/screenshots/
npm run discover
```

Requires Node.js 20+ and a Chromium-compatible environment (Puppeteer downloads its own browser).

### Environment variables

| Variable | Values | Description |
|----------|--------|-------------|
| `DISCOVERY_MODE` | `true` / `false` | Saves full-page screenshots and raw HTML per location for debugging selectors |

## CI/CD Pipeline

Defined in `.github/workflows/scrape-shows.yml`.

**Schedule:** Runs on cron every 6 hours (`0 */6 * * *`) and on manual `workflow_dispatch`.

**Steps:**
1. Checks out the repo
2. Sets up Node.js 20 and installs Puppeteer system dependencies
3. Runs `npm ci` (or `npm install` as fallback) in `scraper/`
4. Executes `node scrape.js`
5. If discovery mode is enabled or the run fails, uploads screenshots as artifacts (retained 7 days)
6. If `docs/shows.json` changed, commits and pushes to `main` (auto-deploys via GitHub Pages)

**Manual trigger options:**
- `discovery_mode` (boolean) -- saves screenshots and HTML for debugging

The workflow has `contents: write` permission and a 5-minute timeout.

## Setup Guide

### 1. Create a GitHub repo

Create a new repo (private is fine) and push this code.

### 2. Enable GitHub Pages

Repo **Settings > Pages** > Source: **Deploy from a branch** > Branch: `main`, folder: `/docs` > **Save**.

Your JSON will be at: `https://<username>.github.io/<repo>/shows.json`

### 3. Run the scraper

**Actions** tab > **Scrape OvationTix Shows** > **Run workflow**. Check `discovery_mode` on the first run to verify screenshots look correct.

### 4. Install and configure the WordPress plugin

See the [WordPress Plugin](#wordpress-plugin) section above.

## Troubleshooting

**Scraper finds 0 shows:**
- Run with `discovery_mode` enabled and download the `discovery-screenshots` artifact from the Actions run. Check if OvationTix changed their DOM structure.
- The scraper also auto-saves screenshots on empty results (`<location>-empty.png/html`) and errors (`<location>-error.png/html`).

**WordPress shows nothing:**
- Verify the JSON URL in **Settings > Sidesplitters Shows** is correct and accessible in a browser.
- Check that `shows.json` actually contains show data (not empty arrays).
- Clear the plugin cache and reload.

**Stale data on the site:**
- The WordPress plugin caches for 1 hour by default. Click **Clear Cache** in settings or wait for the TTL to expire.
- Check the `lastUpdated` field in `shows.json` to confirm the scraper is running.

**GitHub Actions failing:**
- Check the Actions tab for error logs. Common issues: Puppeteer system dependency changes on newer Ubuntu runners, OvationTix blocking or timing out.
- The workflow has a 5-minute timeout. If OvationTix is slow, the run may time out without being a code issue.

**Fetch fails but site still shows data:**
- This is by design. The plugin falls back to the last successfully fetched data stored in `wp_options`. The scraper similarly preserves per-location data from previous successful runs.
