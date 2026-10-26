#!/usr/bin/env bash
# Chạy máy quét lặp lại mỗi 5 phút trong một job GitHub Actions (LOOP_MIN phút), lưu nhật ký vào nhánh bot-data sau mỗi lần quét.
# Lý do: lịch cron của GitHub thường bị trễ 1–7 tiếng, chạy một lần rồi thoát sẽ bỏ lỡ tín hiệu M15.
set -u
END=$(( $(date +%s) + ${LOOP_MIN:-50} * 60 ))
push() {
  ( cd botdata && rm -rf .git && git init -q -b bot-data \
    && git config user.name "bot-tin-hieu" && git config user.email "41898282+github-actions[bot]@users.noreply.github.com" \
    && printf '# Dữ liệu bot tín hiệu\nTự động cập nhật bởi GitHub Actions. Web đọc signals.json.\n' > README.md \
    && git add -A && git commit -qm "Cập nhật tín hiệu $(date -u +%FT%TZ)" \
    && git push -q -f "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" HEAD:bot-data ) || echo "Lưu nhật ký lỗi"
}
while :; do
  node scanner/scan.mjs || echo "Lần quét lỗi"
  push
  [ $(( $(date +%s) + 300 )) -ge "$END" ] && break
  sleep 300
done
