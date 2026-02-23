#!/bin/bash
# Smoke test simulation for macOS

echo "Starting Smoke Test Matrix (macOS)..."
export COMPLYZE_URL="http://localhost:3737/api"

echo "[1] Verify Install Configuration..."
if [ ! -f "dist/ComplyzeAgent.pkg" ]; then
    echo "Fail: PKG not found." && exit 1
fi
echo " [OK]"

echo "[2] Simulating Enrollment Execution..."
# Generate token first
node generate-token.mjs > /tmp/mock_token.txt
TOKEN=$(tail -n 1 /tmp/mock_token.txt)

node endpoint-agent.mjs enroll --token $TOKEN
if [ $? -ne 0 ]; then
    echo "Fail: Enrollment crashed" && exit 1
fi
echo " [OK]"

echo "[3] Verify Service Starts Recursively..."
# We run node detached
node endpoint-agent.mjs > /tmp/agent_test.log 2>&1 &
AGENT_PID=$!
sleep 5

if ! ps -p $AGENT_PID > /dev/null; then
    echo "Fail: Agent failed to start/supervise."
    exit 1
fi
echo " [OK] PID: $AGENT_PID"

echo "[4] Tear Down Test..."
kill $AGENT_PID
# Remove vault test
security delete-generic-password -a "complyze-agent" -s "ComplyzeEndpointSecret" 2>/dev/null || true
rm .complyze-agent-store.json 2>/dev/null || true
rm .complyze-proxy-config.json 2>/dev/null || true

echo "✅ MacOS Smoke Test Complete: ALL CLEAR."
