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

## Mô hình BOS 15 (vàng M15/M30, SL 10 · TP 15) — v4.4, 05/11/2026
- **Cách tìm:** kiểm tra mọi cấu trúc ICT/SMC trên M5/M15/M30 (research/struct15.mjs, sl10.mjs). Chỉ có "quét thanh khoản → BOS tiếp diễn + FVG" trên M15 và M30 đạt TP 15 / SL 10 giá mà có lời ở cả hai nửa năm.
- **Quy tắc:**
  1. Râu nến quét PDH/PDL, tuần, London, phiên Á hoặc swing.
  2. BOS cùng chiều cấu trúc swing của khung, có displacement và FVG.
  3. Limit mép FVG, SL 10 giá, TP 15 giá.
  4. Chờ khớp M15 2h, M30 3h. Mỗi khung giữ một lệnh riêng.
- **Kết quả 12 tháng:**
  - Tính một lần: 43 lệnh, 25 TP / 18 SL, thắng 58%, +347 USD (0.02 lot). 6 tháng trước +268 USD, 6 tháng gần +79 USD, 3 tháng gần thắng 67% (+186 USD).
  - Tua từng nến như máy chủ: 48 lệnh, thắng 52%, +240 USD.
- **Đã sửa lỗi:** đỉnh/đáy tuần trước bị tính sai khi máy chủ chỉ có một phần tuần, làm sinh ra lệnh "quét PWL" giả.

## Tua từng nến M15 27/10 → 05/11 (chart TradingView của người dùng) — mô hình 🔁 EMA hồi
- **Sóng giảm 106 giá (30/10):**
  1. EMA34 nằm dưới EMA89.
  2. Giá hồi chạm EMA34 lúc 12h15.
  3. Quét SSL, FVG giảm, BOS ↓ lúc 13h30.
  4. Hồi lần nữa sát EMA34 (cách 0.3 ATR) lúc 15h45, rồi sập với chuỗi FVG giảm.
- **Sóng tăng 122 giá (04/11):**
  1. EMA34 cắt lên EMA89 lúc 6h30.
  2. BSL sweep → MSS ↑ ngay tại EMA lúc 6h45.
  3. Hồi xuống dưới EMA lúc 7h30, BOS ↑ lúc 8h00, chạy +44 giá.
  4. Hồi lần nữa (dưới EMA34 khoảng 0.9 ATR) lúc 10h, rồi tăng 122 giá.
- **Quy tắc rút ra (tin-hieu/emapb.js):**
  1. EMA34/89 M15 theo xu hướng.
  2. Giá hồi chạm EMA34, không thủng EMA89 quá 1 ATR.
  3. MSS M5 theo xu hướng.
  4. Vào ngay, SL ngoài đáy/đỉnh hồi, TP 2R.
- **Tuần 29/10–05/11:** 16/23 lệnh TP, +1118 USD (0.02 lot).
- **12 tháng:** 968 lệnh (~20/tuần), thắng 34%, +2808 USD, nhưng 6 tháng trước +2752 USD còn 6 tháng gần chỉ +56 USD.
  - Mô hình chỉ thắng khi có xu hướng mạnh. Các bộ lọc xu hướng (khoảng cách EMA, EMA H1/H4) đều không tách được giai đoạn tốt.
  - Vì vậy chỉ ghi nhật ký, không gửi Telegram.
- **Bản siết chuỗi (emapb2):** bắt buộc quét SSL/BSL ở điểm hồi và có FVG M5 trong nhịp phá vỡ, rồi vào ngay.
  - 10 ngày gần: 17 lệnh, thắng 71%, +802 USD.
  - 12 tháng: 677 lệnh, thắng 35%, +3652 USD. 6 tháng trước +3660 USD, 6 tháng gần −8 USD.
  - Đã bật Telegram.
  - Vào limit tại FVG thì kém hơn: 12 tháng +196 USD với limit mép FVG, −42 USD với limit giữa FVG.

