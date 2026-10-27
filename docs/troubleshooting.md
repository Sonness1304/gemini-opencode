# Troubleshooting and FAQ

Start by recording the client version, source revision, route, error code, and a small synthetic reproduction. Keep credentials and private prompts out of reports.

## Common symptoms

| Symptom | Meaning | Next step |
| --- | --- | --- |
| `source tree differs from pinned archive` | Missing or extra source files | Extract the exact pinned ZIP into a new directory; avoid Git clones and already-patched trees |
| `source hash mismatch` | Source bytes differ from the pin | Verify the archive revision; preserve the old directory and use a fresh extraction |
| `context_length_exceeded` | Serialized Argon prompt exceeds its byte budget | Reduce history/tool schemas or use a concise checkpoint; token metadata cannot enlarge the transport |
| `tool_bridge_invalid_reply` or `envelope_json` | Model output failed the action-plan contract | Reproduce with a minimal tool schema and synthetic prompt; prose is not a successful call |
| `model_downgraded` | Backend explicitly reported another model family | Inspect authorized upstream identity/quota evidence; do not hide it with a renamed alias |
| `queue_timeout` or queue full | Work could not enter the bounded queue in time | Check active/waiting counts; avoid replaying a mutation with an unknown outcome |
| `LOGIN_REQUIRED` | The Go session check did not accept the session | Inspect the authorized session setup; a logged-in Chrome tab alone does not prove Go has a valid session |
| `CHECK_UNCONFIRMED` | The session check could not establish a result | Check local connectivity and service health; a timeout does not prove logout |
| Success reported, but output file absent | The tool chain may have ended prematurely | Verify tool events, final content, and the actual filesystem result separately |
| Launcher rejects binary hash | Executable differs from the pinned pilot | Verify source/build, then update your own expected hash; retain the integrity check |

## Is this Google's official Gemini CLI?

No. It is an experimental Gemini Web2API Go adapter used through OpenCode and 9router.

## Can I run the tests without Google login?

Yes. `npm test` uses synthetic fixtures and built-in Node modules. It does not call a live model. Windows launcher tests also mock their service/browser callbacks.

## Does context 500k mean the backend accepts 500k tokens?

No. That value is historical OpenCode metadata. The pilot enforced a separate 128000-byte UTF-8 budget on serialized Argon prompts.

## Are the model aliases official product guarantees?

No. They are pilot route names. A selected alias, routed name, and reported upstream model are different pieces of evidence.

## Can I use this as a reliable production coding agent?

The pilot did not establish that level of reliability. Single-tool runs passed, but multi-tool chains also produced premature finals, malformed output, and mixed model reports. Read [Evidence](evidence.md) before deciding whether the adapter fits your use case.

## Does the repository restore my browser session automatically?

No. It contains no session credentials and does not automate account enrollment or login. Reboot persistence and automatic expiry recovery were not accepted.

## Why include a launcher that uses the default URL handler?

It is preserved as a historical reference. If your environment requires a particular browser profile, open admin with that verified profile instead. Its test mocks the browser callback and does not prove profile selection.

## What should I include in an issue?

Use the [bug-report template](../.github/ISSUE_TEMPLATE/bug_report.yml). Include exact versions, a synthetic reproduction, expected/actual behavior, and the smallest relevant error metadata. Never attach cookies, API keys, account databases, or raw private chat exports.
