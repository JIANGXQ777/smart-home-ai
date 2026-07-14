let playbackContext = null
let playbackSource = null

function audioContextClass() {
  return window.AudioContext || window.webkitAudioContext
}

function mergeFloat32(chunks) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const merged = new Float32Array(length)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged
}

function resampleToPcm16(input, sourceRate, targetRate) {
  const outputLength = Math.max(1, Math.round(input.length * targetRate / sourceRate))
  const buffer = new ArrayBuffer(outputLength * 2)
  const view = new DataView(buffer)
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * sourceRate / targetRate
    const leftIndex = Math.min(Math.floor(position), input.length - 1)
    const rightIndex = Math.min(leftIndex + 1, input.length - 1)
    const fraction = position - leftIndex
    const sample = input[leftIndex] + (input[rightIndex] - input[leftIndex]) * fraction
    const normalized = Math.max(-1, Math.min(1, sample))
    view.setInt16(index * 2, normalized < 0 ? normalized * 0x8000 : normalized * 0x7fff, true)
  }
  return buffer
}

export class BrowserPcmRecorder {
  constructor({ sampleRate = 16000, onLevel = () => {} } = {}) {
    this.targetSampleRate = sampleRate
    this.onLevel = onLevel
    this.chunks = []
    this.stream = null
    this.context = null
    this.source = null
    this.processor = null
    this.silentGain = null
    this.startedAt = 0
  }

  async start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('麦克风需要 HTTPS 或 localhost 安全环境')
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    })
    const AudioContextClass = audioContextClass()
    this.context = new AudioContextClass({ latencyHint: 'interactive' })
    await this.context.resume()
    this.source = this.context.createMediaStreamSource(this.stream)
    this.processor = this.context.createScriptProcessor(4096, 1, 1)
    this.silentGain = this.context.createGain()
    this.silentGain.gain.value = 0
    this.processor.onaudioprocess = event => {
      const samples = new Float32Array(event.inputBuffer.getChannelData(0))
      this.chunks.push(samples)
      let sum = 0
      for (const sample of samples) sum += sample * sample
      this.onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 5))
    }
    this.source.connect(this.processor)
    this.processor.connect(this.silentGain)
    this.silentGain.connect(this.context.destination)
    this.startedAt = Date.now()
  }

  async stop() {
    const durationMs = Date.now() - this.startedAt
    const sourceRate = this.context?.sampleRate || this.targetSampleRate
    const samples = mergeFloat32(this.chunks)
    await this.cleanup()
    if (!samples.length) throw new Error('没有采集到麦克风音频')
    return { pcm: resampleToPcm16(samples, sourceRate, this.targetSampleRate), durationMs }
  }

  async cancel() {
    await this.cleanup()
  }

  async cleanup() {
    if (this.processor) this.processor.onaudioprocess = null
    this.source?.disconnect()
    this.processor?.disconnect()
    this.silentGain?.disconnect()
    this.stream?.getTracks().forEach(track => track.stop())
    if (this.context && this.context.state !== 'closed') await this.context.close()
    this.onLevel(0)
  }
}

export async function unlockSpeaker() {
  const AudioContextClass = audioContextClass()
  if (!AudioContextClass) throw new Error('当前浏览器不支持音频播放')
  playbackContext ||= new AudioContextClass({ latencyHint: 'interactive' })
  await playbackContext.resume()
  const buffer = playbackContext.createBuffer(1, 1, playbackContext.sampleRate)
  const source = playbackContext.createBufferSource()
  source.buffer = buffer
  source.connect(playbackContext.destination)
  source.start()
}

export function stopSpeaker() {
  if (!playbackSource) return
  try { playbackSource.stop() } catch {}
  playbackSource = null
}

export async function playWavBlob(blob, volume = 1) {
  await unlockSpeaker()
  stopSpeaker()
  const audioBuffer = await playbackContext.decodeAudioData(await blob.arrayBuffer())
  const source = playbackContext.createBufferSource()
  const gain = playbackContext.createGain()
  gain.gain.value = Math.max(0, Math.min(1, Number(volume)))
  source.buffer = audioBuffer
  source.connect(gain)
  gain.connect(playbackContext.destination)
  playbackSource = source
  await new Promise((resolve, reject) => {
    source.onended = resolve
    try { source.start() } catch (error) { reject(error) }
  })
  if (playbackSource === source) playbackSource = null
}
