# Kết quả và giới hạn

Tổng hợp ngày 27/10/2026 từ receipts của pilot 24/10, source Jarvis `89468f1a3a7f423574bd6c57b03a0491a43fe0e6`. Kết quả lịch sử dưới đây không phải kiểm tra phiên/quota hiện tại.

## Kết quả lịch sử

| Kiểm tra | Kết quả và phạm vi |
| --- | --- |
| Account binding | Đã thử hai binding, xác minh danh tính trước import; transaction/readback và shared rotation có regression tests |
| Single-tool Go / Go SSE / 9router SSE | Có lượt PASS: call hợp lệ, nonce được tạo sau call, final khớp, stop; reported model High |
| OpenCode native read | Có lượt PASS: read completed, nonce khớp, final stop/session succeeded |
| Multi-tool chat mới/cũ | Có lượt đủ 6 calls và file/final khớp, nhưng reported model trộn Argon/Flash; không tính High-only |
| Chuỗi sau protocol fix | Có lượt premature final sau 4 calls, thiếu write/read và không tạo file dù client báo succeeded |
| Bridge JSON | Vẫn có `envelope_json`; không đủ raw evidence để gán chắc nguyên nhân cho từng lỗi lịch sử |
| Model guard cuối | Chặn explicit downgrade trước tool/output; hai pilot bị interrupt khi không có High result, không chứng minh chain đã đạt |
| Context preflight | Payload vượt byte budget trả 400 trước upload/SSE; không tăng native window |
| Go tests ở release cuối | Receipt lịch sử: 100 test/subtest PASS, exit 0; không phải 100 top-level tests |
| Node relevant suite lịch sử | Receipt lịch sử: 63 PASS, exit 0; gồm tests phụ thuộc Jarvis không được đưa hết vào repo tách riêng |

Source logic của guard nhận reported family Argon hoặc missing identity không đồng nghĩa đã chứng minh đúng mức High. Usage/counter local không phải native Google billing hay quota.

## Trạng thái runtime

Dự án runtime được người dùng **hủy ngày 26/10/2026**, không tự tiếp tục inference/nâng cấp. Xuất bản source ngày 27/10 không thay quyết định đó. Session expiry, reboot persistence, tự khôi phục đăng nhập, context 500k, độ ổn định multi-tool High-only và nghiệm thu đủ media vẫn **UNVERIFIED / NOT_ACCEPTED** theo từng ca.

## Nguồn nội bộ dùng để tổng hợp

Các tên dưới đây là path trong repo Jarvis gốc; không sao chép nguyên log/account metadata sang repo này:

- `docs/tooling/gemini-project-status.json` — quyết định hủy.
- `docs/tooling/gemini-web2api-go-pilot-20261024.md` — baseline, binding và launcher.
- `docs/tooling/argon-high-tool-acceptance-20261024.md` — single-tool roundtrip.
- `docs/tooling/argon-context-fix-20261024.md` — byte budget và consumer launcher.
- `docs/tooling/argon-bridge-chain-20261024.md` — latest chain failures/model guard.
- `docs/tooling/opencode.md` — alias/config pilot 2.1.4.

Kết quả kiểm tra lại cho **bản xuất này** được ghi riêng trong `docs/publication-checks.md`; không cộng với counts lịch sử.
