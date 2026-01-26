"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Play, Pause, Square, Volume2, Gauge, Download, Loader2, Music } from "lucide-react"

export function TextToSpeech() {
  const [text, setText] = useState("")
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [volume, setVolume] = useState(1)
  const [pitch, setPitch] = useState(1)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoice, setSelectedVoice] = useState<string>("")
  const [voiceFilter, setVoiceFilter] = useState<"all" | "en">("en")
  const [utterance, setUtterance] = useState<SpeechSynthesisUtterance | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState("")
  const [currentWordIndex, setCurrentWordIndex] = useState(-1)
  const [currentCharIndex, setCurrentCharIndex] = useState(-1)
  const [words, setWords] = useState<string[]>([])
  const [sentences, setSentences] = useState<{ text: string; startIndex: number; endIndex: number }[]>([])
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1)
  const highlightRef = useRef<HTMLSpanElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices()
      setVoices(availableVoices)
      if (availableVoices.length > 0 && !selectedVoice) {
        const englishVoice = availableVoices.find(v => v.lang.startsWith("en")) || availableVoices[0]
        setSelectedVoice(englishVoice.name)
      }
    }

    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices

    return () => {
      window.speechSynthesis.cancel()
    }
  }, [selectedVoice])

  // Auto-scroll to current word
  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      })
    }
  }, [currentWordIndex])

  const handlePlay = useCallback(() => {
    if (isPaused) {
      window.speechSynthesis.resume()
      setIsPaused(false)
      setIsPlaying(true)
      return
    }

    if (!text.trim()) return

    window.speechSynthesis.cancel()

    // Parse text into words for highlighting
    const textWords = text.split(/(\s+)/).filter(word => word.trim().length > 0)
    setWords(textWords)
    setCurrentWordIndex(-1)
    setCurrentCharIndex(-1)

    // Parse sentences for context highlighting
    const sentenceRegex = /[^.!?]*[.!?]+/g
    const parsedSentences: { text: string; startIndex: number; endIndex: number }[] = []
    let match
    let charCount = 0
    while ((match = sentenceRegex.exec(text)) !== null) {
      parsedSentences.push({
        text: match[0].trim(),
        startIndex: charCount,
        endIndex: charCount + match[0].length
      })
      charCount = match.index + match[0].length
    }
    // Handle text without sentence endings
    if (parsedSentences.length === 0) {
      parsedSentences.push({ text: text, startIndex: 0, endIndex: text.length })
    }
    setSentences(parsedSentences)
    setCurrentSentenceIndex(0)

    const newUtterance = new SpeechSynthesisUtterance(text)
    newUtterance.rate = speed
    newUtterance.volume = volume
    newUtterance.pitch = pitch
    
    const voice = voices.find(v => v.name === selectedVoice)
    if (voice) {
      newUtterance.voice = voice
    }

    // Track word and sentence boundaries for highlighting
    let wordIndex = 0
    newUtterance.onboundary = (event) => {
      if (event.name === 'word') {
        setCurrentWordIndex(wordIndex)
        setCurrentCharIndex(event.charIndex)
        
        // Update current sentence based on character index
        const sentenceIdx = parsedSentences.findIndex(
          s => event.charIndex >= s.startIndex && event.charIndex < s.endIndex
        )
        if (sentenceIdx !== -1) {
          setCurrentSentenceIndex(sentenceIdx)
        }
        wordIndex++
      } else if (event.name === 'sentence') {
        // Some browsers fire sentence events
        const sentenceIdx = parsedSentences.findIndex(
          s => event.charIndex >= s.startIndex && event.charIndex < s.endIndex
        )
        if (sentenceIdx !== -1) {
          setCurrentSentenceIndex(sentenceIdx)
        }
      }
    }

    newUtterance.onend = () => {
      setIsPlaying(false)
      setIsPaused(false)
      setCurrentWordIndex(-1)
      setCurrentCharIndex(-1)
      setCurrentSentenceIndex(-1)
    }

    newUtterance.onerror = () => {
      setIsPlaying(false)
      setIsPaused(false)
      setCurrentWordIndex(-1)
      setCurrentCharIndex(-1)
      setCurrentSentenceIndex(-1)
    }

    setUtterance(newUtterance)
    window.speechSynthesis.speak(newUtterance)
    setIsPlaying(true)
    setIsPaused(false)
  }, [text, speed, volume, pitch, voices, selectedVoice, isPaused])

  const handlePause = useCallback(() => {
    if (isPlaying && !isPaused) {
      window.speechSynthesis.pause()
      setIsPaused(true)
      setIsPlaying(false)
    }
  }, [isPlaying, isPaused])

  const handleStop = useCallback(() => {
    window.speechSynthesis.cancel()
    setIsPlaying(false)
    setIsPaused(false)
    setCurrentWordIndex(-1)
    setCurrentCharIndex(-1)
    setCurrentSentenceIndex(-1)
  }, [])

  const handleDownload = useCallback(async () => {
    if (!text.trim() || isRecording) return

    setIsRecording(true)
    setDownloadProgress("Preparing audio...")

    try {
      // Create audio context
      const audioContext = new AudioContext()
      const destination = audioContext.createMediaStreamDestination()
      
      // Create an oscillator to ensure we have audio stream
      const oscillator = audioContext.createOscillator()
      oscillator.connect(destination)
      
      // Set up media recorder
      const mediaRecorder = new MediaRecorder(destination.stream, {
        mimeType: 'audio/webm;codecs=opus'
      })
      
      const audioChunks: Blob[] = []
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }

      // Create utterance for recording
      const recordUtterance = new SpeechSynthesisUtterance(text)
      recordUtterance.rate = speed
      recordUtterance.volume = volume
      
      const voice = voices.find(v => v.name === selectedVoice)
      if (voice) {
        recordUtterance.voice = voice
      }

      setDownloadProgress("Recording speech...")

      // Start recording
      mediaRecorder.start(100)
      
      await new Promise<void>((resolve, reject) => {
        recordUtterance.onend = () => {
          setTimeout(() => {
            mediaRecorder.stop()
            resolve()
          }, 500)
        }
        
        recordUtterance.onerror = (e) => {
          mediaRecorder.stop()
          reject(e)
        }

        window.speechSynthesis.speak(recordUtterance)
      })

      setDownloadProgress("Processing...")

      // Wait for recorder to finish
      await new Promise<void>((resolve) => {
        mediaRecorder.onstop = () => resolve()
        if (mediaRecorder.state === 'inactive') resolve()
      })

      // Create blob and download
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
      
      // If we got audio data, download it
      if (audioBlob.size > 0) {
        const url = URL.createObjectURL(audioBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = `speech-${Date.now()}.webm`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        setDownloadProgress("Downloaded!")
      } else {
        // Fallback: create a text file with instructions
        setDownloadProgress("Creating text file...")
        const textBlob = new Blob([text], { type: 'text/plain' })
        const url = URL.createObjectURL(textBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = `speech-text-${Date.now()}.txt`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        setDownloadProgress("Text file downloaded!")
      }

      audioContext.close()
    } catch (error) {
      console.error('Download error:', error)
      setDownloadProgress("Download failed")
    } finally {
      setTimeout(() => {
        setIsRecording(false)
        setDownloadProgress("")
      }, 2000)
    }
  }, [text, speed, volume, voices, selectedVoice, isRecording])

  const handleSpeedChange = (value: number[]) => {
    setSpeed(value[0])
    if (utterance) {
      utterance.rate = value[0]
    }
  }

  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0])
    if (utterance) {
      utterance.volume = value[0]
    }
  }

  const handlePitchChange = (value: number[]) => {
    setPitch(value[0])
    if (utterance) {
      utterance.pitch = value[0]
    }
  }

  const speedLabels = [
    { value: 0.5, label: "0.5x" },
    { value: 0.75, label: "0.75x" },
    { value: 1, label: "1x" },
    { value: 1.25, label: "1.25x" },
    { value: 1.5, label: "1.5x" },
    { value: 2, label: "2x" },
  ]

  // Filter voices based on language selection
  const filteredVoices = voices.filter(voice => {
    if (voiceFilter === "all") return true
    return voice.lang.startsWith("en")
  })

  // Group English voices by accent/region
  const groupedVoices = filteredVoices.reduce((acc, voice) => {
    let group = "Other"
    if (voice.lang === "en-US") group = "English (US)"
    else if (voice.lang === "en-GB") group = "English (UK)"
    else if (voice.lang === "en-AU") group = "English (Australia)"
    else if (voice.lang === "en-IN") group = "English (India)"
    else if (voice.lang === "en-IE") group = "English (Ireland)"
    else if (voice.lang === "en-ZA") group = "English (South Africa)"
    else if (voice.lang === "en-CA") group = "English (Canada)"
    else if (voice.lang.startsWith("en")) group = "English (Other)"
    else if (voiceFilter === "all") {
      const langName = new Intl.DisplayNames(['en'], { type: 'language' })
      try {
        group = langName.of(voice.lang.split('-')[0]) || "Other"
      } catch {
        group = "Other"
      }
    }
    
    if (!acc[group]) acc[group] = []
    acc[group].push(voice)
    return acc
  }, {} as Record<string, SpeechSynthesisVoice[]>)

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Text Input with Netflix-style Subtitle Highlighting */}
      <Card className="border-border bg-card overflow-hidden">
        <CardContent className="p-0">
          {/* Input mode - shown when not playing */}
          {!isPlaying && !isPaused && (
            <div className="p-6">
              <label htmlFor="text-input" className="block text-sm font-medium text-muted-foreground mb-3">
                Enter your text
              </label>
              <Textarea
                id="text-input"
                placeholder="Type or paste your text here..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-h-[200px] resize-none bg-secondary border-border text-foreground placeholder:text-muted-foreground focus:ring-primary text-lg leading-relaxed"
              />
              <div className="flex justify-between items-center mt-3">
                <span className="text-xs text-muted-foreground">
                  {text.length} characters
                </span>
                {text.length > 0 && (
                  <button
                    onClick={() => setText("")}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Netflix-style subtitle display - shown when playing/paused */}
          {(isPlaying || isPaused) && words.length > 0 && (
            <div className="relative bg-[#050505] min-h-[320px] flex flex-col overflow-hidden">
              {/* Animated background glow */}
              <div 
                className="absolute inset-0 opacity-30 transition-all duration-500"
                style={{
                  background: `radial-gradient(ellipse at center, rgba(100, 150, 255, 0.15) 0%, transparent 70%)`,
                }}
              />
              
              {/* Top fade */}
              <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-[#050505] to-transparent z-10 pointer-events-none" />
              
              {/* Bottom fade */}
              <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#050505] to-transparent z-10 pointer-events-none" />
              
              {/* Main subtitle area */}
              <div 
                ref={containerRef}
                className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-0"
              >
                {/* Previous line - fading out */}
                {currentWordIndex > 4 && (
                  <div className="absolute top-8 left-0 right-0 text-center opacity-30 transition-opacity duration-300">
                    <p className="text-base md:text-lg text-foreground/40 font-medium">
                      {words.slice(Math.max(0, currentWordIndex - 8), currentWordIndex - 4).join(' ')}
                    </p>
                  </div>
                )}

                {/* Current subtitle line - main focus */}
                <div className="text-center max-w-2xl relative">
                  <p className="text-2xl md:text-4xl font-semibold leading-snug tracking-wide">
                    {(() => {
                      // Calculate visible window (5 words before, current, 5 after)
                      const windowStart = Math.max(0, currentWordIndex - 3)
                      const windowEnd = Math.min(words.length, currentWordIndex + 5)
                      const visibleWords = words.slice(windowStart, windowEnd)
                      
                      return visibleWords.map((word, i) => {
                        const actualIndex = windowStart + i
                        const isCurrentWord = actualIndex === currentWordIndex
                        const isPastWord = actualIndex < currentWordIndex
                        const distanceFromCurrent = Math.abs(actualIndex - currentWordIndex)
                        
                        // Calculate opacity based on distance
                        const opacity = isCurrentWord ? 1 : Math.max(0.2, 1 - distanceFromCurrent * 0.2)
                        
                        return (
                          <span
                            key={actualIndex}
                            ref={isCurrentWord ? highlightRef : null}
                            className={`inline-block transition-all duration-100 ease-out mx-1 ${
                              isCurrentWord 
                                ? "text-foreground scale-105" 
                                : isPastWord 
                                  ? "text-foreground" 
                                  : "text-foreground"
                            }`}
                            style={{
                              opacity,
                              textShadow: isCurrentWord 
                                ? '0 0 30px rgba(255,255,255,0.5), 0 0 60px rgba(100,150,255,0.3), 0 4px 12px rgba(0,0,0,0.9)' 
                                : '0 2px 8px rgba(0,0,0,0.9)',
                              transform: isCurrentWord ? 'scale(1.05)' : 'scale(1)',
                              color: isCurrentWord ? '#ffffff' : undefined,
                            }}
                          >
                            {word}
                          </span>
                        )
                      })
                    })()}
                  </p>
                  
                  {/* Animated underline for current word */}
                  <div className="mt-3 flex justify-center">
                    <div 
                      className="h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent transition-all duration-200"
                      style={{ width: currentWordIndex >= 0 ? '120px' : '0px', opacity: 0.6 }}
                    />
                  </div>
                </div>

                {/* Next line preview - fading in */}
                {currentWordIndex + 5 < words.length && (
                  <div className="absolute bottom-8 left-0 right-0 text-center opacity-40 transition-opacity duration-300">
                    <p className="text-base md:text-lg text-foreground/50 font-medium">
                      {words.slice(currentWordIndex + 5, currentWordIndex + 12).join(' ')}
                    </p>
                  </div>
                )}
              </div>
              
              {/* Bottom progress bar */}
              <div className="relative z-20 px-8 pb-5">
                <div className="flex items-center gap-4">
                  {/* Time-like display */}
                  <span className="text-xs font-mono text-foreground/50 w-12 text-right">
                    {currentWordIndex + 1}
                  </span>
                  
                  {/* Progress track */}
                  <div className="flex-1 h-1 bg-foreground/10 rounded-full overflow-hidden relative">
                    {/* Buffer/loaded indicator */}
                    <div className="absolute inset-0 bg-foreground/5" />
                    
                    {/* Progress fill */}
                    <div 
                      className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full transition-all duration-100 ease-linear relative"
                      style={{ 
                        width: `${Math.max(0, ((currentWordIndex + 1) / words.length) * 100)}%`
                      }}
                    >
                      {/* Glowing head */}
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-foreground rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                    </div>
                  </div>
                  
                  {/* Total words */}
                  <span className="text-xs font-mono text-foreground/50 w-12">
                    {words.length}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Voice Selection */}
      <Card className="border-border bg-card">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-muted-foreground">
              Voice
            </label>
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
              <button
                onClick={() => setVoiceFilter("en")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  voiceFilter === "en" 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                English
              </button>
              <button
                onClick={() => setVoiceFilter("all")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  voiceFilter === "all" 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All Languages
              </button>
            </div>
          </div>
          
          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
            <SelectTrigger className="w-full bg-secondary border-border">
              <SelectValue placeholder="Select a voice" />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {Object.entries(groupedVoices).map(([group, groupVoices]) => (
                <div key={group}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-secondary/50 sticky top-0">
                    {group} ({groupVoices.length})
                  </div>
                  {groupVoices.map((voice) => (
                    <SelectItem key={voice.name} value={voice.name} className="pl-4">
                      <div className="flex flex-col">
                        <span>{voice.name.replace(/Microsoft |Google |Apple /, '')}</span>
                        <span className="text-xs text-muted-foreground">{voice.lang}</span>
                      </div>
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
          
          <p className="text-xs text-muted-foreground">
            {filteredVoices.length} voices available
          </p>
        </CardContent>
      </Card>

      {/* Controls */}
      <Card className="border-border bg-card">
        <CardContent className="p-6 space-y-6">
          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={handleStop}
              disabled={!isPlaying && !isPaused}
              className="h-12 w-12 rounded-full border-border hover:bg-secondary bg-transparent"
              aria-label="Stop"
            >
              <Square className="h-5 w-5" />
            </Button>
            
            <Button
              onClick={isPlaying ? handlePause : handlePlay}
              disabled={!text.trim() && !isPaused}
              className="h-16 w-16 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="h-7 w-7" />
              ) : (
                <Play className="h-7 w-7 ml-1" />
              )}
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={handleDownload}
              disabled={!text.trim() || isRecording}
              className="h-12 w-12 rounded-full border-border hover:bg-secondary bg-transparent"
              aria-label="Download audio"
            >
              {isRecording ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Download className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Download Progress */}
          {downloadProgress && (
            <div className="text-center">
              <span className="text-sm text-accent">{downloadProgress}</span>
            </div>
          )}

          {/* Speed Control */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Gauge className="h-4 w-4" />
                <span>Speed</span>
              </div>
              <span className="text-sm font-medium text-foreground">{speed}x</span>
            </div>
            <Slider
              value={[speed]}
              onValueChange={handleSpeedChange}
              min={0.5}
              max={2}
              step={0.25}
              className="w-full"
              aria-label="Playback speed"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              {speedLabels.map((label) => (
                <button
                  key={label.value}
                  onClick={() => setSpeed(label.value)}
                  className={`transition-colors hover:text-foreground ${
                    speed === label.value ? "text-primary font-medium" : ""
                  }`}
                >
                  {label.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pitch Control */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Music className="h-4 w-4" />
                <span>Pitch</span>
              </div>
              <span className="text-sm font-medium text-foreground">{pitch.toFixed(1)}</span>
            </div>
            <Slider
              value={[pitch]}
              onValueChange={handlePitchChange}
              min={0.5}
              max={2}
              step={0.1}
              className="w-full"
              aria-label="Pitch"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <button
                onClick={() => setPitch(0.5)}
                className={`transition-colors hover:text-foreground ${pitch === 0.5 ? "text-primary font-medium" : ""}`}
              >
                Deep
              </button>
              <button
                onClick={() => setPitch(1)}
                className={`transition-colors hover:text-foreground ${pitch === 1 ? "text-primary font-medium" : ""}`}
              >
                Normal
              </button>
              <button
                onClick={() => setPitch(1.5)}
                className={`transition-colors hover:text-foreground ${pitch === 1.5 ? "text-primary font-medium" : ""}`}
              >
                Higher
              </button>
              <button
                onClick={() => setPitch(2)}
                className={`transition-colors hover:text-foreground ${pitch === 2 ? "text-primary font-medium" : ""}`}
              >
                Highest
              </button>
            </div>
          </div>

          {/* Volume Control */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Volume2 className="h-4 w-4" />
                <span>Volume</span>
              </div>
              <span className="text-sm font-medium text-foreground">{Math.round(volume * 100)}%</span>
            </div>
            <Slider
              value={[volume]}
              onValueChange={handleVolumeChange}
              min={0}
              max={1}
              step={0.1}
              className="w-full"
              aria-label="Volume"
            />
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <p className="text-center text-xs text-muted-foreground">
        Powered by Web Speech API. Voice availability depends on your browser and system.
      </p>
    </div>
  )
}
