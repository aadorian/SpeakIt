import { NextRequest, NextResponse } from 'next/server'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

export async function POST(request: NextRequest) {
  try {
    const { text, voice = 'en-US-AriaNeural', rate = 0, pitch = 0 } = await request.json()

    if (!text) {
      return NextResponse.json(
        { error: 'Missing required parameter: text' },
        { status: 400 }
      )
    }

    const tts = new MsEdgeTTS()
    
    // Set metadata for the voice
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    
    // Convert text to speech
    // Build options object only with non-zero values
    const options: { rate?: string; pitch?: string } = {}
    if (rate !== 0) {
      options.rate = `${rate > 0 ? '+' : ''}${rate}%`
    }
    if (pitch !== 0) {
      options.pitch = `${pitch > 0 ? '+' : ''}${pitch}Hz`
    }
    
    const { audioStream } = await tts.toStream(text, Object.keys(options).length > 0 ? options : undefined)

    // Convert Node.js stream to buffer using async iteration
    const chunks: Buffer[] = []
    
    try {
      // Handle the stream using async iteration if available, otherwise use events
      if (Symbol.asyncIterator in audioStream) {
        for await (const chunk of audioStream as AsyncIterable<Buffer>) {
          chunks.push(chunk)
        }
      } else {
        // Fallback to event-based approach
        await new Promise<void>((resolve, reject) => {
          audioStream.on('data', (chunk: Buffer) => {
            chunks.push(chunk)
          })
          
          audioStream.on('end', () => {
            resolve()
          })
          
          audioStream.on('error', (error: Error) => {
            reject(error)
          })
        })
      }
      
      // Combine all chunks into a single buffer
      const buffer = Buffer.concat(chunks)
      
      // Validate buffer
      if (!buffer || buffer.length === 0) {
        throw new Error('Generated audio is empty')
      }
      
      // Validate MP3 header (should start with ID3 tag or MP3 sync word)
      const isValidAudio = buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0 || // MP3 sync word
                          buffer.slice(0, 3).toString() === 'ID3' // ID3 tag
      
      if (!isValidAudio && buffer.length > 10) {
        console.warn('Audio buffer may not be valid MP3. First bytes:', buffer.slice(0, 10))
        // Still try to return it, as some formats might work
      }
      
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': buffer.length.toString(),
          'Cache-Control': 'no-cache',
        },
      })
    } catch (streamError: any) {
      throw new Error(`Stream processing error: ${streamError.message}`)
    }
  } catch (error: any) {
    console.error('TTS API Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate speech' },
      { status: 500 }
    )
  }
}
