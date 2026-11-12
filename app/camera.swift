// The camera, captured natively: inside the app, the web page is only offered an iPhone's Desk View
// (a bent picture), never its normal camera. Hands the page JPEG frames.
import AVFoundation
import CoreImage

final class NativeCamera: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  private let session = AVCaptureSession(), queue = DispatchQueue(label: "zones.camera"), context = CIContext()
  private var lastSent = 0.0
  var busy = false // the page is still taking the last frame
  var onFrame: ((String, Int, Int) -> Void)? // jpeg (base64), the full picture's width and height

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
    onFrame?(jpeg.base64EncodedString(), w, h)
  }
}
