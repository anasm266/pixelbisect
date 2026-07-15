# PixelBisect

PixelBisect is a local visual-regression forensics CLI. Give it a known-good Git commit, a known-bad commit, a page URL, and one CSS selector; it uses Git's native bisect machinery to find the first commit where that element became visually different, then produces a self-contained HTML evidence report.

> Visual testing catches tomorrow's regressions. PixelBisect finds yesterday's.

PixelBisect runs entirely on your machine. It has no runtime AI, account, database, hosted backend, or paid service.

## Built with Codex

Codex with GPT-5.6 was the primary development agent for PixelBisect. It accelerated the work from product scoping through TypeScript implementation, adversarial test design, Windows process-cleanup debugging, npm packaging, and visual inspection of the final report. The core build session's `/feedback` ID is the development audit trail to include with the Build Week submission.

The most important decisions made during that collaboration were to:

- Use native `git bisect run` with first-parent history instead of maintaining a custom search algorithm
- Protect the active checkout with one detached worktree and treat interruption cleanup as a product feature
- Keep the demo deliberately narrow and prove it against a generated 64-commit deterministic fixture
- Make the offline HTML report—not a hosted dashboard—the product's visual UI
- Require five consecutive full investigations, clean-clone tests, tarball installation, and rendered visual QA before calling the project complete

Codex and GPT-5.6 are development tools here, not runtime dependencies. PixelBisect does not send repository code or screenshots to an AI service and requires no API key.

## What it produces

One command performs endpoint verification, automated bisection, adjacent final captures, and report generation:

```bash
pixelbisect run pixelbisect.config.json
```

The terminal shows the current commit and phase, each `GOOD`/`BAD` verdict, the changed-pixel percentage, estimated remaining comparisons, and elapsed time. When the run finishes, PixelBisect prints the culprit commit and the absolute path to an offline report.

The report is PixelBisect's visual UI. It contains:

- Culprit and last-good commit metadata
- A mouse- and keyboard-controlled before/after slider
- A highlighted pixel-difference image and changed-pixel statistics
- The tested commits and total duration
- The investigation configuration
- An HTML-escaped Git diff between the adjacent last-good and first-bad commits

All images and scripts are embedded in one HTML file; no report server or network connection is required. There is deliberately no live web dashboard.

## Requirements and platforms

- Node.js 20 or newer
- Git
- npm
- Playwright's Chromium browser binary

Windows 10/11 is the primary and fully verified demo platform; PixelBisect uses Windows process-tree termination there. macOS and Linux use POSIX process-group cleanup and are expected to work where the Node.js, Git, npm, and Playwright requirements are available, but they are not part of the current release verification matrix.

## Installation

### From source

After downloading or cloning the source repository:

```bash
cd pixelbisect
npm ci
npm run build
npm link
pixelbisect install-browser
```

`npm link` exposes the local build as the `pixelbisect` command. You can instead run `node /absolute/path/to/pixelbisect/dist/cli.js` without linking it.

### As an npm dependency

Once a release is published to the npm registry, install it in the project from which you will run investigations:

```bash
npm install --save-dev pixelbisect
npx pixelbisect install-browser
npx pixelbisect run pixelbisect.config.json
```

For a packaged but unpublished build, replace `pixelbisect` with the tarball path:

```bash
npm install --save-dev /path/to/pixelbisect-0.1.0.tgz
npx pixelbisect install-browser
npx pixelbisect run pixelbisect.config.json
```

The npm registry publication and public source repository are separate release steps. A downloaded source tree or generated tarball works without either one. On Linux hosts that lack Chromium system libraries, use `npx pixelbisect install-browser --with-deps` instead.

## Configuration

Copy [`pixelbisect.config.example.json`](./pixelbisect.config.example.json) to `pixelbisect.config.json` and edit it for the repository under investigation. Relative `repoPath` values are resolved from the directory containing the configuration file.

