import { TextToSpeech } from "@/components/text-to-speech"
import { Volume2 } from "lucide-react"

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Volume2 className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">SpeakIt</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <section className="container mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 text-balance">
            Text to Speech Converter
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto text-pretty">
            Transform your written content into natural-sounding speech. 
            Adjust playback speed and choose from multiple voices.
          </p>
        </div>

        <TextToSpeech />
      </section>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="container mx-auto px-4 py-6">
          <p className="text-center text-sm text-muted-foreground">
            Free text-to-speech converter using your browser&apos;s built-in speech synthesis
          </p>
        </div>
      </footer>
    </main>
  )
}
