// The camera, captured natively: inside the app, the web page is only offered an iPhone's Desk View
// (a bent picture), never its normal camera. Hands the page JPEG frames, each with the outline of
// any people in it (Apple Vision's person segmentation, built into macOS).
import AVFoundation
import CoreImage
import Vision

final class NativeCamera: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  private let session = AVCaptureSession(), queue = DispatchQueue(label: "zones.camera"), context = CIContext()
  private var lastSent = 0.0
  var busy = false // the page is still taking the last frame
  // jpeg (base64), the full picture's width and height, and the people mask (base64, maskW x maskH, 0..255)
  var onFrame: ((String, Int, Int, String?) -> Void)?
  static let maskW = 160, maskH = 90
  private let people: VNGeneratePersonSegmentationRequest = {
    let r = VNGeneratePersonSegmentationRequest()
    r.qualityLevel = .balanced
    r.outputPixelFormat = kCVPixelFormatType_OneComponent8
    return r
  }()

  // Every camera except Desk View ones.
  static func list() -> [AVCaptureDevice] {
    AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInWideAngleCamera, .external, .continuityCamera], mediaType: .video, position: .unspecified)
      .devices.filter { !$0.localizedName.localizedCaseInsensitiveContains("desk view") }
  }

  func start(id: String, failed: @escaping (String) -> Void) {
    queue.async {
      guard let device = AVCaptureDevice(uniqueID: id) else { return failed("That camera is gone.") }
      self.session.stopRunning()
      self.session.beginConfiguration()
      self.session.inputs.forEach(self.session.removeInput)
      self.session.outputs.forEach(self.session.removeOutput)
      guard let input = try? AVCaptureDeviceInput(device: device), self.session.canAddInput(input) else {
        self.session.commitConfiguration()
        return failed("Couldn't open \(device.localizedName).")
      }
      self.session.addInput(input)
      self.session.sessionPreset = self.session.canSetSessionPreset(.hd1920x1080) ? .hd1920x1080 : .high
      let output = AVCaptureVideoDataOutput()
      output.alwaysDiscardsLateVideoFrames = true
      output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
      output.setSampleBufferDelegate(self, queue: self.queue)
      self.session.addOutput(output)
      self.session.commitConfiguration()
      self.session.startRunning()
    }
  }
  func stop() { queue.async { self.session.stopRunning() } }

  func captureOutput(_ output: AVCaptureOutput, didOutput buffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    let now = CACurrentMediaTime()
    guard !busy, now - lastSent > 1.0 / 24, let pixels = CMSampleBufferGetImageBuffer(buffer) else { return }
    lastSent = now
    let w = CVPixelBufferGetWidth(pixels), h = CVPixelBufferGetHeight(pixels), scale = min(1, 1280 / CGFloat(w))
    let image = CIImage(cvPixelBuffer: pixels).transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    guard let jpeg = context.jpegRepresentation(of: image, colorSpace: CGColorSpaceCreateDeviceRGB(),
      options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.65]) else { return }
    busy = true
    onFrame?(jpeg.base64EncodedString(), w, h, peopleMask(pixels))
  }

  // Where people are in the picture, shrunk to a small grid (each square the average of its area).
  private func peopleMask(_ pixels: CVPixelBuffer) -> String? {
    guard (try? VNImageRequestHandler(cvPixelBuffer: pixels, options: [:]).perform([people])) != nil,
          let m = people.results?.first?.pixelBuffer else { return nil }
    CVPixelBufferLockBaseAddress(m, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(m, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(m)?.assumingMemoryBound(to: UInt8.self) else { return nil }
    let mw = CVPixelBufferGetWidth(m), mh = CVPixelBufferGetHeight(m), row = CVPixelBufferGetBytesPerRow(m)
    let W = Self.maskW, H = Self.maskH
    var out = [UInt8](repeating: 0, count: W * H)
    for y in 0..<H {
      let y0 = y * mh / H, y1 = max(y0 + 1, (y + 1) * mh / H)
      for x in 0..<W {
        let x0 = x * mw / W, x1 = max(x0 + 1, (x + 1) * mw / W)
        var sum = 0
        for yy in y0..<y1 { for xx in x0..<x1 { sum += Int(base[yy * row + xx]) } }
        out[y * W + x] = UInt8(sum / ((y1 - y0) * (x1 - x0)))
      }
    }
    return Data(out).base64EncodedString()
  }
}
