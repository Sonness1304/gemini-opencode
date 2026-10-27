# Dựng bản pilot và nối OpenCode

Đây là quy trình tái dựng để tham khảo, chưa là bộ cài tự động. Việc xuất repo không thực hiện các bước chạy dịch vụ/inference bên dưới.

## Dựng Go với patch đã pin

1. Chuẩn bị Node.js 22+ và Go 1.26.8. Tải ZIP source tại [commit upstream đã pin](https://github.com/zexadev/gemini-web2api-go/archive/64b2d2c549c37b91f4c3dcbacaa720f604eb69e1.zip), giải nén thành một thư mục sạch ngoài repo. Không dùng git clone hoặc ZIP phiên bản khác: recipe kiểm exact file list/hash trước ghi.
2. Từ root repo này, chạy trong PowerShell; thay đường dẫn source bằng thư mục vừa giải nén:

```powershell
node tooling/gemini-session-go/patch.mjs C:/AI/build/gemini-web2api-go-64b2d2c549c37b91f4c3dcbacaa720f604eb69e1
```

3. Tại thư mục source đã patch, chạy:

```powershell
go test ./... -count=1
go build -trimpath -buildvcs=false -ldflags '-s -w' -o Gemini-Web2API-Go.exe .
```

Recipe chỉ chạy một lần trên source sạch. Muốn dựng lại, giải nén lại ZIP vào thư mục mới; không xóa bản đang dùng để ép recipe chạy.

## Runtime và thông số lịch sử

| Thành phần | Địa chỉ / giá trị pilot |
| --- | --- |
| Go | `127.0.0.1:20831`; admin `/admin/` |
| Queue | `127.0.0.1:20832`; upstream cố định `127.0.0.1:20831` |
| 9router | `127.0.0.1:20128/v1` |
| Queue | 8 active, 32 waiting, chờ 120 giây, request 240 giây |
| Go | concurrent 8, RPM 30, RPH 80, timeout 240 giây, max prompt 128000 bytes |
| OpenCode provider | timeout 420000 ms, header timeout 390000 ms |

9router phải có provider OpenAI-compatible prefix `jgopilot` trỏ đến queue `http://127.0.0.1:20832/v1`. Key dùng với queue phải khớp key Go. Gateway key của OpenCode là credential riêng của 9router. Không đưa key vào Git, command arguments hoặc ảnh chụp cấu hình. Provider setup và đăng nhập Google thực hiện riêng ở máy người dùng; bản xuất không kèm credential hay tự khôi phục phiên.

Sau khi Go đã được cấu hình và đang chạy, queue có thể chạy bằng `node scripts/gemini-go-queue.mjs`. Script chỉ lấy key từ local admin Go trong tiến trình. Nó không tạo provider hoặc đăng nhập Google.

## OpenCode

`examples/opencode.example.json` được rút từ schema **OpenCode 2.1.4 của pilot**. Sao chép và hợp nhất vào project của bạn, giữ các provider/config đang có. Đây không là cấu hình của Google Gemini CLI.

Key được tham chiếu qua biến môi trường `JARVIS_GATEWAY_KEY`. Cấp giá trị qua cơ chế quản lý secret của máy, không chép vào file mẫu. Chọn alias `jarvis/gemini-web-argon-thinking` hoặc một trong ba model chat còn lại. Ví dụ lệnh cho client pilot:

```powershell
opencode run --model jarvis/gemini-web-argon-thinking --format json
```

Truyền prompt theo cách được client hỗ trợ; kiểm `opencode --version` và `opencode run --help` trước khi dùng với bản khác. Không thêm `--auto` hoặc rule allow-all chỉ để làm theo ví dụ. Tool calling vẫn là emulation; OpenCode chịu trách nhiệm quyền và triển khai công cụ.

Canvas/Image/Music/Video từng có alias, nhưng không nằm trong mẫu chat này: chúng trả media/HTML dưới text và chưa được nghiệm thu đủ cả bốn chức năng.

## Launcher Windows giữ để tham khảo

- `start-gemini-go.ps1` cần đặt cạnh binary trong `C:\AI`; config/DB ở `%LOCALAPPDATA%\Jarvis\gemini-web2api-go-pilot`. Script giữ expected SHA-256 của binary đã build ngày 24/10. Binary tự build có thể khác hash: phải xác minh source/build rồi chỉnh pin tại bản riêng; không bỏ kiểm tra hash.
- `start-gemini-go-queue.ps1` kiểm ownership listener, không chiếm port của ứng dụng khác. `test-gemini-session.ps1` chỉ kiểm phiên và ghi trạng thái local, không gọi generation.
- `gemini-go-web-launcher.cs` là source launcher lịch sử: mở admin bằng URL handler mặc định. **Không dùng launcher này để bàn giao trình duyệt trong môi trường yêu cầu profile Chrome cụ thể.** Khi cần dùng trang admin, mở bằng Chrome profile đã xác minh từ metadata/UI; bản tổng hợp không thay browser settings hay tạo shortcut.
- Launcher không phải installer: không tự tạo DB/config/account bindings, không nhập password/cookie, không phân phối binary.

## Diagnostic có gọi model

`pilot-gemini-tool-roundtrip.mjs` có thể gọi model thật qua `go` hoặc `9router`; không nằm trong `npm test`. Chỉ chạy khi chủ máy chủ động giao inference và cấp key trong env (`GEMINI_TOOL_PILOT_KEY` hoặc `JARVIS_GATEWAY_KEY`). Nó xác nhận tool-call → nonce random sinh sau call → final exact; HTTP 200 đơn lẻ không đủ PASS.
