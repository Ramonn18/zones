// Takes one picture with the iPhone (Continuity Camera; never its Desk View) and saves it as a JPEG.
import AVFoundation
import AppKit
import CoreImage

final class Grab: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  let session = AVCaptureSession(), out: String, done = DispatchSemaphore(value: 0)
  var frames = 0
  init(_ out: String) { self.out = out }
  func captureOutput(_ o: AVCaptureOutput, didOutput b: CMSampleBuffer, from c: AVCaptureConnection) {
    frames += 1
    guard frames == 45, let px = CMSampleBufferGetImageBuffer(b) else { return } // let exposure settle
    let ci = CIImage(cvPixelBuffer: px), ctx = CIContext()
    try? ctx.writeJPEGRepresentation(of: ci, to: URL(fileURLWithPath: out), colorSpace: CGColorSpaceCreateDeviceRGB(), options: [:])
    print("saved \(CVPixelBufferGetWidth(px))x\(CVPixelBufferGetHeight(px)) to \(out)")
    done.signal()
  }
}
// A wireless iPhone can take a while to offer itself: keep looking for up to 30 seconds.
let isPhone = { (d: AVCaptureDevice) in d.localizedName.localizedCaseInsensitiveContains("iphone") && !d.localizedName.localizedCaseInsensitiveContains("desk view") }
var phone: AVCaptureDevice?
for second in 0..<30 {
  let devices = AVCaptureDevice.DiscoverySession(deviceTypes: [.external, .continuityCamera, .builtInWideAngleCamera], mediaType: .video, position: .unspecified).devices
  if second == 0 || devices.contains(where: isPhone) { print("cameras:", devices.map { $0.localizedName }) }
  if let found = devices.first(where: isPhone) { phone = found; break }
  RunLoop.current.run(until: Date().addingTimeInterval(1))
}
guard let phone else { print("no iPhone camera found after 30 seconds"); exit(1) }
let g = Grab(CommandLine.arguments[1])
g.session.sessionPreset = .hd1920x1080
g.session.addInput(try! AVCaptureDeviceInput(device: phone))
let output = AVCaptureVideoDataOutput()
output.setSampleBufferDelegate(g, queue: DispatchQueue(label: "grab"))
g.session.addOutput(output)
g.session.startRunning()
if g.done.wait(timeout: .now() + 20) == .timedOut { print("timed out waiting for a picture") }
g.session.stopRunning()
