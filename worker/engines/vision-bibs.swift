// Tiled Apple Vision OCR for bib / jersey numbers. Build with: bash worker/build-vision.sh
// Usage: vision-bibs <image>  ->  one JSON line on stdout, or {"error":"..."} with exit 1.
import Foundation
import Vision
import ImageIO
import CoreImage

func fail(_ message: String) -> Never {
    let escaped = message.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
    print("{\"error\":\"\(escaped)\"}")
    exit(1)
}

// (cols, rows, scale) per pass, found by tuning on real photos. Whole-image OCR misses most jersey numbers.
let passes: [(cols: Int, rows: Int, scale: CGFloat)] = [(3, 2, 4), (5, 3, 4), (4, 3, 2)]
let overlap: CGFloat = 0.3  // tile overlap so numbers on a border are not cut in half

let args = CommandLine.arguments
guard args.count == 2 else { fail("usage: vision-bibs <image>") }
guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fail("cannot read image \(args[1])") }

let ciContext = CIContext()
let started = Date()
var best: [String: (conf: Float, hits: Int)] = [:]

func recognise(_ cg: CGImage) -> [(String, Float)] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.minimumTextHeight = 0.02
    do { try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request]) } catch { return [] }
    var found: [(String, Float)] = []
    for observation in request.results ?? [] {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let text = candidate.string.replacingOccurrences(of: " ", with: "")
        let isDigits = !text.isEmpty && text.count <= 3 && text.allSatisfy { $0.isASCII && $0.isNumber }
        if isDigits && candidate.confidence >= 0.5 { found.append((text, candidate.confidence)) }
    }
    return found
}

let w = CGFloat(image.width), h = CGFloat(image.height)
for pass in passes {
    let tw = w / CGFloat(pass.cols), th = h / CGFloat(pass.rows)
    for row in 0..<pass.rows {
        for col in 0..<pass.cols {
            let x0 = max(0, CGFloat(col) * tw - tw * overlap), y0 = max(0, CGFloat(row) * th - th * overlap)
            let x1 = min(w, CGFloat(col + 1) * tw + tw * overlap), y1 = min(h, CGFloat(row + 1) * th + th * overlap)
            guard let crop = image.cropping(to: CGRect(x: x0, y: y0, width: x1 - x0, height: y1 - y0)) else { continue }
            let scaled = CIImage(cgImage: crop).transformed(by: CGAffineTransform(scaleX: pass.scale, y: pass.scale))
            guard let big = ciContext.createCGImage(scaled, from: scaled.extent) else { continue }
            for (text, conf) in recognise(big) {
                let prev = best[text]
                best[text] = (max(prev?.conf ?? 0, conf), (prev?.hits ?? 0) + 1)
            }
        }
    }
}

let numbers = best.keys.sorted { Int($0)! < Int($1)! }.map { n -> String in
    let v = best[n]!
    return "{\"n\":\"\(n)\",\"conf\":\(String(format: "%.2f", Double(v.conf))),\"hits\":\(v.hits)}"
}
let ms = Int(Date().timeIntervalSince(started) * 1000)
print("{\"numbers\":[\(numbers.joined(separator: ","))],\"ms\":\(ms)}")
