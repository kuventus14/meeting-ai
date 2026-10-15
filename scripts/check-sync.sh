#!/bin/sh
# 두 버전 폴더의 공통 파일이 같은지 확인한다. (engine.js, index.html, README.md 는 버전마다 다르다)
cd "$(dirname "$0")/.." || exit 1
status=0
for f in app.js recorder.js storage.js summary.js styles.css characters.js; do
  if ! cmp -s "meeting_gemini/$f" "meeting_openai/$f"; then
    echo "다름: $f"
    status=1
  fi
done
[ $status -eq 0 ] && echo "공통 파일이 모두 같아요."
exit $status
