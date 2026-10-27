# Contributing

Thanks for taking an interest in Gemini × OpenCode. This is an experimental source archive, so contributions are most useful when they improve reproducibility, documentation, or a specific protocol contract.

## Before you start

Read the [architecture](docs/architecture.md) and [known limitations](docs/evidence.md). For substantial changes, open an issue describing the problem and a small reproduction before implementing a broader redesign.

Useful contributions include:

- A regression test for an incomplete or malformed tool exchange.
- Clearer setup instructions for a stated client/toolchain version.
- A focused fix for queue cancellation, deadlines, or response validation.
- A synthetic reproduction that distinguishes client status from actual tool completion.

Avoid claiming a higher model tier, larger native context, or production reliability from one successful request.

## Local workflow

```bash
git clone https://github.com/Sonness1304/gemini-opencode.git
cd gemini-opencode
git switch -c fix/describe-the-change
npm test
```

On Windows with PowerShell 7 and the .NET Framework compiler:

```powershell
npm run test:windows
```

Changes to Go patches should also be applied to a new extraction of the pinned archive, followed by `go test ./... -count=1` and a build. Keep the original archive manifest intact unless the change explicitly updates and verifies the upstream pin.

## Pull requests

Explain the concrete problem, resulting behavior, and exact checks you ran. Keep the diff focused, add a regression test when behavior changes, and write documentation, comments, and user-facing messages in English.

Distinguish fixture results from live-model evidence. Live checks must be deliberate, use authorized accounts, and exclude private data. Do not add automatic inference to the test suite.

Preserve third-party notices. If you modify an exported source file, update its hash in `source-manifest.json` under `exportedFiles` and document the modification. Preserve `files` as the original-source record.

## Sensitive reports

Do not post secrets or private account/session data in an issue or pull request. Follow [SECURITY.md](SECURITY.md) for security concerns.
