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
import { Play, Pause, Square, Volume2, Gauge, Download, Loader2, FileText, Subtitles, Sparkles } from "lucide-react"

export function TextToSpeech() {
  const [text, setText] = useState("")
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [volume, setVolume] = useState(1)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState("")
  const [currentWordIndex, setCurrentWordIndex] = useState(-1)
  const [words, setWords] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'full-text' | 'netflix'>('full-text')
  const [paragraphs, setParagraphs] = useState<Array<{ text: string; words: string[] }>>([])
  const [isUserScrolling, setIsUserScrolling] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState("en-US-AriaNeural")
  const highlightRef = useRef<HTMLSpanElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const textContainerRef = useRef<HTMLDivElement>(null)
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const wordHighlightIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Popular Edge-TTS voices
  const edgeVoices = [
    { id: "en-US-AriaNeural", name: "Aria", description: "Friendly, warm female (US)" },
    { id: "en-US-JennyNeural", name: "Jenny", description: "Professional, clear female (US)" },
    { id: "en-US-GuyNeural", name: "Guy", description: "Casual, friendly male (US)" },
    { id: "en-GB-SoniaNeural", name: "Sonia", description: "Elegant, refined female (UK)" },
    { id: "en-AU-NatashaNeural", name: "Natasha", description: "Friendly, energetic female (AU)" },
    { id: "en-CA-ClaraNeural", name: "Clara", description: "Warm, conversational female (CA)" },
  ]

  // Auto-scroll to current word
  useEffect(() => {
    if (viewMode === 'full-text' && highlightRef.current && !isUserScrolling && textContainerRef.current) {
      const container = textContainerRef.current
      const element = highlightRef.current
      const containerRect = container.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()

      // Check if element is outside comfortable reading zone (40%-60%)
      const relativePosition = (elementRect.top - containerRect.top) / containerRect.height

      if (relativePosition > 0.6 || relativePosition < 0.4) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        })
      }
    } else if (viewMode === 'netflix' && highlightRef.current) {
      // For Netflix view, always scroll to center
      highlightRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      })
    }
  }, [currentWordIndex, isUserScrolling, viewMode])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current)
      }
      if (wordHighlightIntervalRef.current) {
        clearInterval(wordHighlightIntervalRef.current)
      }
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  // Word highlighting helper for audio playback - syncs with actual audio time
  const startWordHighlighting = useCallback(() => {
    if (wordHighlightIntervalRef.current) {
      clearInterval(wordHighlightIntervalRef.current)
    }
    
    if (!audioRef.current || typeof window === 'undefined') return
    
    const textWords = text.split(/(\s+)/).filter(word => word.trim().length > 0)
    const totalWords = textWords.length
    if (totalWords === 0) return

    // Wait for audio metadata to load to get actual duration
    const checkDuration = () => {
      if (audioRef.current && audioRef.current.duration && audioRef.current.duration > 0 && !isNaN(audioRef.current.duration)) {
        const audioDuration = audioRef.current.duration * 1000 // Convert to milliseconds
        
        let currentIndex = 0
        const audioStartTime = audioRef.current.currentTime * 1000
        
        wordHighlightIntervalRef.current = setInterval(() => {
          if (!audioRef.current || audioRef.current.paused || audioRef.current.ended) {
            if (wordHighlightIntervalRef.current) {
              clearInterval(wordHighlightIntervalRef.current)
            }
            return
          }
          
          // Calculate current position based on actual audio playback time
          const currentAudioTime = audioRef.current.currentTime * 1000
          const elapsedTime = Math.max(0, currentAudioTime - audioStartTime)
          const progress = Math.min(1, elapsedTime / audioDuration)
          const targetIndex = Math.min(Math.floor(progress * totalWords), totalWords - 1)
          
          if (targetIndex !== currentIndex && targetIndex >= 0) {
            currentIndex = targetIndex
            setCurrentWordIndex(currentIndex)
          }
          
          // Stop if audio ended
          if (audioRef.current.ended || currentIndex >= totalWords - 1) {
            setCurrentWordIndex(totalWords - 1)
            if (wordHighlightIntervalRef.current) {
              clearInterval(wordHighlightIntervalRef.current)
            }
          }
        }, 50) // Check every 50ms for smooth updates
      } else {
        // Retry after a short delay if duration not loaded yet
        setTimeout(checkDuration, 100)
      }
    }
    
    checkDuration()
  }, [text])

  const handlePlay = useCallback(async () => {
    if (isPaused) {
      if (audioRef.current) {
        audioRef.current.play()
        setIsPaused(false)
        setIsPlaying(true)
        startWordHighlighting()
      }
      return
    }

    if (!text.trim()) {
      return
    }

    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if (wordHighlightIntervalRef.current) {
      clearInterval(wordHighlightIntervalRef.current)
    }

    // Parse text into words for highlighting
    const textWords = text.split(/(\s+)/).filter(word => word.trim().length > 0)
    setWords(textWords)
    setCurrentWordIndex(-1)

    // Parse paragraphs for full-text view
    const textParagraphs = text.split(/\n\n+/).filter(p => p.trim())
    const paragraphsWithWords = textParagraphs.map(para => {
      const paraWords = para.split(/(\s+)/).filter(w => w.trim().length > 0)
      return { text: para, words: paraWords }
    })
    setParagraphs(paragraphsWithWords)

    setIsLoadingAudio(true)
    try {
      // Convert speed (0.5-2.0) to Edge-TTS rate (-50% to +100%)
      const rate = Math.round((speed - 1) * 100)
      
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          voice: selectedVoice,
          rate: rate,
          pitch: 0, // Can be adjusted if needed
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to generate speech')
      }

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      
      // Create or update audio element
      if (!audioRef.current) {
        audioRef.current = new Audio()
      }
      
      audioRef.current.src = audioUrl
      audioRef.current.volume = volume
      audioRef.current.playbackRate = speed
      
      audioRef.current.onended = () => {
        setIsPlaying(false)
        setIsPaused(false)
        setCurrentWordIndex(-1)
        if (wordHighlightIntervalRef.current) {
          clearInterval(wordHighlightIntervalRef.current)
        }
        URL.revokeObjectURL(audioUrl)
      }

      audioRef.current.onerror = () => {
        setIsPlaying(false)
        setIsPaused(false)
        setIsLoadingAudio(false)
        setCurrentWordIndex(-1)
      }

      // Wait for audio to be ready before starting
      audioRef.current.onloadedmetadata = () => {
        startWordHighlighting()
      }
      
      await audioRef.current.play()
      setIsPlaying(true)
      setIsPaused(false)
      setIsLoadingAudio(false)
      
      // Start highlighting after a short delay to ensure audio is playing
      setTimeout(() => {
        startWordHighlighting()
      }, 100)
    } catch (error: any) {
      console.error('Edge-TTS Error:', error)
      setIsLoadingAudio(false)
      alert(error.message || 'Failed to generate speech.')
    }
  }, [text, speed, volume, selectedVoice, startWordHighlighting])

  const handlePause = useCallback(() => {
    if (isPlaying && !isPaused && audioRef.current) {
      audioRef.current.pause()
      // Keep the interval running but it will check paused state
      setIsPaused(true)
      setIsPlaying(false)
    }
  }, [isPlaying, isPaused])

  const handleStop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if (wordHighlightIntervalRef.current) {
      clearInterval(wordHighlightIntervalRef.current)
    }
    setIsPlaying(false)
    setIsPaused(false)
    setCurrentWordIndex(-1)
  }, [])

  const handleDownload = useCallback(async () => {
    if (!text.trim() || isRecording) {
      return
    }

    setIsRecording(true)
    setDownloadProgress("Generating audio...")

    try {
      // Convert speed (0.5-2.0) to Edge-TTS rate (-50% to +100%)
      const rate = Math.round((speed - 1) * 100)
      
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          voice: selectedVoice,
          rate: rate,
          pitch: 0,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to generate speech')
      }

      const audioBlob = await response.blob()
      
      // Download the audio file
      const url = URL.createObjectURL(audioBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `speech-${Date.now()}.mp3`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      setDownloadProgress("Downloaded!")
    } catch (error: any) {
      console.error('Download error:', error)
      setDownloadProgress(error.message || "Download failed")
    } finally {
      setTimeout(() => {
        setIsRecording(false)
        setDownloadProgress("")
      }, 2000)
    }
  }, [text, speed, selectedVoice, isRecording])

  const handleSpeedChange = (value: number[]) => {
    setSpeed(value[0])
    if (audioRef.current) {
      audioRef.current.playbackRate = value[0]
    }
  }

  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0])
    if (audioRef.current) {
      audioRef.current.volume = value[0]
    }
  }

  // User scroll detection handler
  const handleUserScroll = useCallback(() => {
    setIsUserScrolling(true)

    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current)
    }

    // Resume auto-scroll after 3 seconds
    userScrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false)
    }, 3000)
  }, [])

  const speedLabels = [
    { value: 0.5, label: "0.5x" },
    { value: 0.75, label: "0.75x" },
    { value: 1, label: "1x" },
    { value: 1.25, label: "1.25x" },
    { value: 1.5, label: "1.5x" },
    { value: 2, label: "2x" },
  ]

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

          {/* Display view - shown when playing/paused */}
          {(isPlaying || isPaused) && words.length > 0 && (
            <>
              {viewMode === 'netflix' ? (
                /* Netflix-style subtitle display */
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
                            className={`inline-block transition-all duration-150 ease-out mx-1 px-2 py-1 rounded-md ${
                              isCurrentWord
                                ? "text-foreground scale-110 font-bold bg-gradient-to-r from-primary/30 via-primary/20 to-primary/10 border-b-2 border-primary"
                                : isPastWord
                                  ? "text-foreground/60"
                                  : "text-foreground"
                            }`}
                            style={{
                              opacity,
                              textShadow: isCurrentWord
                                ? '0 0 30px rgba(255,255,255,0.6), 0 0 60px rgba(100,150,255,0.4), 0 4px 12px rgba(0,0,0,0.9)'
                                : '0 2px 8px rgba(0,0,0,0.9)',
                              transform: isCurrentWord ? 'scale(1.1)' : 'scale(1)',
                              color: isCurrentWord ? '#ffffff' : undefined,
                              boxShadow: isCurrentWord ? '0 4px 16px rgba(100, 150, 255, 0.4)' : undefined,
                            }}
                          >
                            {word}
                          </span>
                        )
                      })
                    })()}
                  </p>
                  
                  {/* Animated glow bar for current word */}
                  <div className="mt-4 flex justify-center">
                    <div
                      className="h-1 bg-gradient-to-r from-transparent via-primary to-transparent transition-all duration-200 rounded-full"
                      style={{
                        width: currentWordIndex >= 0 ? '150px' : '0px',
                        opacity: 0.8,
                        boxShadow: '0 0 20px rgba(100, 150, 255, 0.6)'
                      }}
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
              ) : (
                /* Full Text View */
                <div className="relative bg-card rounded-lg border">
                  {/* Ambient background */}
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                       style={{
                         background: 'radial-gradient(ellipse at center, hsl(var(--primary)) 0%, transparent 70%)'
                       }} />

                  {/* Scrollable text container */}
                  <div
                    ref={textContainerRef}
                    className="relative overflow-y-auto max-h-[500px] px-8 py-12 text-scroll-container"
                    onScroll={handleUserScroll}
                  >
                    <div className="max-w-3xl mx-auto space-y-6">
                      {paragraphs.map((para, pIdx) => {
                        // Calculate the global word offset for this paragraph
                        let globalWordOffset = 0
                        for (let i = 0; i < pIdx; i++) {
                          globalWordOffset += paragraphs[i].words.length
                        }

                        return (
                          <p key={pIdx} className="text-base md:text-lg leading-relaxed">
                            {para.words.map((word, wIdx) => {
                              const globalWordIdx = globalWordOffset + wIdx
                              const isCurrent = globalWordIdx === currentWordIndex
                              const isPast = globalWordIdx < currentWordIndex

                              return (
                                <span
                                  key={wIdx}
                                  ref={isCurrent ? highlightRef : null}
                                  className={`inline-block transition-all duration-150 ease-out mx-0.5 px-1 rounded-sm ${
                                    isCurrent
                                      ? "bg-gradient-to-r from-primary/20 via-primary/10 to-transparent scale-[1.02] font-semibold border-b-2 border-primary"
                                      : isPast
                                        ? "opacity-40 blur-[0.3px]"
                                        : "opacity-70"
                                  }`}
                                  style={isCurrent ? {
                                    boxShadow: '0 2px 8px hsl(var(--primary) / 0.2)'
                                  } : {}}
                                >
                                  {word}
                                </span>
                              )
                            })}
                          </p>
                        )
                      })}
                    </div>
                  </div>

                  {/* Progress bar at bottom */}
                  <div className="sticky bottom-0 left-0 right-0 h-1 bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${(currentWordIndex / words.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Voice Selection */}
      <Card className="border-border bg-card">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Voice Selection</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Choose from high-quality Microsoft Edge neural voices. Free and no API key required.
          </p>
          
          <div>
            <label htmlFor="voice-select" className="block text-sm font-medium text-muted-foreground mb-2">
              Select Voice
            </label>
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger className="w-full bg-secondary border-border">
                <SelectValue placeholder="Select a voice" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {edgeVoices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{voice.name}</span>
                      <span className="text-xs text-muted-foreground">{voice.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              Powered by Microsoft Edge-TTS • Free and unlimited
            </p>
          </div>
        </CardContent>
      </Card>

      {/* View Mode Toggle - shown only when playing/paused */}
      {(isPlaying || isPaused) && (
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-center gap-2">
              <Button
                variant={viewMode === 'full-text' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (isPlaying) {
                    handlePause()
                  }
                  setViewMode('full-text')
                }}
              >
                <FileText className="w-4 h-4 mr-2" />
                Full Text
              </Button>
              <Button
                variant={viewMode === 'netflix' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (isPlaying) {
                    handlePause()
                  }
                  setViewMode('netflix')
                }}
              >
                <Subtitles className="w-4 h-4 mr-2" />
                Focus Mode
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
              disabled={(!text.trim() && !isPaused) || isLoadingAudio}
              className="h-16 w-16 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isLoadingAudio ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : isPlaying ? (
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
        Powered by Microsoft Edge-TTS. Free, high-quality neural voice synthesis.
      </p>
    </div>
  )
}
