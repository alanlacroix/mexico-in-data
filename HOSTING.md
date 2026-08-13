# Production and release

The Mexico Brief is an Eleventy site on Cloudflare Pages. Production branch: `main`.

| Setting | Value |
|---|---|
| Root directory | repository root |
| Build command | `npm run release` |
| Output directory | `_site` |
| Node version | 20 or newer |

No Pages Function is required. Data and model credentials belong only in GitHub
Actions secrets; the Cloudflare build consumes committed, validated output and needs
no secret.

`_data/releaseManifest.json` defines every public HTML route, redirect, and required
file. The release gate rejects an undeclared HTML file, a missing redirect, an internal
link to a removed page, a malformed inline script, a local filesystem path, or a known
credential shape.

Run the production build locally with:

```sh
npm ci
npm run release
```

After a push, verify:

1. `/` and `/es/` return the current edition.
2. `/data/publication-status.json` identifies that exact edition.
3. A retired route such as `/economy.html` redirects to `/`.
4. `/feed.xml`, `/robots.txt`, and `/sitemap.xml` return 200.

Scheduled background refreshes use `[CF-Pages-Skip]`; only the daily publication
commit should trigger a full deploy. The independent watchdog verifies the live receipt
and retries one stale deployment.
