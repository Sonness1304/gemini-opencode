# Setup guide

This guide reconstructs the experimental pilot. It is a manual reference, not an installer. Start with the offline tests before attempting a live configuration.

## 1. Check prerequisites

| Component | Required for |
| --- | --- |
| Node.js 22+ | Tests, patch recipe, and request queue |
| Go 1.26.8 | Rebuilding and testing the pinned upstream application |
| PowerShell 7 | Optional Windows launcher fixtures |
| .NET Framework C# compiler | Optional Windows web-launcher fixture |
| OpenCode | Client; configuration was tested with pilot version 2.1.4 |
| 9router | Local gateway; configure it separately |
| An authorized Gemini Web session | Live use only; never needed by the offline Node tests |

No `npm install` is needed: the Node scripts use built-in modules.

## 2. Run the local tests

From this repository:

```bash
npm test
```

On Windows with the optional prerequisites:

```powershell
npm run test:windows
```

These tests use synthetic fixtures and do not log in to Google or call a model.

## 3. Rebuild the pinned Go application

Download the [pinned source ZIP](https://github.com/zexadev/gemini-web2api-go/archive/64b2d2c549c37b91f4c3dcbacaa720f604eb69e1.zip) and extract it into a new, clean directory outside this repository.

The recipe requires the exact archive file list and SHA-256 values. Do not substitute a newer release, a previously patched directory, or a Git clone containing extra files.

From this repository, run the following PowerShell command, replacing the source path with your extracted directory:

```powershell
node tooling/gemini-session-go/patch.mjs C:/AI/build/gemini-web2api-go-64b2d2c549c37b91f4c3dcbacaa720f604eb69e1
```

Then, from the patched upstream directory:

```powershell
go test ./... -count=1
go build -trimpath -buildvcs=false -ldflags '-s -w' -o Gemini-Web2API-Go.exe .
```

The recipe runs once against clean source. To repeat a build, extract the archive into another new directory. Keep the existing runtime and its data intact.

## 4. Configure the local services

The pilot used these settings:

| Component | Address or setting |
| --- | --- |
| Go API and admin | `127.0.0.1:20831`; admin at `/admin/` |
| Request queue | `127.0.0.1:20832`; fixed upstream `127.0.0.1:20831` |
| 9router | `127.0.0.1:20128/v1` |
| Queue capacity | 8 active requests, 32 waiting |
| Queue deadlines | 120 seconds waiting, 240 seconds per active request |
| Go pilot limits | Concurrent 8, RPM 30, RPH 80, timeout 240 seconds |
| Argon prompt cap | 128000 UTF-8 bytes of serialized prompt |
| OpenCode timeouts | 420000 ms provider timeout; 390000 ms header timeout |

Configure Go using the pinned upstream application's documentation and your own authorized session. Keep secrets and account data outside this repository.

Configure a 9router OpenAI-compatible provider with the prefix `jgopilot`, pointing to:

```text
http://127.0.0.1:20832/v1
```

The key sent from 9router to the queue must match the Go key. The gateway key used by OpenCode is a separate 9router credential. Do not place either key in Git, shell arguments, screenshots, or issue reports.

Once Go is configured and running, start the queue from this repository:

```bash
node scripts/gemini-go-queue.mjs
```

The script obtains the key from the local Go admin endpoint in memory. It does not create a provider or establish a Google login session. Binding configuration also requires the pilot's authenticated admin/session interface; this export does not automatically enroll accounts.

## 5. Connect OpenCode

Merge [examples/opencode.example.json](../examples/opencode.example.json) into your project configuration, preserving your existing providers and settings.

Supply `JARVIS_GATEWAY_KEY` through your local secret-management mechanism. The example references the variable and contains no key value.

| OpenCode model alias | Gateway route |
| --- | --- |
| `jarvis/gemini-web-pro` | `jgopilot/gemini-3.1-pro` |
| `jarvis/gemini-web-pro-thinking` | `jgopilot/gemini-3.1-pro-thinking` |
| `jarvis/gemini-web-argon` | `jgopilot/gemini-4-argon-thinking-medium` |
| `jarvis/gemini-web-argon-thinking` | `jgopilot/gemini-4-argon-thinking` |

These are historical pilot aliases. Check your actual gateway catalog before selecting one. They do not establish upstream model identity or current availability.

For the pilot client:

```powershell
opencode run --model jarvis/gemini-web-argon-thinking --format json
```

Provide a prompt using your client's supported input method. Check `opencode --version` and `opencode run --help` when using another release. The example does not require `--auto` or a global allow-all tool rule.

The historical Canvas/Image/Music/Video routes are excluded from the chat example. They returned media or HTML inside text content and were not fully accepted as four working media features.

## Optional Windows launcher references

- Place `start-gemini-go.ps1` beside the Go binary in `C:\AI`. Configuration and data are expected under `%LOCALAPPDATA%\Jarvis\gemini-web2api-go-pilot`.
- The startup script checks the historical binary SHA-256. A source build can produce a different executable hash. Verify the source and build before updating your local pin; keep the hash check.
- `start-gemini-go-queue.ps1` verifies listener ownership and does not take over another application's port.
- `test-gemini-session.ps1` checks session status without generation.
- The historical C# web launcher opens admin through the OS URL handler. If a specific Chrome profile is required, open the admin URL using that verified profile instead.
- These scripts are not installers. They do not create a configuration, database, account binding, or Google login.

## Optional live diagnostic

`scripts/pilot-gemini-tool-roundtrip.mjs` calls a real model through `go` or `9router`. It is excluded from `npm test`.

Run it only when live inference is intended and a process-scoped key has been supplied through `GEMINI_TOOL_PILOT_KEY` or `JARVIS_GATEWAY_KEY`. It requires a valid tool call, generates a random nonce after that call, and checks the exact final answer. HTTP 200 alone cannot pass the diagnostic.

For common errors, see [Troubleshooting](troubleshooting.md).
