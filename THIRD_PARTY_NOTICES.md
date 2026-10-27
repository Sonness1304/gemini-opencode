# Nguồn và giấy phép

Upstream: [zexadev/gemini-web2api-go](https://github.com/zexadev/gemini-web2api-go), pin `64b2d2c549c37b91f4c3dcbacaa720f604eb69e1`.

Giấy phép upstream là MIT; giữ nguyên tại [licenses/gemini-web2api-go-MIT.txt](licenses/gemini-web2api-go-MIT.txt). Manifest `tooling/gemini-session-go/source-hashes.json` kiểm đủ 62 files của ZIP nguồn trước khi recipe sửa file. Không áp recipe lên thư mục git clone có `.git/` hoặc source khác pin.

Mã bridge/queue/launcher và tests được xuất từ revision `89468f1a3a7f423574bd6c57b03a0491a43fe0e6` của J.A.R.V.I.S Agents. `source-manifest.json` ghi SHA-256 của từng file được sao chép; các thay đổi local ngoài phạm vi không được xuất.

Repo này không phân phối source/binary của OpenCode hay 9router. Hướng dẫn mô tả bản pilot đã kiểm trên OpenCode 2.1.4; không cam kết schema tương thích với mọi bản về sau. Không áp một giấy phép mới cho toàn bộ mã do người dùng sở hữu trong lần tổng hợp này.
