# Publication checks

Date: **October 27, 2026**. Export workspace: `C:/AI/gemini-opencode`, isolated from the original Jarvis working tree.

No live model inference, service startup, or browser credential import/export was performed for publication.

## Initial source export

| Exact command | Result |
| --- | --- |
| `npm test` | Exit 0; 12 passed, 0 failed, 0 skipped; queue, tool protocol, and two patch-source rejection cases |
| `npm run test:windows` | Exit 0; 2 passed, 0 failed, 0 skipped; PowerShell and C# fixtures with mocked browser callbacks |
| `node tooling/gemini-session-go/patch.mjs C:/AI/gemini-opencode/.qa/gemini-web2api-go-64b2d2c549c37b91f4c3dcbacaa720f604eb69e1` | Exit 0; all 62 source hashes accepted; 13 upstream files patched and 8 Go bridge/test files copied |
| `go test ./... -count=1 -json` in the patched application | Exit 0; 100 test/subtest passes, 0 failures; `TestUploadProbe` skipped because no live upload probe was enabled; main package has no tests |
| `go build -trimpath -buildvcs=false -ldflags '-s -w' -o ../Gemini-Web2API-Go.exe .` in the patched application | Exit 0; output remained under ignored `.qa/` |

Environment: Node `v24.19.0`, npm `11.17.0`, Go `go1.26.8 windows/amd64`. Go cache paths were set only for the checking process.

## Source integrity

Twenty original files were copied from the pinned Jarvis revision. Original hashes remain in `source-manifest.json`; current export hashes and localization changes are recorded separately.

The export excludes the untracked Go prototype, unrelated dirty Windows MCP/OpenCode synchronization changes, account databases, credentials, sessions, and prebuilt executables. The OpenCode example contains four chat aliases and an environment reference, with no global allow-all permission rule.

## English presentation update

Authored documentation and user-facing launcher messages were rewritten in English. Unicode escapes preserve exact upstream patch anchors and the multibyte context test value. The update adds an architecture guide, troubleshooting/FAQ, contribution and security guidance, a changelog, MIT licensing, and a Node/Windows CI workflow.

Fresh verification of the English update:

| Exact command | Result |
| --- | --- |
| `npm test` | Exit 0; 14 passed, 0 failed, 0 skipped; includes exported-source hashes and local documentation links |
| `npm run test:windows` | Exit 0; 2 passed, 0 failed, 0 skipped; includes English launcher-error assertions |
| `node tooling/gemini-session-go/patch.mjs C:/AI/gemini-opencode/.qa/english/gemini-web2api-go-64b2d2c549c37b91f4c3dcbacaa720f604eb69e1` | Exit 0 against a new extraction of the pinned archive |
| `go test ./... -count=1 -json` in that new patched source | Exit 0; 100 test/subtest passes, 0 failures, 1 skipped live upload probe |
| `go build -trimpath -buildvcs=false -ldflags '-s -w' -o ../Gemini-Web2API-Go.exe .` in that source | Exit 0 |

CI results belong to their own GitHub run and revision. The workflow runs offline Node tests on Linux and Windows, plus launcher fixtures on Windows. It does not run live inference or claim to repeat the Go build.

## Verification boundaries

Publication does not revalidate login, quota, media, or High-only multi-tool reliability. The original Jarvis handoff suite had three pre-existing documentation failures; those are outside this standalone repository's tests and are not reported as a whole-Jarvis pass.
