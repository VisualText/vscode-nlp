# Security policy

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.

- **Preferred:** [open a private security advisory](https://github.com/VisualText/vscode-nlp/security/advisories/new) on this repository.
- **Or email:** contact@visualtext.org

Please include what you did, what happened, and the extension version from the
Extensions view. A proof of concept helps but is not required to report
something.

Expect an acknowledgement within a week. If a report is confirmed, the fix ships
in the next release and the advisory is published once it is available on the
Marketplace.

## Supported versions

Only the latest version published to the VS Code Marketplace is supported. There
are no long-term support branches; fixes go out as a new patch release.

## What this extension does that is worth knowing

Reported honestly rather than left for you to discover, since some of it looks
alarming without context:

- **It downloads and runs a native binary.** The NLP++ engine (`nlp.exe` and its
  libraries) is fetched from GitHub releases in the
  [VisualText](https://github.com/VisualText) organisation and executed locally
  to analyse text. Analyzers are code, and running one runs it on your machine
  with your permissions.
- **It sends anonymous usage telemetry**, opt-out via `nlp.telemetry.enable` and
  also honoured through VS Code's own `telemetry.telemetryLevel`. Counts and
  version metadata only -- never file contents, file names, paths, the names of
  analyzers you create, or error message text. One deliberate exception: the
  names of analyzers and templates the extension itself ships are recorded when
  you run or create one, since those names are already public and knowing which
  examples get used decides which are worth maintaining. They are matched
  against the folders the extension downloads, so anything else is omitted
  rather than redacted. The full schema and the worker that receives it are in
  [`telemetry-worker/`](telemetry-worker/), and the categories are listed in the
  README.
- **It writes inside your workspace**, including a `.vscode/settings.json` for
  colourisation and analyzer output under the analyzer folder.

## Scope

Reports about the extension, the telemetry worker in this repository, and the
release pipeline are in scope.

The NLP++ engine itself lives in
[VisualText/nlp-engine](https://github.com/VisualText/nlp-engine); please report
engine issues there, or here if you are unsure which side a problem falls on.
