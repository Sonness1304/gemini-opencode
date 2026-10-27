# Evidence and limitations

Prepared on October 27, 2026 from the October 24 pilot receipts at J.A.R.V.I.S Agents revision `89468f1a3a7f423574bd6c57b03a0491a43fe0e6`.

Historical results describe particular runs. They do not verify a current session, quota, or model entitlement.

## Historical results

| Check | Observed result and scope |
| --- | --- |
| Account binding | Two bindings exercised with identity verification before import; transaction/readback and shared rotation have regression tests |
| Single-tool Go, Go SSE, and 9router SSE | Passing runs included a valid call, a nonce generated after the call, an exact final response, and stop; reported model High |
| Native OpenCode read | Passing runs included a completed read, exact nonce, final stop, and session success |
| Multi-tool chains in new and existing chats | Some runs completed six calls and matched file/final output, but reported models mixed Argon and Flash; not High-only acceptance |
| Chain after the protocol fix | One run ended after four calls without the required write/read or output file, even though the client reported success |
| Bridge JSON | `envelope_json` errors remained; available raw evidence could not establish a definite cause for every historical failure |
| Final model guard | Explicit downgrades blocked before tool/output emission; two pilots interrupted without a High result, leaving chain acceptance unverified |
| Context preflight | Oversized prompts returned HTTP 400 before upload/SSE; this did not increase the native context window |
| Final Go release tests | Historical receipt: 100 test/subtest passes, exit 0; not 100 top-level test functions |
| Relevant Node suite | Historical receipt: 63 passes, exit 0; included Jarvis-specific tests not all present in this standalone export |

Accepting a reported Argon family name, or an absent identity, does not prove the exact High tier. Local usage counters do not establish native Google quota or billing.

## Runtime status

The owner **cancelled runtime development on October 26, 2026**. Source publication does not resume inference or upgrades.

The following remain **UNVERIFIED / NOT_ACCEPTED**, depending on the case:

- Reliable High-only multi-tool chains.
- Session expiry and automatic login recovery.
- Reboot persistence.
- A real 500k-token backend context window.
- Complete media acceptance.
- Current account quota, availability, and model identity.

## Source receipts

These are source paths in the original Jarvis repository, not relative links in this export. Raw logs and account metadata were excluded.

| Original path | Role |
| --- | --- |
| `docs/tooling/gemini-project-status.json` | Cancellation decision |
| `docs/tooling/gemini-web2api-go-pilot-20261024.md` | Baseline, binding, and launchers |
| `docs/tooling/argon-high-tool-acceptance-20261024.md` | Single-tool round trips |
| `docs/tooling/argon-context-fix-20261024.md` | Byte budget and client launcher |
| `docs/tooling/argon-bridge-chain-20261024.md` | Latest chain failures and model guard |
| `docs/tooling/opencode.md` | Pilot aliases and OpenCode 2.1.4 configuration |

Fresh checks for this repository are recorded separately in [Publication checks](publication-checks.md). Historical and current counts are not combined.
