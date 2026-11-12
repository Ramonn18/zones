#!/bin/sh
# Lists the connected displays with the IDs projectors.json uses: sh app/displays.sh
here="$(cd "$(dirname "$0")" && pwd)"
swiftc -o /tmp/zones-displays "$here/displays.swift" && /tmp/zones-displays
