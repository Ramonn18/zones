// Lists the connected displays with their IDs (vendor, model and serial stay the same across
// connections; the display number doesn't). Run with: sh app/displays.sh
import AppKit
for s in NSScreen.screens {
  let id = s.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as! CGDirectDisplayID
  let mode = CGDisplayCopyDisplayMode(id)
  print("\(s.localizedName) | displayID \(id) | vendor \(CGDisplayVendorNumber(id)) model \(CGDisplayModelNumber(id)) serial \(CGDisplaySerialNumber(id)) | builtin \(CGDisplayIsBuiltin(id) != 0) | frame \(s.frame) | mode \(mode?.pixelWidth ?? 0)x\(mode?.pixelHeight ?? 0) @\(mode?.refreshRate ?? 0)Hz | mirror of \(CGDisplayMirrorsDisplay(id))")
}
