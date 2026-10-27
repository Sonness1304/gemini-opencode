# Kiểm tra bản xuất 27/10/2026

Workspace kiểm tra: `C:/AI/gemini-opencode`, tách riêng khỏi working tree Jarvis. Không gọi inference, không khởi động Go/queue/9router, không nhập hoặc xuất browser credentials.

| Exact command | Kết quả |
| --- | --- |
| `npm test` | exit 0; 12 PASS, 0 FAIL, 0 SKIP; queue, tool protocol và hai ca từ chối source không đúng pin |
| `npm run test:windows` | exit 0; 2 PASS, 0 FAIL, 0 SKIP; PowerShell và C# launchers dùng fixture, browser callback giả |
| `node tooling/gemini-session-go/patch.mjs C:/AI/gemini-opencode/.qa/gemini-web2api-go-64b2d2c549c37b91f4c3dcbacaa720f604eb69e1` | exit 0; đủ 62 upstream file hashes; recipe patch 13 source files rồi copy 8 Go bridge/test files |
| `go test ./... -count=1 -json` tại source đã patch | exit 0; 100 test/subtest PASS, 0 FAIL; `TestUploadProbe` SKIP vì không bật live upload probe; main package không có tests |
| `go build -trimpath -buildvcs=false -ldflags '-s -w' -o ../Gemini-Web2API-Go.exe .` tại source đã patch | exit 0; binary chỉ nằm trong `.qa/` bị Git ignore |

Node `v24.19.0`, npm `11.17.0`, Go `go1.26.8 windows/amd64`. Cache/module cache Go chỉ cấp trong tiến trình, dùng cache local đã có.

SHA-256 trong `source-manifest.json` áp dụng cho 20 files lấy từ Jarvis; bản xuất không dùng prototype untracked `scripts/gemini-go-fix/` hoặc thay đổi sync/OpenCode/Windows MCP đang dirty của owner khác. Cấu hình ví dụ chỉ giữ bốn alias chat và env reference, không sao chép toàn bộ project config hoặc quyền allow-all.

Việc xuất bản không tái nghiệm thu login/quota/media/multi-tool High-only. Lỗi handoff docs có sẵn ở repo Jarvis gốc không thuộc bộ tests tách riêng này; receipt gốc ghi riêng, không gộp thành PASS của toàn Jarvis.
