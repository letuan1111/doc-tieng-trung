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

## Rà lại theo ICT/SMC chuẩn (05/11/2026, bản v4.1)
Đã thử bật đủ mô hình ICT cho M15/M30: bias cấu trúc H4, MSS trong killzone (London 14–17h, NY 19–23h VN), entry ở discount/premium của sóng, OTE 70.5%.
- **Bật đủ cả mô hình:** chỉ còn 4–8 lệnh/năm. M30 bị lỗ, nên quá chặt để dùng.
- **Bias bằng cấu trúc swing H4 thay EMA H4 cho M15:** cùng 30 lệnh, +8.2R thay vì +5.6R, dương ở mọi giai đoạn. **Đã áp dụng.**
- **Killzone bắt buộc:** làm kém cả M15 (+0.1R) lẫn M30 (+3.1R).
- **Ép entry ở nửa discount của sóng:** M15 còn +0.4R, M30 còn +5.1R, số lệnh giảm một nửa.
- **OTE 70.5%:** M15 ít lệnh hơn, lời gần như cũ; M30 bị lỗ.
- **M30 giữ mô hình đảo chiều quét PDH/PDL → MSS (turtle soup), không lọc bias.** Thêm bias cấu trúc H4 làm số lệnh giảm một nửa và lời giảm.

Tua từng nến bản v4.1 (0.02 lot):

| | 6 tháng trước | 6 tháng gần |
|---|---|---|
| XAU | 22 lệnh · 8 TP / 11 SL · +7.3R · +630 USD | 13 lệnh · 6 TP / 5 SL · +8.0R · +409 USD |
| BTC | 12 lệnh · 5 TP / 5 SL · +4.3R · +21 USD | 28 lệnh · 11 TP / 13 SL · +9.7R · +149 USD |
| ETH | 13 lệnh · −1.0R | 19 lệnh · +2.4R |

So với bản trước, XAU+BTC tăng từ +19.3R lên +29.3R, và 6 tháng trước không còn lỗ.

## Bản tốt nhất đưa lên link (v4.2, 05/11/2026)
- **Quy tắc:** v4.1, cộng chờ khớp lâu gấp đôi (M15 6h, M30 10h, H1 16h) và H1 cả BUY lẫn SELL.
- **TP:** giữ 2R. Đã thử TP theo thanh khoản đối diện (đích của con sóng). Đích này gần như luôn dưới 2R, nên kết quả như nhau. TP 3R làm thua nhiều hơn, TP 1.5R làm mất lời.
- **Tua từng nến, 0.02 lot:**
  - XAU 6 tháng trước: 26 lệnh · 10 TP / 12 SL · +10.3R · +1289 USD
  - XAU 6 tháng gần: 19 lệnh · 8 TP / 8 SL · +8.3R · +346 USD
  - BTC 6 tháng trước: 16 lệnh · 6 TP / 8 SL · +3.3R · −68 USD
  - BTC 6 tháng gần: 32 lệnh · 15 TP / 14 SL · +16.2R · +260 USD
- **Tổng 12 tháng** (XAU+BTC+ETH): +37R, dương ở cả 6 phần dữ liệu, sụt giảm tối đa khoảng 4R.

## Mọi sóng ≥ 15 giá vàng trên M5, 12 tháng (research/moves.mjs, 05/11/2026)
- **Số lượng:** 5163 sóng, tức 15 sóng/ngày, dài TB 34 giá trong ~1h45. Nhiều nhất lúc 19h–23h VN (New York) và 7h–8h.
- **Điểm bắt đầu:** 83% sóng bắt đầu ở một vùng thanh khoản. PDH/PDL 30%, đỉnh/đáy swing M15 29%, London 10%, PWH/PWL 10%, phiên Á 3%; 17% không quét gì.
- **Cấu trúc H1/H4 không cho biết chiều sóng 15 giá:** 50% cùng chiều, 50% ngược chiều.
- **Sóng lớn đến sau sóng ngược chiều nhỏ:** sóng trước nhỏ hơn thì sóng này dài TB 50 giá, 88% có MSS. Sóng trước lớn hơn thì sóng này chỉ là nhịp hồi, TB 24 giá.
- **Trước khi chạy:** 41% sóng có giá đi ngang hẹp (<3 ATR M15 trong 2h).
- **Mô hình xuất hiện trước:**
  - MSS M5 xuất hiện ở 50% sóng, trung bình sau 64 phút, lúc đó giá **đã chạy 61% sóng**.
  - 74% có FVG M5, nhưng chỉ **9%** hồi về CE FVG / 50% trước khi đi tiếp.
- **Xác suất nền:** sau khi quét PDH/PDL, 70% lần giá chạy ngược lại đủ 15 giá tính từ điểm quét; nếu có thêm MSS M5 thì 89–91%. Nhưng điểm quét chỉ biết sau khi đã qua.
- **Vào lệnh thật (sau MSS, SL ngoài điểm quét):**
  - Vào ngay khi MSS, TP 15 giá: thắng 52% nhưng lỗ, vì SL thường xa hơn 15 giá.
  - Limit 50% sóng gốc→MSS, TP 2R: 0.7 lệnh/ngày, +627 USD/năm (0.02 lot), nhưng 6 tháng gần −176 USD.
  - Limit CE FVG M5, TP 2R: 0.2 lệnh/ngày, có lời ở cả hai nửa năm (+55 USD / +217 USD).
  - Chưa có cách nào vừa nhiều lệnh vừa có lời ổn định.

## Kịch bản Sóng 15 (vàng M5) — tin-hieu/wave.js, đưa lên nhật ký + Telegram (05/11/2026)
1. Râu nến M5 quét PDH/PDL, đỉnh/đáy tuần trước hoặc đỉnh/đáy London, rồi đóng cửa quay lại trong ≤ 3 nến. Không dùng phiên Á, vì yếu.
2. MSS M5: đóng cửa vượt đỉnh/đáy swing M5 gần nhất trước cú quét, trong vòng 6 giờ, chưa phá cực trị quét.
3. Limit tại mép FVG M5 nằm giữa cực trị quét và nến MSS, chờ khớp 1 giờ.
4. SL ngoài cực trị quét + 0.3 ATR M15 + spread. TP = max(2R, 15 giá). Giữ lệnh tối đa 2 ngày.
- **Kết quả 12 tháng:** 58 lệnh (~1.2/tuần), 20 TP / 37 SL, thắng 34%, TP trung bình ~32 giá, +3.2R (+94 USD với 0.02 lot). Dương ở cả hai nửa năm, nhưng lợi thế mỏng.
- **Các cách khác đều kém:** thêm phiên Á, entry CE FVG, TP cố định 15 giá, TP 3R, SL +0.5 ATR.