```json
{
  "repoPath": "./demo-fixture",
  "goodCommit": "visual-good",
  "badCommit": "visual-bad",
  "installCommand": "npm ci",
  "buildCommand": null,
  "startCommand": "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
  "port": 4173,
  "readinessUrl": "http://127.0.0.1:4173/",
  "targetUrl": "http://127.0.0.1:4173/checkout",
  "selector": "#checkout-button",
  "viewport": {
    "width": 1280,
    "height": 720
  },
  "startupTimeoutMs": 15000,
  "captureTimeoutMs": 10000,
  "pixelColorThreshold": 0.1,
  "maxChangedPixelPercent": 0.5
}
```

| Field | Required | Default | Meaning |
| --- | --- | --- | --- |
| `repoPath` | Yes | - | Local Git working-tree path, relative to the config file when not absolute. |
| `goodCommit` | Yes | - | Known-good commit, tag, or branch. It must be an ancestor of `badCommit`. |
| `badCommit` | No | `HEAD` | Known-bad commit, tag, or branch. |
| `installCommand` | Yes | - | npm dependency-install command run in the temporary worktree when the lockfile fingerprint changes. |
| `buildCommand` | No | `null` | Optional build command. Use `null` or omit it when the start command performs the needed compilation. |
| `startCommand` | Yes | - | Long-running foreground application-server command. It must stay attached and listen on `port`. Prefer a strict/fixed-port option. |
| `port` | Yes | - | Integer from `1` through `65535`. PixelBisect refuses to start if it is occupied. |
| `readinessUrl` | Yes | - | HTTP(S) URL polled until the application returns a successful response. |
| `targetUrl` | Yes | - | HTTP(S) page URL opened in Chromium for capture. |
| `selector` | Yes | - | CSS selector for the single element to capture. The first matching element must become visible. |
| `viewport.width` | No | `1280` | Chromium viewport width in CSS pixels (`1`-`7680`). |
| `viewport.height` | No | `720` | Chromium viewport height in CSS pixels (`1`-`4320`). |
| `startupTimeoutMs` | No | `15000` | Maximum wait for server readiness (`100`-`600000` ms). |
| `captureTimeoutMs` | No | `10000` | Maximum navigation, selector, and screenshot wait (`100`-`600000` ms). |
| `pixelColorThreshold` | No | `0.1` | Per-pixel color tolerance passed to pixelmatch (`0`-`1`). Higher values ignore more color variation. |
| `maxChangedPixelPercent` | No | `0.5` | Maximum changed-pixel percentage still considered `GOOD` (`0`-`100`). A larger value is more tolerant. |

`pixelColorThreshold` and `maxChangedPixelPercent` solve different problems: the first decides whether an individual pixel changed; the second decides whether enough pixels changed to classify the commit as bad.

## Reproducible demo

From a source checkout of PixelBisect:

```bash
npm ci
npm run build
npm link
pixelbisect install-browser
npm run fixture:generate -- ./demo-fixture
Copy-Item pixelbisect.config.example.json pixelbisect.config.json
pixelbisect run pixelbisect.config.json
```

On macOS or Linux, replace the `Copy-Item` line with:

```bash
cp pixelbisect.config.example.json pixelbisect.config.json
```

The fixture generator creates a deterministic Vite repository with a linear 64-commit history, stable lockfile and selector, `visual-good` and `visual-bad` tags, and one planted CSS regression. The example configuration watches `#checkout-button` at `/checkout`.

Run artifacts are stored outside the investigated repository at:

```text
<operating-system temp directory>/pixelbisect-runs/<run-id>/
```

The CLI prints the exact absolute report path, ending in `report.html`. Run artifacts and temporary worktree operations therefore are not written into the investigated repository.

## How it works

