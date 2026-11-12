#!/bin/sh
# Takes one picture through the iPhone (Continuity Camera) and saves it: sh app/look.sh picture.jpg
# Used to see the corner while setting it up, e.g. to check how the projection lands.
here="$(cd "$(dirname "$0")" && pwd)"
swiftc -O -o /tmp/zones-look "$here/look.swift" && /tmp/zones-look "${1:-look.jpg}"
