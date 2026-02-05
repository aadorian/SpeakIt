import { TextToSpeech } from "@/components/text-to-speech"
import { Volume2, Music2 } from "lucide-react"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#121212] via-[#1a1a1a] to-[#121212] text-white">
      {/* Spotify-style Header */}
      <header className="sticky top-0 z-50 bg-[#121212]/80 backdrop-blur-xl border-b border-white/10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-gradient-to-br from-[#1db954] to-[#1ed760] shadow-lg shadow-[#1db954]/30">
                <Music2 className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                SpeakIt
              </h1>
            </div>
            <div className="text-sm text-gray-400">
              Powered by Edge-TTS
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Spotify-style */}
      <section className="container mx-auto px-6 py-8 max-w-6xl">
        <div className="mb-8">
          <h2 className="text-4xl md:text-5xl font-black mb-3 bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
            Text to Speech
          </h2>
          <p className="text-gray-400 text-lg">
            Transform your text into natural speech with premium voices
          </p>
        </div>

        <TextToSpeech />
      </section>
    </main>
  )
}
