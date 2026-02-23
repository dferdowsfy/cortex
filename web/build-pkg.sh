#!/bin/bash
set -e

echo "========================================="
echo " Building macOS PKG for Complyze Agent"
echo "========================================="

OUTPUT_DIR="dist"
mkdir -p "$OUTPUT_DIR/payload/Library/Application Support/Complyze"
mkdir -p "$OUTPUT_DIR/scripts"

# Copy binaries
cp endpoint-agent.mjs "$OUTPUT_DIR/payload/Library/Application Support/Complyze/"
cp -R scripts "$OUTPUT_DIR/payload/Library/Application Support/Complyze/"

# Copy launchd plist
cp com.complyze.agent.plist "$OUTPUT_DIR/payload/Library/Application Support/Complyze/"

# Create postinstall script
cat << 'EOF' > "$OUTPUT_DIR/scripts/postinstall"
#!/bin/bash
TARGET_DIR="/Library/Application Support/Complyze"
PLIST_PATH="/Library/LaunchDaemons/com.complyze.agent.plist"

# Install daemon
cp "$TARGET_DIR/com.complyze.agent.plist" "$PLIST_PATH"
chown root:wheel "$PLIST_PATH"
chmod 644 "$PLIST_PATH"

# Load service
launchctl load -w "$PLIST_PATH" || true

# Check for MDM Token via Configuration Profile (Jamf/Kandji Standard)
MDM_DOMAIN="com.complyze.agent"
TOKEN=$(defaults read "/Library/Managed Preferences/$MDM_DOMAIN" EnrollmentToken 2>/dev/null || true)

# Fallback to local secure file (for Mass Deployment without built-in MDM payload variables)
TOKEN_FILE="$TARGET_DIR/enrollment_token"
if [ -z "$TOKEN" ] && [ -f "$TOKEN_FILE" ]; then
    # Restrict permissions instantly to prevent race-condition sniffing
    chmod 600 "$TOKEN_FILE"
    TOKEN=$(cat "$TOKEN_FILE")
    # Immediate deletion, even before enrollment finishes
    rm -f "$TOKEN_FILE"
fi

# Execute headless enrollment natively 
if [ -n "$TOKEN" ]; then
    /usr/local/bin/node "$TARGET_DIR/endpoint-agent.mjs" enroll --token "$TOKEN"
    
    # Nullify variable in bash memory immediately post-execution
    unset TOKEN
fi

exit 0
EOF
chmod +x "$OUTPUT_DIR/scripts/postinstall"

pkgbuild --root "$OUTPUT_DIR/payload" \
         --identifier com.complyze.agent \
         --version 1.2.0 \
         --scripts "$OUTPUT_DIR/scripts" \
         "$OUTPUT_DIR/ComplyzeAgent.pkg"

echo "✅ SUCCESS: PKG generated at $OUTPUT_DIR/ComplyzeAgent.pkg"
