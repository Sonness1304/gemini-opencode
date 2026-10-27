# Sources and licensing

## Upstream application

The patch targets [zexadev/gemini-web2api-go](https://github.com/zexadev/gemini-web2api-go) at revision `64b2d2c549c37b91f4c3dcbacaa720f604eb69e1`.

The upstream application uses the MIT License. Its original copyright notice is preserved in [licenses/gemini-web2api-go-MIT.txt](licenses/gemini-web2api-go-MIT.txt). The patch recipe checks all 62 files in the pinned source archive before modifying the application. A Git clone with an additional `.git/` directory will not satisfy that exact file-list check.

## Export provenance

The bridge, queue, launchers, and existing tests were exported from J.A.R.V.I.S Agents revision `89468f1a3a7f423574bd6c57b03a0491a43fe0e6`. Unrelated local modifications and untracked prototypes were excluded.

`source-manifest.json` preserves the original SHA-256 values under `files`. The `exportedFiles` map records the current exported bytes, including English localization. `localModifications` explains differences; localization does not change the upstream source hashes used by the patch recipe.

Exact Chinese source anchors are represented as JavaScript Unicode escapes. A multibyte UTF-8 test character is represented as a Go Unicode escape. These values remain unchanged at runtime.

## Repository license

This repository is distributed under the [MIT License](LICENSE), as authorized by its owner. The original upstream MIT notice remains applicable to upstream material.

OpenCode and 9router source code and binaries are not distributed here. The configuration example describes the OpenCode 2.1.4 pilot schema; compatibility with other releases requires separate verification.
