#!/bin/sh
# Builds Zones.app in the project folder: sh app/build.sh (needs Xcode's command line tools).
set -e
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
app="$root/Zones.app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS"
swiftc -O -swift-version 5 -o "$app/Contents/MacOS/Zones" "$here/main.swift" "$here/camera.swift"
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Zones</string>
  <key>CFBundleIdentifier</key><string>local.zones.corner</string>
  <key>CFBundleExecutable</key><string>Zones</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>2.0</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSCameraUsageDescription</key><string>Zones watches the corner to see what players do there.</string>
  <key>NSCameraUseContinuityCameraDeviceType</key><true/>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>ZonesFolder</key><string>$root</string>
</dict>
</plist>
PLIST
codesign --force --sign - "$app"
echo "Built $app"
