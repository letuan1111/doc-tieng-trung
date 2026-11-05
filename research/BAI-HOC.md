# Bài học về cách giá chạy — V4 (M15 · M30 · H1), 05/11/2026

Dữ liệu: nến OKX 12 tháng (25/10/2025 → 05/11/2026) của XAU, BTC, ETH. Có 578 setup "quét PDH/PDL → MSS có displacement → FVG".
Mỗi setup ghi lại bối cảnh giá lúc xuất hiện: phiên, EMA34/89 (khung vào, H1, H4), độ sâu cú quét, độ mạnh sóng phá, ngày đã chạy bao nhiêu % ADR.
Cách học: chọn quy tắc trên 6 tháng gần (XAU+BTC), sau đó xem quy tắc có còn đúng ở 6 tháng trước và trên ETH không.
Lệnh ở đây là **R/lệnh**. TP = 2R, đã trừ spread.

## Quy luật chung (đúng ở cả hai nửa năm)
- **Quét PDH dễ là phá giả.** PDH bị phá giả ~61% số lần, PDL ~46%. Ở M15, SELL sau quét PDH dương cả hai nửa (+0.03 / +0.32R). BUY sau quét PDL âm cả hai nửa.
- **Đi cùng EMA34/89 H4 thì tốt hơn.**
  - M15: cùng chiều +0.16 / +0.08R; ngược chiều −0.44 / −0.02R.
  - H1: lọc theo EMA H1 cùng chiều dương cả hai nửa.
- **Phiên London (13h–19h VN) tốt nhất cho M15.** Phiên Á (7h–13h) kém nhất. Giá chạy mạnh nhất lúc 19h–22h và 7h–9h, lặng nhất 3h–5h.
- **Sóng phá quá dài (>6 ATR) thường thua.** Giá đã đi hết, vào là đuổi.
- **M30 là khung ổn định nhất:** mọi biến thể entry đều dương ở cả hai nửa. Đẹp nhất khi cú quét sâu 0.5–1.5 ATR.
- **Đa số tín hiệu không khớp:** ~60% hết hạn hoặc chạm TP trước khi giá về entry. FVG M15 bị lấp hết 82% số lần, chỉ 13% giữ được sau khi chạm CE.
- **Phiên Á ít khi đảo chiều:** London quét đỉnh/đáy phiên Á 79% số ngày, nhưng chỉ 38% là đảo chiều thật.

## Cách vào lệnh V4 (đang chạy trên trang tin-hieu)
| Khung | Điều kiện | Entry | SL |
|---|---|---|---|
| M15 | EMA34/89 H4 cùng chiều, ngoài phiên Á | mép FVG | ngoài đỉnh/đáy quét + 0.5 ATR |
| M30 (dựng từ M15) | mọi setup, 2 chiều | giữa FVG (CE) | + 1 ATR |
| H1 | chỉ SELL sau quét PDH | mép FVG | + 1 ATR |

- Nhiều khung cùng chiều thì chọn entry giá đẹp nhất. Mỗi cặp chỉ giữ một lệnh. TP 2R.
- Lệnh huỷ khi hết hạn chờ, khi giá chạm TP trước lúc khớp, hoặc khi giá đóng cửa vượt đỉnh/đáy bị quét.

## Kết quả tua từng nến M15 (giống máy chủ thật), lot cố định 0.02
| | 6 tháng trước (11/2025–05/2026) | 6 tháng gần (05–11/2026) |
|---|---|---|
| XAU | 23 lệnh · 6 TP / 14 SL / 3 hết giờ · −0.8R · +249 USD (DD 495 USD) | 12 lệnh · 6 TP / 4 SL / 2 hết giờ · +9.0R · +457 USD |
| BTC | 12 lệnh · 4 TP / 6 SL · +1.4R · −4 USD | 28 lệnh · 11 TP / 12 SL · +10.8R · +157 USD |
| ETH | 11 lệnh · +0.3R | 18 lệnh · +4.0R |

**Lưu ý trung thực:**
- 6 tháng gần là dữ liệu đã dùng để học, nên kết quả ở đó đẹp hơn thực tế.
- Ở 6 tháng trước, V4 gần hoà vốn (≈ +0.9R cho 3 cặp), kém bản V3 cũ (≈ +5.8R XAU+BTC).
- Bản phối cuối cùng được chọn sau khi đã nhìn cả hai nửa năm. Vì vậy không còn dữ liệu nào chưa dùng: thước đo thật duy nhất bây giờ là nhật ký ghi trực tiếp.

## Mỗi lệnh trong nhật ký ghi lại
Phiên và giờ VN, EMA khung vào/H1/H4 (cùng hay ngược chiều), độ sâu quét (ATR), sóng phá (ATR, số nến), cỡ FVG (ATR), ngày đã chạy (% ADR), giá lúc tín hiệu.
Sau vài tuần, chạy lại `research/ctxstats.mjs` trên nhật ký thật để học tiếp.
