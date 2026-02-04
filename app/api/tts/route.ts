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
      
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': buffer.length.toString(),
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