## Telegram chỉ gửi 🔁 EMA hồi trong giờ thắng cao (emapb3, 05/11/2026)
- **EMA hồi chuyển sang EMA34/89 M30:** 12 tháng 531 lệnh, thắng 38%, +2084 USD. Lời ở cả hai nửa năm, ổn định hơn bản EMA M15.
- **Giờ gửi Telegram (VN):** 0h, 8h, 11h, 12h, 14h, 17h, 20h, 21h — các giờ thắng ≥ 43%.
  - 12 tháng: 192 lệnh (~4/tuần), thắng 48%, +3630 USD (0.02 lot). 6 tháng trước +2611 USD, 6 tháng gần +1019 USD.
  - Lưu ý: các giờ này được chọn sau khi đã xem kết quả, nên có thể đẹp hơn thực tế.
- **Các mô hình khác** (⭐ Chuẩn, 🔎 Ghi nhận, 🌊 Sóng 15, 🎯 BOS 15) và EMA hồi ngoài các giờ trên: chỉ ghi nhật ký. Trên trang, các lệnh được gửi Telegram có dấu 📲.

## M5 gãy xu hướng (EMA34/89 M5) → vào ngược để giá test EMA34 M15 (kiểm 12 tháng, 2026-11-05)
- Lúc EMA34 M5 cắt EMA89 M5 ngược xu hướng M15, 99% số lần giá ĐÃ chạm/vượt EMA34 M15 rồi (EMA89 M5 ≈ EMA30 M15) → tín hiệu luôn đến muộn, không còn đường tới mục tiêu.
- Tín hiệu sớm hơn (giá M5 đóng cửa vượt EMA34 M5, giá còn cách EMA34 M15 ≥ 1 ATR, + quét + MSS + FVG): 280 lệnh, thắng 43%, TP TB 11 / SL TB 15 giá → −408$ (0.02 lot). Mọi biến thể đều lỗ cả năm; cách xa EMA hơn thì thắng còn thấp hơn (≥2 ATR: 26%).
- Kết luận: không dùng làm chiến lược. Giữ EMA hồi (vào cùng xu hướng sau khi giá đã hồi về EMA) như cũ.

## Khi nào giá quay lại test EMA34/89 M15 (12 tháng, 2026-11-05)
- Giá rời EMA34 M15 (đóng cửa cách ≥ 1 ATR) ~7.7 lần/ngày. Rời CÙNG xu hướng (EMA34 đúng phía EMA89): về EMA34 trong 1h 36% · 4h 76% · 12h 96%. Rời NGƯỢC xu hướng: về EMA34 chỉ 33% trong 4h nhưng về EMA89 87%.
- Trung vị: 105 phút về EMA34, ~2h về EMA89; trước khi về giá thường chạy thêm ~3 ATR. Giờ VN hay chạm EMA34 nhất: 06–08h và 18–21h.
- Đặt LIMIT mù tại EMA34 / giữa 34–89 / EMA89 theo xu hướng (mô phỏng M5, ematest3.mjs): thắng 41–44%, gần như mọi biến thể lỗ cả năm (vd EMA34 · SL 1 ATR · TP 1R: 1274 lệnh, −856$). Giá test EMA là gần như chắc, nhưng thường đâm xuyên qua EMA → cần chờ xác nhận M5 (quét → MSS → FVG) = EMA hồi/EA, không đặt limit sẵn.

## Bắt nhịp giá chạy VỀ EMA34 M15 bằng TP nhỏ (toema.mjs, toema-check.mjs, 2026-11-05)
- TP cố định 2–3 giá: thắng 74–78% nhưng SL phải ~8–10 giá → hoà/lỗ (TP 2 giá: −57…−547$; TP 3 giá tốt nhất +72$/năm).
- Tốt nhất (cụm ổn định, lời cả 2 nửa năm): xu hướng M15 (EMA34>EMA89 hoặc ngược lại), giá rời EMA34 M15 ≥ 0.8 ATR, cực trị M5 vừa QUÉT đỉnh/đáy swing, nến M5 NHẤN CHÌM quay đầu → vào nến sau, TP = EMA34 M15 − 2 giá, SL ngoài cực trị + 0.5. 1276 lệnh (4.9/ngày), thắng 38%, TP TB 14 / SL TB 7, +954$/năm (0.02 lot, spread 0.35), DD 482, thua liên tiếp 13.
- Cạnh rất mỏng: spread 0.5 → +520$, spread 0.7 → +47$. BTC cùng luật lỗ (−234$). Lời chủ yếu ở lệnh SELL. Chọn từ 752 cấu hình → có thiên lệch chọn lọc. Chỉ nên chạy thử ghi nhật ký, chưa dùng tiền thật.
