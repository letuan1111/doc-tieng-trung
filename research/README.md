# Nghiên cứu cách vào lệnh ICT/SMC (11/2025)

Dữ liệu: nến OKX M5/M15/H1 của XAU, BTC, ETH (12 tháng). Tải bằng `node research/fetch.mjs 375` (cần mạng tới OKX), lưu vào `research/data/` (không đưa lên git).

| File | Việc |
|---|---|
| `diag.mjs` | Lệnh của engine cũ/đang chạy bị SL vì sao (đuổi giá, SL sát, phiên, khoảng cách EMA…) |
| `engine2.mjs` | Engine nghiên cứu: sự kiện cấu trúc, setup A/B/C, 4 kiểu entry, mô phỏng |
| `learn.mjs` | Tua lại từng tháng (walk-forward), chọn cấu hình bằng dữ liệu quá khứ |
| `robust.mjs` | Độ bền của từng cấu hình qua các tháng, trên cả XAU và BTC |
| `holdout.mjs` | Kiểm tra trên 6 tháng chưa dùng để chọn + ETH |

Kết luận chính: các quy tắc ICT/SMC máy móc trung bình ≈ 0R/lệnh sau chi phí; M5 đứng riêng luôn lỗ; H1 ổn định nhất; quét PDH (phá giả ~61%) là quy luật mạnh nhất.
Cách vào lệnh rút ra được triển khai ở `tin-hieu/v3.js` (12 tháng: 66 lệnh, +14R, DD 4.9R — mẫu nhỏ, cần theo dõi thật qua nhật ký).
