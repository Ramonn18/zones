// Zones.app: runs the corner without a browser. It starts the local server, opens the corner page
// on the laptop, and puts the projector's picture full screen on a known projector (projectors.json)
// as soon as one is connected, moving it when projectors come and go.
import AppKit
import WebKit
import AVFoundation

let port = 8010
let base = "http://localhost:\(port)/"

// A projector from projectors.json. Fields left out match anything.
struct Known: Decodable { let name: String; let vendor: UInt32?; let model: UInt32?; let serial: UInt32? }
struct KnownList: Decodable { let projectors: [Known] }

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
  var control: NSWindow!, projector: NSWindow!
  var controlView: WKWebView!, projectorView: WKWebView!
  var server: Process?
  var awake: NSObjectProtocol?
  var root: URL!
  var testOutput: String?
  var current = "none" // the projector the picture is on, for the corner page
  let camera = NativeCamera()

  func applicationDidFinishLaunching(_ note: Notification) {
    let args = CommandLine.arguments
    if let i = args.firstIndex(of: "--selftest"), i + 1 < args.count { testOutput = args[i + 1] }
    root = projectFolder()
    startServer()
    awake = ProcessInfo.processInfo.beginActivity(options: [.userInitiated, .idleDisplaySleepDisabled], reason: "Projecting the corner")
    buildMenu()

    controlView = makeWebView()
    projectorView = makeWebView()
    let laptop = laptopScreen().visibleFrame
    control = NSWindow(contentRect: NSRect(x: laptop.midX - 650, y: laptop.midY - 420, width: 1300, height: 840),
                       styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
    control.title = "Zones · the corner"
    control.contentView = controlView
    control.delegate = self
    projector = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 960, height: 540), styleMask: [.titled, .resizable], backing: .buffered, defer: false)
    projector.title = "Zones projector"
    projector.backgroundColor = .black
    projector.contentView = projectorView
    placeProjector()
    NotificationCenter.default.addObserver(self, selector: #selector(placeProjector), name: NSApplication.didChangeScreenParametersNotification, object: nil)

    load(projectorView, "corner-projector.html")
    load(controlView, "corner.html")
    control.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    if testOutput != nil { selfTest() }
  }

  // The project folder: the one the app sits in, or the one the build recorded.
  func projectFolder() -> URL {
    let beside = Bundle.main.bundleURL.deletingLastPathComponent()
    if FileManager.default.fileExists(atPath: beside.appendingPathComponent("web").path) { return beside }
    return URL(fileURLWithPath: Bundle.main.object(forInfoDictionaryKey: "ZonesFolder") as? String ?? beside.path)
  }

  func makeWebView() -> WKWebView {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
    config.applicationNameForUserAgent = "ZonesApp"
    config.preferences.inactiveSchedulingPolicy = .none // keep running when covered
    config.preferences.setValue(true, forKey: "developerExtrasEnabled") // right click > Inspect Element
    let view = WKWebView(frame: .zero, configuration: config)
    view.isInspectable = true
    config.userContentController.add(self, name: "camera")
    config.userContentController.add(self, name: "file")
    view.navigationDelegate = self
    view.uiDelegate = self
    return view
  }
  func load(_ view: WKWebView, _ page: String) { view.load(URLRequest(url: URL(string: base + page)!)) }

  // The server may not be up yet: keep trying.
  func webView(_ view: WKWebView, didFailProvisionalNavigation nav: WKNavigation!, withError error: Error) {
    let page = ((error as NSError).userInfo[NSURLErrorFailingURLErrorKey] as? URL)?.lastPathComponent ?? "corner.html"
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.load(view, page) }
  }
  func webView(_ view: WKWebView, didFinish nav: WKNavigation!) { tellPage() }

  // ---- Projectors --------------------------------------------------------------------------
  func displayID(_ s: NSScreen) -> CGDirectDisplayID { s.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as! CGDirectDisplayID }
  func laptopScreen() -> NSScreen { NSScreen.screens.first { CGDisplayIsBuiltin(displayID($0)) != 0 } ?? NSScreen.screens[0] }

  func knownProjectors() -> [Known] {
    guard let data = try? Data(contentsOf: root.appendingPathComponent("projectors.json")) else { return [] }
    return (try? JSONDecoder().decode(KnownList.self, from: data))?.projectors ?? []
  }

  // The display to project on: a known projector first; else any other external display.
  func projectorScreen() -> (NSScreen, String)? {
    let others = NSScreen.screens.filter { CGDisplayIsBuiltin(displayID($0)) == 0 }
    for k in knownProjectors() {
      for s in others {
        let id = displayID(s)
        let ids = [(k.vendor, CGDisplayVendorNumber(id)), (k.model, CGDisplayModelNumber(id)), (k.serial, CGDisplaySerialNumber(id))]
        let byIDs = k.vendor != nil && ids.allSatisfy { want, got in want == nil || want == got }
        if byIDs || (k.vendor == nil && s.localizedName.localizedCaseInsensitiveContains(k.name)) { return (s, "\(k.name) (known)") }
      }
    }
    return others.first.map { ($0, "\($0.localizedName) (not in projectors.json yet)") }
  }

  // Full screen on the projector, above its menu bar; with none, a small window on the laptop.
  @objc func placeProjector() {
    if let (screen, name) = projectorScreen() {
      current = name
      projector.styleMask = [.borderless]
      projector.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.mainMenuWindow)) + 1)
      projector.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
      projector.setFrame(screen.frame, display: true)
      projector.orderFrontRegardless()
    } else {
      current = "none"
      projector.styleMask = [.titled, .resizable]
      projector.level = .normal
      projector.collectionBehavior = []
      let f = laptopScreen().visibleFrame
      projector.setFrame(NSRect(x: f.minX + 30, y: f.minY + 30, width: 640, height: 360), display: true)
      projector.orderFront(nil)
    }
    tellPage()
  }

  // Lets the corner page show which projector it's on.
  func tellPage() {
    let json = String(data: try! JSONSerialization.data(withJSONObject: ["projector": current]), encoding: .utf8)!
    controlView?.evaluateJavaScript("window.zonesApp = \(json); window.dispatchEvent(new Event('zonesapp'));", completionHandler: nil)
  }

  // ---- The camera (the page asks through window.webkit.messageHandlers.camera) ----------------
  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
    if message.name == "file" {
      if action == "save", let name = body["name"] as? String, let text = body["text"] as? String { saveFile(name, text) }
      return
    }
    if action == "list" {
      AVCaptureDevice.requestAccess(for: .video) { granted in DispatchQueue.main.async {
        guard granted else { return self.callPage("zonesCameraError", "Camera access is off: allow Zones in System Settings > Privacy & Security > Camera.") }
        self.camera.onFrame = { jpeg, w, h in DispatchQueue.main.async {
          self.controlView.evaluateJavaScript("window.zonesFrame?.('\(jpeg)', \(w), \(h)); 0") { _, _ in self.camera.busy = false }
        } }
        self.callPage("zonesCameras", NativeCamera.list().map { ["id": $0.uniqueID, "label": $0.localizedName] })
      } }
    } else if action == "start", let id = body["id"] as? String {
      camera.start(id: id) { text in DispatchQueue.main.async { self.callPage("zonesCameraError", text) } }
    }
  }
  func callPage(_ fn: String, _ arg: Any) {
    guard let data = try? JSONSerialization.data(withJSONObject: arg, options: [.fragmentsAllowed]), let json = String(data: data, encoding: .utf8) else { return }
    controlView.evaluateJavaScript("window.\(fn)?.(\(json))", completionHandler: nil)
  }

  // ---- Files and dialogs (a web view has none of its own) ---------------------------------------
  // Saves a setup where the person picks, starting in the project's setups folder.
  func saveFile(_ name: String, _ text: String) {
    let panel = NSSavePanel(), folder = root.appendingPathComponent("setups")
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    panel.directoryURL = folder
    panel.nameFieldStringValue = name
    panel.beginSheetModal(for: control) { result in
      guard result == .OK, let url = panel.url else { return }
      do { try text.write(to: url, atomically: true, encoding: .utf8); self.callPage("zonesSaved", url.path) }
      catch { self.callPage("zonesSaved", "nothing: \(error.localizedDescription)") }
    }
  }
  // <input type=file>
  func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
    let panel = NSOpenPanel()
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection
    panel.canChooseDirectories = false
    panel.directoryURL = root.appendingPathComponent("setups")
    panel.beginSheetModal(for: control) { result in completionHandler(result == .OK ? panel.urls : nil) }
  }
  // confirm() and alert()
  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
    let alert = NSAlert()
    alert.messageText = message
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Cancel")
    alert.beginSheetModal(for: control) { completionHandler($0 == .alertFirstButtonReturn) }
  }
  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
    let alert = NSAlert()
    alert.messageText = message
    alert.beginSheetModal(for: control) { _ in completionHandler() }
  }

  // ---- Server and lifecycle ----------------------------------------------------------------
  // If another server already has the port (one started in a terminal), this one just exits.
  func startServer() {
    let fm = FileManager.default
    guard let python = ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"].first(where: fm.isExecutableFile) else { return }
    let p = Process()
    p.executableURL = URL(fileURLWithPath: python)
    p.arguments = ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", root.appendingPathComponent("web").path]
    p.standardOutput = FileHandle.nullDevice
    p.standardError = FileHandle.nullDevice
    try? p.run()
    server = p
  }
  func windowWillClose(_ note: Notification) { NSApp.terminate(nil) }
  func applicationWillTerminate(_ note: Notification) { camera.stop(); server?.terminate() }

  func buildMenu() {
    let bar = NSMenu(), appItem = NSMenuItem(), appMenu = NSMenu()
    appMenu.addItem(withTitle: "Quit Zones", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = appMenu
    bar.addItem(appItem)
    let viewItem = NSMenuItem(), viewMenu = NSMenu(title: "View")
    viewMenu.addItem(withTitle: "Reload", action: #selector(reloadAll), keyEquivalent: "r").target = self
    viewItem.submenu = viewMenu
    bar.addItem(viewItem)
    NSApp.mainMenu = bar
  }
  @objc func reloadAll() { controlView.reload(); projectorView.reload() }

  // ---- Self test (--selftest <folder>): where the picture went, and what it shows ------------
  func selfTest() {
    let out = URL(fileURLWithPath: testOutput!)
    print("screens:", NSScreen.screens.map { "\($0.localizedName) \($0.frame)" })
    print("projecting on:", current, "| window:", projector.frame)
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.controlView.evaluateJavaScript("document.getElementById('startCam').click()", completionHandler: nil) }
    DispatchQueue.main.asyncAfter(deadline: .now() + 7) {
      self.controlView.evaluateJavaScript("document.getElementById('projStatus').textContent + ' | ' + document.getElementById('camStatus').textContent") { r, _ in print("corner page says:", r ?? "nothing") }
      self.controlView.takeSnapshot(with: nil) { image, _ in
        if let tiff = image?.tiffRepresentation, let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
          try? png.write(to: out.appendingPathComponent("app-corner-control.png"))
        }
      }
      self.projectorView.takeSnapshot(with: nil) { image, _ in
        if let tiff = image?.tiffRepresentation, let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
          try? png.write(to: out.appendingPathComponent("app-corner-projector.png"))
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { NSApp.terminate(nil) }
      }
    }
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