1. PixelBisect validates the configuration, resolves both Git references to full hashes, verifies ancestry, and counts the selected first-parent range.
2. It creates a detached temporary [Git worktree](https://git-scm.com/docs/git-worktree), leaving the active checkout and uncommitted files alone.
3. It captures the good endpoint as the baseline, captures the bad endpoint, and refuses to bisect unless the endpoints have a detectable difference.
4. It starts native [Git bisect](https://git-scm.com/docs/git-bisect) with `git bisect start --first-parent`, then invokes `git bisect run` with an internal visual evaluator. Exit code `0` marks a commit good, `1` marks it bad, and infrastructure failures abort the run.
5. At each selected commit, it reuses installed dependencies while the package lockfile is unchanged, optionally builds, starts the server, polls its readiness URL, and captures the configured element with [Playwright Chromium](https://playwright.dev/docs/screenshots).
6. [pixelmatch](https://github.com/mapbox/pixelmatch) and pngjs compare the candidate against the baseline without resizing either image. The server process tree is stopped and the port released before another commit is tested.
7. PixelBisect captures the culprit and its first-parent predecessor again as the final adjacent pair, collects commit metadata and the Git diff, and writes the self-contained report.
8. Success, handled errors, timeouts, and interruption all enter cleanup, resetting bisect state, stopping child processes, and removing the temporary worktree.

The classification assumes a monotonic transition: commits are visually good up to one boundary and remain bad afterward.

## Safety

> **Run PixelBisect only against repositories you trust.**

PixelBisect executes the configured installation, build, and server commands from historical commits. A detached worktree protects your active checkout, but it is not a security sandbox. Historical repository code has the same OS access as the user running PixelBisect. Containerized execution is not implemented.

The HTML report embeds screenshots, which may contain application data. PixelBisect does not intentionally include environment variables, cookies, tokens, or browser storage, but review a report before sharing it.

## Current scope and limitations

PixelBisect intentionally supports a narrow, reliable investigation shape:

- Local Node.js/JavaScript repositories using npm
- Chromium only
- One route, selector, and viewport per run
- Linear first-parent history between one good and one bad endpoint
- A monotonic visual regression that remains present after introduction
- Selected commits that can all install, build, start, and render; automatic commit skipping is not implemented
- Deterministic, unauthenticated pages without interaction scripts, remote data, or changing content

It does not analyze merge-graph side branches, map computed CSS properties to exact source lines, test multiple browsers or elements, run in GitHub Actions, host reports, or fix regressions automatically. It also does not sandbox repository commands. Monorepos and non-npm package managers are outside the current demo scope.

## Troubleshooting

### Chromium executable is missing

Install the browser version required by the local Playwright dependency:

```bash
npx pixelbisect install-browser
```

### The configured port is occupied

Stop the existing process or choose a different port. Update `port`, both URLs, and the fixed port in `startCommand` together. Keep Vite's `--strictPort` flag so it cannot silently select another port.

### Server readiness times out

Run `startCommand` manually in the target repository and verify that `readinessUrl` returns a successful HTTP response. Increase `startupTimeoutMs` for genuinely slow historical builds. Server logs are retained in the run artifact directory printed by the CLI.

### The selector cannot be captured

Open `targetUrl` and confirm the selector matches a visible element at that commit. PixelBisect does not log in, click through UI, or wait for custom application state. Increase `captureTimeoutMs` only when the page is deterministic but slow.

### Good and bad endpoints are visually identical

Confirm the refs, route, and selector. If a small real change is being tolerated, reduce `maxChangedPixelPercent` or `pixelColorThreshold`. PixelBisect intentionally stops before bisection when the configured endpoints do not establish a bad visual boundary.

### Screenshot dimensions do not match

PixelBisect never resizes evidence. The watched element must have the same rendered width and height across the selected range; choose a stable enclosing selector if necessary.

### A historical install, build, or server command fails

The demo scope requires all selected commits to be runnable. Narrow the endpoints to a compatible range or provide commands and a Node.js version that work across the full range. PixelBisect does not silently skip an untestable commit.

## Development and tests

```bash
npm ci
npm run build
node dist/cli.js install-browser
npm run test:unit
npm run test:integration
npm run test:e2e
npm test
```

Tests use Node's built-in test runner and are serialized where they share ports or temporary Git repositories. To inspect the package contents or create an installable tarball:

```bash
npm pack --dry-run
npm pack
```

The final demo gates can be rehearsed with `npm run reliability` (five consecutive investigations) and `npm run visual:qa -- /absolute/path/to/report.html`.

## Documentation

- [Git bisect documentation](https://git-scm.com/docs/git-bisect)
- [Git worktree documentation](https://git-scm.com/docs/git-worktree)
- [Playwright browser installation](https://playwright.dev/docs/browsers)
- [Playwright locators](https://playwright.dev/docs/locators)
- [Playwright screenshots](https://playwright.dev/docs/screenshots)
- [pixelmatch](https://github.com/mapbox/pixelmatch)

## License

MIT
