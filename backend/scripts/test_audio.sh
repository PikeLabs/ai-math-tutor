#!/usr/bin/env bash
# Quick smoke-test for the audio/image/ai API endpoints
set -euo pipefail

#
# Config
#
BASE="http://localhost:5001/api/v1"
BASE_CLEAN="${BASE%/}"        # remove trailing slash if present
ORIGIN="${BASE_CLEAN%%/api*}"

# Fixed / overridable session id for all calls in this script
# Note: Set to an existing sessionId in your local DB
SESSION_ID="cmewmpru90002o2jbvybo63lu"

# Default audio path (your local file)
AUDIO="../../audio_sessions/6c260c1f-7881-41a5-b2f6-cebd1b5f12b6/slide_1.wav"

OUTDIR="${OUTDIR:-./test_out}"
mkdir -p "$OUTDIR"

echo "BASE:      $BASE"
echo "ORIGIN:    $ORIGIN"
echo "SESSION_ID:$SESSION_ID"
echo "AUDIO:     $AUDIO"
echo "OUTDIR:    $OUTDIR"
echo

if [[ -f "$AUDIO" ]]; then
  echo "✅ Using audio file: $AUDIO"
else
  echo "❌ Audio file not found: $AUDIO"
  echo "   Set AUDIO=.../file.wav when running this script."
  exit 1
fi
echo

#
# 1) /chat (JSON)
#
echo "🧪 1) POST $BASE/chat (JSON)"
curl -sS -X POST "$BASE/chat" \
  -H 'Content-Type: application/json' \
  -H "Origin: $ORIGIN" \
  -d @- > "$OUTDIR/chat.json" <<JSON
{
  "sessionId": "$SESSION_ID",
  "selectedAssignment": "",
  "messages": [
    {"role":"user","content":"Hello VC, quick ping from the test script."}
  ],
  "slideNumber": 1
}
JSON
echo "✅ /chat ok -> $OUTDIR/chat.json"
echo

#
# 2) /chat/audio (multipart)
#
echo "🧪 2) POST $BASE/chat/audio (multipart)"
MSG_AUDIO="$(jq -c -n --arg c 'Audio test from script' \
  '[{"role":"user","content":$c}]')"

curl -sS -X POST "$BASE/chat/audio" \
  -H "Origin: $ORIGIN" \
  -F "sessionId=$SESSION_ID" \
  -F "selectedAssignment=" \
  -F "slideNumber=1" \
  -F "messages=$MSG_AUDIO" \
  -F "audio=@${AUDIO};type=audio/wav" \
  > "$OUTDIR/chat_audio.json"

echo "✅ /chat/audio ok -> $OUTDIR/chat_audio.json"
echo

#
# 3) /feedback/generate (JSON-only, no audio)
#
echo "🧪 3) POST $BASE/feedback/generate (JSON, no audio)"
curl -sS -X POST "$BASE/feedback/generate" \
  -H 'Content-Type: application/json' \
  -H "Origin: $ORIGIN" \
  -d @- > "$OUTDIR/feedback_noaudio.json" <<JSON
{
  "sessionId": "$SESSION_ID",
  "messages": [
    {"role":"user","content":"Generate feedback without audio."},
    {"role":"assistant","content":"Okay, noted."}
  ],
  "pdfUploadId": null,
  "pdfSlideCount": 3,
  "slideTimestamps": [
    {"slideNumber":1,"timestamp":0.0},
    {"slideNumber":2,"timestamp":5.0},
    {"slideNumber":3,"timestamp":10.0}
  ]
}
JSON
echo "✅ /feedback/generate (JSON) ok -> $OUTDIR/feedback_noaudio.json"
echo

#
# 4) /feedback/generate (multipart with audio + timestamps)
#
echo "🧪 4) POST $BASE/feedback/generate (multipart, audio + 3 slide timestamps)"
SLIDES_JSON='[{"slideNumber":1,"timestamp":0},{"slideNumber":2,"timestamp":5},{"slideNumber":3,"timestamp":10}]'
MSG_FB="$(jq -c -n --arg c 'Please generate feedback with audio.' \
  '[{"role":"user","content":$c}]')"

curl -sS -X POST "$BASE/feedback/generate" \
  -H "Origin: $ORIGIN" \
  -F "sessionId=$SESSION_ID" \
  -F "messages=$MSG_FB" \
  -F "selectedAssignment=" \
  -F "pdfUploadId=" \
  -F "pdfSlideCount=3" \
  -F "slideTimestamps=$SLIDES_JSON" \
  -F "qaTimestamps=" \
  -F "recording=@${AUDIO};type=audio/wav" \
  > "$OUTDIR/feedback_audio.json"

echo "✅ /feedback/generate (multipart) ok -> $OUTDIR/feedback_audio.json"
echo

#
# 5) Try to GET a saved audio segment if present
#
FIRST_AUDIO_URL="$(jq -r '(.structured // . | .slides // []) | map(.audio_url) | map(select(.!=null)) | .[0]' "$OUTDIR/feedback_audio.json" 2>/dev/null || true)"
if [[ -n "$FIRST_AUDIO_URL" && "$FIRST_AUDIO_URL" != "null" ]]; then
  # the server returned a relative /api path; prefix with ORIGIN
  FULL_URL="${ORIGIN%/}${FIRST_AUDIO_URL}"
  echo "🧪 5) GET first audio segment: $FULL_URL"
  curl -sS -X GET "$FULL_URL" -o "$OUTDIR/seg1.wav"
  if [[ -s "$OUTDIR/seg1.wav" ]]; then
    echo "✅ Saved -> $OUTDIR/seg1.wav"
  else
    echo "⚠️  GET succeeded but file empty (check server logs)."
  fi
else
  echo "⚠️  No audio_url found in $OUTDIR/feedback_audio.json (maybe slicing/transcription was skipped)."
fi
echo

#
# 6) Optional: GET a slide image (will 404 unless you’ve generated images)
#
echo "🧪 6) (optional) GET slide image (may 404 if no PDF upload/images)"
IMG_URL="$ORIGIN/api/slide-image/demo-upload-xyz/1?type=thumbnail"
echo "GET $IMG_URL"
curl -i -sS "$IMG_URL" -o "$OUTDIR/slide1_thumb.bin" || true
echo

echo "🎉 Done. Inspect files in: $OUTDIR"
ls -lh "$OUTDIR"
