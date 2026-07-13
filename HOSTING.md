# Production and release

The Mexico Brief is an Eleventy site hosted on **Cloudflare Pages**. The production
artifact is the generated `_site/` directory. Cloudflare Pages Functions compiles
the separate `functions/` directory and mounts it alongside that static artifact.

No page calls an LLM at request time. Data and narrative builders run before the
site build and commit reviewed JSON. A failed release gate must stop a deployment;
the last successful Pages deployment remains live.

## Exact Cloudflare Pages configuration

Use these values in **Workers & Pages → the project → Settings → Builds & deployments**:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | repository root (leave blank) |
| Build command | `npm run release` |
| Build output directory | `_site` |
| Functions directory | `functions` (auto-detected at repository root) |
| Node version | `20` |

Set `NODE_VERSION=20` as a build environment variable if the Pages project does not
already use Node 20. Do not set a deploy command; this is a Git-connected Pages
project, not a Wrangler direct-upload workflow.

The build command is intentionally the same command CI uses. It performs a clean
Eleventy build and then blocks publication on data-contract, route, link, SEO,
preview-isolation, local-path, or secret-leak failures.

## Cloudflare environment variables

Production Functions needs exactly these Beehiiv values:

| Variable | Scope | Treatment |
|---|---|---|
| `BEEHIIV_API_KEY` | Production | encrypted secret |
| `BEEHIIV_PUB_ID` | Production | encrypted secret or variable |

Do not put either value in a template, JSON file, `.env` committed to Git, or the
Cloudflare build command. Preview deployments should normally omit them, which
leaves the signup endpoint safely unconfigured instead of subscribing test traffic.

The data-refresh keys (`BANXICO_TOKEN`, `INEGI_TOKEN`, `FRED_API_KEY`,
`CENSUS_API_KEY`, `ANTHROPIC_API_KEY`, and Supabase credentials) belong in GitHub
Actions secrets only. The Pages build consumes committed, validated output and does
not need those keys.

## The release contract

[`_data/releaseManifest.json`](_data/releaseManifest.json) is the explicit source of
truth for:

- indexable public routes;
- compatibility redirects for retired routes;
- Cloudflare-only redirects for retired routes;
- isolated review/mockup routes;
- required static files and Pages Function endpoints; and
- source paths that may never enter the artifact.

The mockups and weekly sample remain available for review, but they are not in the
masthead or sitemap. Mockups carry an HTML `noindex` directive and every preview has
an `X-Robots-Tag: noindex, nofollow` rule in `_headers`. They are not production
navigation.

These paths are never part of the static release:

- `tmp/` and `private/`;
- `node_modules/`, source templates, pipeline code, docs, and Git metadata;
- `pipeline/.env` and any root `.env*` file;
- `data/email/` draft issues; and
- `data/source-snapshots/` raw audit captures.

`_site/` itself is generated, ignored by Git, and replaced from scratch on every
release. Runtime JSON under the rest of `data/`, the shared stylesheet and scripts,
`_headers`, `_redirects`, `robots.txt`, and `sitemap.xml` are copied or generated into
it deliberately.

## Local release check

Use a clean dependency install when reproducing CI:

```sh
npm ci
npm run release
```

`npm run release` performs:

1. deletion of the prior `_site/` directory;
2. an Eleventy build;
3. publication-contract unit tests and assembled-data validation;
4. an exact route and local HTTP smoke test;
5. internal `href`, `src`, and form-action resolution;
6. public title, description, canonical, robots, and sitemap checks;
7. preview/noindex and production-navigation isolation checks; and
8. an artifact scan for developer-machine URLs, local paths, and credential shapes.

The optional `npm run check-links` command checks external source URLs. It is kept
out of the deterministic release gate because government sites often block bots or
time out; it fails only on confirmed 404/410 responses.

## CI and deployment order

`.github/workflows/release-check.yml` runs the same release command on pull requests
and pushes to `main`. A successful run uploads the exact `_site/` artifact for 14
days so it can be inspected without rebuilding.

Cloudflare must also use `npm run release` as its build command. This matters because
scheduled data workflows can push directly to `main`: Pages then executes the full
gate itself, so an invalid data commit cannot replace the last good deployment even
if GitHub's separate release-check job is still running.

## First production verification

After connecting Pages and setting the production secrets, verify:

1. `/`, every masthead route, `/robots.txt`, and `/sitemap.xml` return 200;
2. retired `/data.html`, `/money.html`, and `/security.html` routes return their declared 301s;
3. `/api/subscribe` returns JSON with `configured: true` without exposing a key;
4. the mockup routes return `X-Robots-Tag: noindex, nofollow`; and
5. one controlled signup reaches the intended Beehiiv publication and sends the
   expected confirmation email.

No deployment or external Cloudflare setting is changed by the repository work in
this document.
