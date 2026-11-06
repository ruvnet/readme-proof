# README Proof

![README Proof animated introduction](https://raw.githubusercontent.com/ruvnet/readme-proof/main/docs/media/introduction.svg)

Check README portability and command risks before publishing a package. Get line numbered findings and a reviewable verification plan through a CLI, terminal view, browser or MCP server.

**Published prerelease: [`0.1.0-next.1`](https://www.npmjs.com/package/readme-proof/v/0.1.0-next.1).** Static analysis does not execute README commands or prove that an installation succeeds. No model API key is required.

## Quick start

Install the published prerelease:

```sh
npx readme-proof@0.1.0-next.1 analyze README.md --target npm
npx readme-proof@0.1.0-next.1 tui README.md
npx readme-proof@0.1.0-next.1 plan README.md
```

From a source checkout:

```sh
npm ci
npm run build
node dist/main.mjs analyze README.md --target github
node dist/main.mjs ui
```

The UI command serves locally. Use the built CLI to inspect local documentation. See [host setup](docs/hosts.md) for local plugin and MCP configuration.

## What it checks

The analyzer inspects Markdown for target dependent documentation issues and extracts command blocks with risk annotations. Findings identify the rule, severity, source line and explanation. It uses explicit local rules; it does not use an LLM to declare documentation correct.

Choose **npm** when the README will be displayed outside its repository, or **GitHub** for repository presentation. File inventory can improve checks where supported. Review each finding in context before editing.

![README Proof review boundary](https://raw.githubusercontent.com/ruvnet/readme-proof/main/docs/media/workflow.svg)

## Browser

[Watch the 28-second walkthrough](https://github.com/ruvnet/readme-proof/releases/download/v0.1.0-next.0/readme-proof-demo.mp4), made from actual product footage with editable native graphics and an instrumental soundtrack.

Serve this repository as static files and open `ui/`. Paste or upload a README, select the publication target, inspect findings and download JSON. The browser imports the same analyzer as the CLI. README text stays in the browser; the UI does not send it to an analysis API. Opening the HTML directly through a `file:` URL may block JavaScript module imports, so use an HTTP static server.

## MCP and skills

The local stdio MCP server exposes `readme_analyze` and `readme_plan`. Analysis receipts are addressable at `ruv://readme-proof/evidence/{sha256}`. A receipt records analysis; it does not certify successful execution.

This repository includes a reusable `readme-proof` skill, a portable Agent Plugins manifest, and Claude Code and Codex compatibility metadata. They are distributable source integrations, not marketplace listings or automatic installation into your account. [Installation and limitations](docs/hosts.md).

## Evidence containers

Export a JSON report with `readme-proof rvf REPORT.json OUT.rvf`, then inspect it with `readme-proof rvf-read OUT.rvf`. The adapter uses `@ruvector/rvf-wasm@0.1.9` to create a genuine RVF binary plus a mandatory `OUT.rvf.receipt.json` sidecar. Keep both files together. The binary stores a digest vector and the sidecar stores the report. Verification checks integrity, not authenticity, semantic similarity or correctness. Report-only CLI exports do not bind the original README bytes; their Markdown hash represents an empty input. MCP receipts generated from Markdown bind the supplied input bytes. An optional RVM deployment contract is described in [the deployment notes](docs/rvm.md); runtime execution requires separate validation.

## Release verification

Registry installation passed on Node.js 20 and 24, and 16 tests passed at the published source revision. Both README SVG URLs returned HTTP 200 with `image/svg+xml`. [Release receipt](docs/release-2026-10-11.md) · [GitHub release](https://github.com/ruvnet/readme-proof/releases/tag/v0.1.0-next.0) · [public report](https://gist.github.com/ruvnet/f3c6bac76f9a38d01328413a312b3bc2).

## Tests and benchmarks

Run `npm test` and `npm run benchmark`. One historical local run on October 11, 2026, before subsequent parser hardening, measured mean times of **16.64 ms uncached and 14.81 ms cached** per 1,000 identical analyses across ten alternating samples: **10.99% lower mean time**. The result is specific to repeated identical input and this run; it is not an algorithmic improvement or a general speed guarantee. Held out fixture equality checks passed. [Raw samples and limitations](docs/validation.md).

The optional evolution module calls the real `@metaharness/darwin@0.10.3` Pareto routine to compare supplied matched metrics. It returns proposals only. Autogenous integration is a contract representation, not an executed runtime. Synthetic tests and supplied metrics do not establish real reader usability or trusted performance evidence.

## Why this exists

The first run experience is a real product surface. A [public usability report on October 11, 2026](https://shkspr.mobi/blog/2026/10/i-paid-people-to-try-and-follow-my-readme/) describes broken links and missing assumptions found by real users. README Proof automates a bounded set of mechanical checks. Human comprehension and actual installation testing remain separate. [Design decision and sources](docs/adrs/ADR-0001-readme-proof.md). The factory also captured a [live discovery sweep](docs/discovery.md) with source digests and a frozen candidate plan.

MIT licensed. See [SECURITY.md](SECURITY.md) before sharing reports or testing untrusted instructions.
