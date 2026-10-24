import Foundation
import AVFoundation
import CoreAudio

// Output only. No microphone access, recordings, driver installs or device changes.
func deviceProperty<T>(_ selector: AudioObjectPropertySelector, _ initial: T) -> T {
    var device = AudioDeviceID(0)
    var address = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDefaultOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device) == noErr else { return initial }
    var value = initial
    address.mSelector = selector
    size = UInt32(MemoryLayout<T>.size)
    let status = withUnsafeMutableBytes(of: &value) { bytes in
        AudioObjectGetPropertyData(device, &address, 0, nil, &size, bytes.baseAddress!)
    }
    guard status == noErr else { return initial }
    return value
}
var trials = [[String: Any]]()
for rate in [44100.0, 48000.0] {
    var result: [String: Any] = ["sampleRate": rate]
    let engine = AVAudioEngine(), player = AVAudioPlayerNode()
    do {
        let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2)!
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(rate))!
        buffer.frameLength = buffer.frameCapacity
        for channel in 0..<2 {
            for frame in 0..<Int(buffer.frameLength) {
                buffer.floatChannelData![channel][frame] = Float(sin(2 * Double.pi * 440 * Double(frame) / rate) * 0.002)
            }
        }
        engine.attach(player); engine.connect(player, to: engine.mainMixerNode, format: format)
        player.scheduleBuffer(buffer, at: nil, options: .loops)
        try engine.start(); player.play()
        Thread.sleep(forTimeInterval: 0.25)
        let first = engine.outputNode.lastRenderTime?.sampleTime ?? 0
        Thread.sleep(forTimeInterval: 5)
        let second = engine.outputNode.lastRenderTime?.sampleTime ?? 0
        result["advancedFrames"] = second - first
        result["outputSampleRate"] = engine.outputNode.outputFormat(forBus: 0).sampleRate
        result["running"] = engine.isRunning
    } catch {
        let error = error as NSError
        result["error"] = ["domain": error.domain, "code": error.code]
    }
    player.stop(); engine.stop(); trials.append(result)
}
let output: [String: Any] = ["trials": trials,
    "virtualOutput": deviceProperty(kAudioDevicePropertyTransportType, UInt32(0)) == kAudioDeviceTransportTypeVirtual,
    "nominalSampleRate": deviceProperty(kAudioDevicePropertyNominalSampleRate, Double(0))]
let data = try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
