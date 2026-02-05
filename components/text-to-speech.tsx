"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Play, Pause, Square, Volume2, Gauge, Download, Loader2, FileText, Subtitles, Sparkles, Trash2, Upload, X } from "lucide-react"

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
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1)
  const [words, setWords] = useState<string[]>([])
  const [sentences, setSentences] = useState<Array<{ text: string; words: string[]; startWordIndex: number; endWordIndex: number }>>([])
  const [viewMode, setViewMode] = useState<'full-text' | 'netflix'>('full-text')
  const [paragraphs, setParagraphs] = useState<Array<{ text: string; words: string[] }>>([])
  const [isUserScrolling, setIsUserScrolling] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState("en-US-AriaNeural")
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [currentAudioTime, setCurrentAudioTime] = useState(0)
  const [isSeeking, setIsSeeking] = useState(false)
  const [seekPosition, setSeekPosition] = useState<number | null>(null)
  const highlightRef = useRef<HTMLSpanElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const textContainerRef = useRef<HTMLDivElement>(null)
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const wordHighlightIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Popular Edge-TTS voices
  const edgeVoices = [
    { id: "en-US-AriaNeural", name: "Aria", description: "Friendly, warm female (US)" },
    { id: "en-US-JennyNeural", name: "Jenny", description: "Professional, clear female (US)" },
    { id: "en-US-GuyNeural", name: "Guy", description: "Casual, friendly male (US)" },
    { id: "en-GB-SoniaNeural", name: "Sonia", description: "Elegant, refined female (UK)" },
    { id: "en-AU-NatashaNeural", name: "Natasha", description: "Friendly, energetic female (AU)" },
    { id: "en-CA-ClaraNeural", name: "Clara", description: "Warm, conversational female (CA)" },
  ]

  // Function to remove LaTeX citations from text
  const removeLatexCitations = useCallback((text: string): string => {
    // Remove LaTeX citation commands: \cite{}, \citep{}, \citet{}, \citeauthor{}, \citeyear{}, etc.
    let cleaned = text.replace(/\\cite[a-z]*\{[^}]*\}/g, '')
    
    // Remove numeric citations in brackets: [1], [1,2,3], [1-5], etc.
    cleaned = cleaned.replace(/\[\d+[,\-\d\s]*\]/g, '')
    
    // Remove author-year citations in parentheses: (Author, 2023), (Author et al., 2023)
    cleaned = cleaned.replace(/\([A-Z][a-zA-Z\s,]+(?:et al\.)?,\s*\d{4}[a-z]?\)/g, '')
    
    // Remove standalone citation numbers: ^1, ^[1], (1), etc.
    cleaned = cleaned.replace(/\^\[?\d+\]?/g, '')
    cleaned = cleaned.replace(/\(\d+\)/g, '')
    
    // Clean up multiple spaces and trim
    cleaned = cleaned.replace(/\s+/g, ' ').trim()
    
    return cleaned
  }, [])

  // Function to convert LaTeX table to readable text
  const convertLatexTable = useCallback((tableContent: string): string => {
    // Extract tabular content
    const tabularMatch = tableContent.match(/\\begin\{tabular\}.*?\\end\{tabular\}/s)
    if (!tabularMatch) return ''
    
    let tabular = tabularMatch[0]
    
    // Remove table commands but keep content
    tabular = tabular.replace(/\\begin\{tabular\}\{.*?\}/, '')
    tabular = tabular.replace(/\\end\{tabular\}/, '')
    
    // Replace column separators
    tabular = tabular.replace(/&/g, ' | ')
    
    // Replace row separators
    tabular = tabular.replace(/\\\\/g, '\n')
    
    // Remove LaTeX commands within cells
    tabular = tabular.replace(/\\[a-zA-Z@]+\*?\{[^}]*\}/g, '')
    tabular = tabular.replace(/\\[a-zA-Z@]+/g, '')
    
    // Remove horizontal lines
    tabular = tabular.replace(/\\hline/g, '')
    tabular = tabular.replace(/\\cline\{[^}]+\}/g, '')
    
    // Clean up braces
    tabular = tabular.replace(/\{([^{}]*)\}/g, '$1')
    
    // Clean up whitespace
    tabular = tabular.replace(/\s*\|\s*/g, ' | ')
    tabular = tabular.trim()
    
    return tabular || ''
  }, [])

  // Function to remove all LaTeX commands and convert to plain text
  const removeAllLatexCommands = useCallback((text: string): string => {
    let cleaned = text
    
    // Remove LaTeX comments: % comment (but preserve % in URLs)
    cleaned = cleaned.replace(/^%.*$/gm, '')
    cleaned = cleaned.replace(/(?<!\w)%.*$/gm, '')
    
    // Extract and convert tables before removing environments
    const tableMatches: Array<{ match: string; replacement: string }> = []
    const tableRegex = /\\begin\{table\}[\s\S]*?\\end\{table\}/gi
    let match
    while ((match = tableRegex.exec(cleaned)) !== null) {
      const tableText = convertLatexTable(match[0])
      if (tableText) {
        tableMatches.push({ match: match[0], replacement: `\n\nTABLE:\n${tableText}\n\n` })
      }
    }
    
    // Replace tables with converted versions
    tableMatches.forEach(({ match, replacement }) => {
      cleaned = cleaned.replace(match, replacement)
    })
    
    // Extract and convert tabular environments (standalone tables)
    const tabularMatches: Array<{ match: string; replacement: string }> = []
    const tabularRegex = /\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/gi
    while ((match = tabularRegex.exec(cleaned)) !== null) {
      const tableText = convertLatexTable(match[0])
      if (tableText) {
        tabularMatches.push({ match: match[0], replacement: `\n\nTABLE:\n${tableText}\n\n` })
      }
    }
    
    // Replace tabular with converted versions
    tabularMatches.forEach(({ match, replacement }) => {
      cleaned = cleaned.replace(match, replacement)
    })
    
    // Remove LaTeX environments: \begin{env}...\end{env} (handle nested cases)
    // But skip table environments as they're already processed
    let prevLength = 0
    while (cleaned.length !== prevLength) {
      prevLength = cleaned.length
      // Don't remove table/tabular as they're already converted
      cleaned = cleaned.replace(/\\begin\{(?!table|tabular)[^}]+\}[\s\S]*?\\end\{(?!table|tabular)[^}]+\}/g, '')
    }
    
    // Remove LaTeX math delimiters: $$...$$, $...$, \(...\), \[...\]
    cleaned = cleaned.replace(/\$\$[\s\S]*?\$\$/g, '')
    cleaned = cleaned.replace(/\$[^$\n]*\$/g, '')
    cleaned = cleaned.replace(/\\\([\s\S]*?\\\)/g, '')
    cleaned = cleaned.replace(/\\\[[\s\S]*?\\\]/g, '')
    
    // Remove LaTeX commands with nested braces: \command{arg} or \command[opt]{arg}
    // Handle nested braces by iterating
    prevLength = 0
    while (cleaned.length !== prevLength) {
      prevLength = cleaned.length
      // Remove commands with optional arguments and required arguments
      cleaned = cleaned.replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])*(\{[^{}]*\})*/g, '')
      // Remove commands with nested braces (simple case)
      cleaned = cleaned.replace(/\\[a-zA-Z@]+\*?\{[^{}]*\}/g, '')
    }
    
    // Extract content from LaTeX formatting commands: \textbf{text} -> text
    // This preserves the text content while removing formatting
    cleaned = cleaned.replace(/\\[a-z]+\*?\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gi, '$1')
    
    // Remove LaTeX special character commands: \&, \%, \$, \#, \_, \{, \}
    cleaned = cleaned.replace(/\\[&%$#_{}]/g, '')
    
    // Remove remaining LaTeX commands (standalone)
    cleaned = cleaned.replace(/\\[a-zA-Z@]+\*?/g, '')
    
    // Remove LaTeX citations (comprehensive)
    cleaned = removeLatexCitations(cleaned)
    
    // Remove standalone curly braces but preserve content: {content} -> content
    // Handle nested braces carefully
    prevLength = 0
    while (cleaned.length !== prevLength) {
      prevLength = cleaned.length
      cleaned = cleaned.replace(/\{([^{}]*)\}/g, '$1')
    }
    
    // Remove square brackets (but preserve content): [content] -> content
    cleaned = cleaned.replace(/\[([^\]]*)\]/g, '$1')
    
    // Remove LaTeX label references: \ref{}, \eqref{}, \pageref{}, etc.
    cleaned = cleaned.replace(/\\[a-z]*ref\{[^}]*\}/gi, '')
    
    // Remove LaTeX footnotes: \footnote{}, \footnotemark{}, etc.
    cleaned = cleaned.replace(/\\footnote[a-z]*\{[^}]*\}/gi, '')
    
    // Remove LaTeX URLs and hyperlinks: \url{}, \href{}{}
    cleaned = cleaned.replace(/\\url\{([^}]*)\}/gi, '$1')
    cleaned = cleaned.replace(/\\href\{[^}]*\}\{([^}]*)\}/gi, '$1')
    
    // Remove LaTeX sectioning commands: \section{}, \subsection{}, etc. (but keep titles)
    cleaned = cleaned.replace(/\\[a-z]*section\*?\{([^}]*)\}/gi, '$1\n\n')
    
    // Clean up whitespace: multiple spaces -> single space
    cleaned = cleaned.replace(/[ \t]+/g, ' ')
    
    // Clean up multiple newlines: more than 2 consecutive -> 2
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
    
    // Remove leading/trailing whitespace from each line
    cleaned = cleaned.split('\n').map(line => line.trim()).join('\n')
    
    // Final trim
    cleaned = cleaned.trim()
    
    return cleaned
  }, [removeLatexCitations])

  // Handle LaTeX file import and sanitization
  const handleFileImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      console.log('No file selected')
      return
    }

    console.log('File selected:', file.name, file.type, file.size)

    // Check if it's a LaTeX or text file
    if (!file.name.match(/\.(tex|txt|latex)$/i)) {
      alert('Please select a .tex, .latex, or .txt file')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    // Check file size (limit to 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File is too large. Please select a file smaller than 10MB.')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const fileContent = e.target?.result as string
      console.log('File content length:', fileContent?.length)
      if (fileContent) {
        // Sanitize the LaTeX content
        const cleanedText = removeAllLatexCommands(fileContent)
        console.log('Cleaned text length:', cleanedText.length)
        
        if (cleanedText.trim().length === 0) {
          alert('The file appears to contain only LaTeX commands. No readable text was found.')
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
          return
        }
        
        setText(cleanedText)
      }
      
      // Reset file input after processing
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
    reader.onerror = (error) => {
      console.error('FileReader error:', error)
      alert('Error reading file. Please try again.')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
    reader.readAsText(file, 'UTF-8')
  }, [removeAllLatexCommands])

  // Clean current text
  const handleCleanText = useCallback(() => {
    if (!text.trim()) return
    const cleanedText = removeAllLatexCommands(text)
    setText(cleanedText)
  }, [text, removeAllLatexCommands])

  // Stop waveform visualization
  const stopWaveformVisualization = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  // Start waveform visualization animation
  const startWaveformVisualization = useCallback(() => {
    if (!analyserRef.current || !canvasRef.current) return
    
    // Stop any existing animation
    stopWaveformVisualization()
    
    const analyser = analyserRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Set canvas dimensions
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    const canvasWidth = rect.width
    const canvasHeight = rect.height
    
    const draw = () => {
      if (!analyserRef.current || !canvasRef.current || !audioRef.current) {
        return
      }
      
      analyserRef.current.getByteFrequencyData(dataArray)
      
      // Update current audio time
      if (audioRef.current) {
        setCurrentAudioTime(audioRef.current.currentTime)
      }
      
      // Normalize and store waveform data for static visualization
      const normalizedData = Array.from(dataArray).slice(0, 100).map(val => val / 255)
      setWaveformData(normalizedData)
      
      // Draw real-time waveform with moving effect
      ctx.fillStyle = '#050505'
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)
      
      // Calculate progress for scrolling effect
      let progress = 0
      if (audioRef.current && audioRef.current.duration) {
        progress = audioRef.current.currentTime / audioRef.current.duration
      }
      
      // Show seek position if user is hovering/clicking
      const displayProgress = seekPosition !== null ? seekPosition : progress
      
      // Draw waveform bars with animated effect
      const barWidth = canvasWidth / bufferLength * 2.5
      const centerY = canvasHeight / 2
      let x = 0
      
      // Add time-based offset for moving effect
      const timeOffset = Date.now() * 0.001
      
      for (let i = 0; i < bufferLength; i++) {
        // Get amplitude with some variation for visual interest
        const baseAmplitude = dataArray[i] / 255
        const waveEffect = Math.sin((i * 0.1) + timeOffset) * 0.1
        const barHeight = (baseAmplitude + waveEffect) * canvasHeight * 0.7
        
        // Calculate distance from current progress position
        const barPosition = x / canvasWidth
        const distanceFromProgress = Math.abs(barPosition - displayProgress)
        
        // Color based on position relative to progress
        let colorStart = '#1db954'
        let colorMid = '#1ed760'
        let colorEnd = '#ffffff'
        let opacity = 1
        
        if (barPosition < displayProgress) {
          // Past position - dimmer
          opacity = 0.4
        } else if (barPosition > displayProgress + 0.05) {
          // Future position - very dim
          opacity = 0.2
        } else {
          // Near current position - bright
          opacity = 1
        }
        
        // Create gradient
        const gradient = ctx.createLinearGradient(0, centerY + barHeight/2, 0, centerY - barHeight/2)
        gradient.addColorStop(0, colorStart)
        gradient.addColorStop(0.5, colorMid)
        gradient.addColorStop(1, colorEnd)
        
        ctx.globalAlpha = opacity
        ctx.fillStyle = gradient
        ctx.fillRect(x, centerY - barHeight/2, barWidth - 1, barHeight)
        
        x += barWidth + 1
      }
      
      ctx.globalAlpha = 1
      
      // Draw progress indicator with glow effect
      if (audioRef.current && audioRef.current.duration) {
        const progressX = displayProgress * canvasWidth
        
        // Draw glow
        const glowGradient = ctx.createRadialGradient(progressX, canvasHeight/2, 0, progressX, canvasHeight/2, 20)
        glowGradient.addColorStop(0, 'rgba(29, 185, 84, 0.5)')
        glowGradient.addColorStop(1, 'rgba(29, 185, 84, 0)')
        ctx.fillStyle = glowGradient
        ctx.fillRect(progressX - 20, 0, 40, canvasHeight)
        
        // Draw progress line
        ctx.strokeStyle = '#1db954'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(progressX, 0)
        ctx.lineTo(progressX, canvasHeight)
        ctx.stroke()
        
        // Draw progress circle
        ctx.fillStyle = '#1db954'
        ctx.beginPath()
        ctx.arc(progressX, canvasHeight/2, 6, 0, Math.PI * 2)
        ctx.fill()
        
        // White center dot
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(progressX, canvasHeight/2, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      
      animationFrameRef.current = requestAnimationFrame(draw)
    }
    
    draw()
  }, [stopWaveformVisualization, seekPosition])

  // Set up Web Audio API for visualization
  const setupAudioVisualization = useCallback((audioElement: HTMLAudioElement) => {
    if (typeof window === 'undefined') return

    try {
      // Create or reuse AudioContext
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      
      const audioContext = audioContextRef.current
      
      // Resume audio context if suspended (required by some browsers)
      if (audioContext.state === 'suspended') {
        audioContext.resume()
      }
      
      // Create analyser node
      if (!analyserRef.current) {
        analyserRef.current = audioContext.createAnalyser()
        analyserRef.current.fftSize = 2048
        analyserRef.current.smoothingTimeConstant = 0.8
      }
      
      const analyser = analyserRef.current
      
      // Create source from audio element
      const source = audioContext.createMediaElementSource(audioElement)
      source.connect(analyser)
      analyser.connect(audioContext.destination)
      
      // Start visualization loop
      startWaveformVisualization()
    } catch (error) {
      console.error('Error setting up audio visualization:', error)
    }
  }, [startWaveformVisualization])


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

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        const canvas = canvasRef.current
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * window.devicePixelRatio || 1
        canvas.height = rect.height * window.devicePixelRatio || 1
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1)
        }
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current)
      }
      if (wordHighlightIntervalRef.current) {
        clearInterval(wordHighlightIntervalRef.current)
      }
      stopWaveformVisualization()
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error)
        audioContextRef.current = null
      }
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [stopWaveformVisualization])

  // Word highlighting helper for audio playback - syncs with actual audio time
  // Uses improved timing estimation that accounts for word complexity and voice characteristics
  const startWordHighlighting = useCallback(() => {
    if (wordHighlightIntervalRef.current) {
      clearInterval(wordHighlightIntervalRef.current)
    }
    
    if (!audioRef.current || typeof window === 'undefined') return
    
    const textWords = text.split(/(\s+)/).filter(word => word.trim().length > 0)
    const totalWords = textWords.length
    if (totalWords === 0) return

    // Calculate word complexity scores (longer words and complex words take more time)
    const wordComplexityScores = textWords.map(word => {
      const length = word.length
      // Base score on length
      let score = length
      // Add complexity for capital letters, numbers, punctuation
      const hasCaps = /[A-Z]/.test(word)
      const hasNumbers = /\d/.test(word)
      const hasPunctuation = /[.,!?;:]/.test(word)
      if (hasCaps) score += 0.5
      if (hasNumbers) score += 1
      if (hasPunctuation) score += 0.8
      // Longer words generally take proportionally more time
      return Math.max(1, score)
    })
    
    const totalComplexity = wordComplexityScores.reduce((sum, score) => sum + score, 0)
    
    // Calculate cumulative complexity positions for each word
    const wordTimings: number[] = []
    let cumulativeComplexity = 0
    for (let i = 0; i < textWords.length; i++) {
      wordTimings.push(cumulativeComplexity)
      cumulativeComplexity += wordComplexityScores[i]
      // Add pause between words (estimate 0.3 complexity units for pause)
      cumulativeComplexity += 0.3
    }

    // Wait for audio metadata to load to get actual duration
    const checkDuration = () => {
      if (audioRef.current && audioRef.current.duration && audioRef.current.duration > 0 && !isNaN(audioRef.current.duration)) {
        const audioDuration = audioRef.current.duration // in seconds
        
        // Calculate actual speaking rate from audio duration
        // Use complexity units per second instead of characters per second
        const actualComplexityPerSecond = totalComplexity / audioDuration
        
        // Add a small calibration offset based on voice characteristics
        // Different voices may have slightly different timing patterns
        let voiceTimingOffset = 0
        // Some voices speak slightly faster or slower
        if (selectedVoice.includes('Neural')) {
          // Neural voices tend to be more consistent
          voiceTimingOffset = 0
        }
        
        let lastIndex = -1
        let calibrationSamples: number[] = [] // Store samples for calibration
        let calibrationComplete = false
        
        wordHighlightIntervalRef.current = setInterval(() => {
          if (!audioRef.current || audioRef.current.paused || audioRef.current.ended) {
            if (wordHighlightIntervalRef.current) {
              clearInterval(wordHighlightIntervalRef.current)
            }
            return
          }
          
          // Get current audio playback time
          const currentAudioTime = audioRef.current.currentTime // in seconds
          
          // Calibration phase: collect timing samples for first few words
          if (!calibrationComplete && currentAudioTime < audioDuration * 0.1 && lastIndex >= 0 && lastIndex < 5) {
            const expectedTime = wordTimings[lastIndex] / actualComplexityPerSecond
            const actualTime = currentAudioTime
            if (Math.abs(expectedTime - actualTime) > 0.1) {
              calibrationSamples.push(actualTime - expectedTime)
            }
          } else if (!calibrationComplete && calibrationSamples.length >= 3) {
            // Calculate average offset
            const avgOffset = calibrationSamples.reduce((a, b) => a + b, 0) / calibrationSamples.length
            voiceTimingOffset = avgOffset
            calibrationComplete = true
          }
          
          // Calculate which word should be highlighted based on complexity timing
          let targetIndex = -1
          for (let i = 0; i < wordTimings.length; i++) {
            const wordStartComplexity = wordTimings[i]
            const wordEndComplexity = i < wordTimings.length - 1 
              ? wordTimings[i + 1] 
              : totalComplexity
            
            // Calculate time for this word based on complexity, with calibration offset
            const wordStartTime = (wordStartComplexity / actualComplexityPerSecond) + voiceTimingOffset
            const wordEndTime = (wordEndComplexity / actualComplexityPerSecond) + voiceTimingOffset
            
            // Check if current time is within this word's range
            // Add a small buffer for smoother transitions
            const buffer = 0.05 // 50ms buffer
            if (currentAudioTime >= wordStartTime - buffer && currentAudioTime < wordEndTime + buffer) {
              targetIndex = i
              break
            }
          }
          
          // Fallback: if we're past the last word, highlight it
          if (targetIndex === -1 && currentAudioTime >= (totalComplexity / actualComplexityPerSecond) + voiceTimingOffset) {
            targetIndex = totalWords - 1
          }
          
          // Update if we found a different word
          if (targetIndex !== lastIndex && targetIndex >= 0) {
            lastIndex = targetIndex
            setCurrentWordIndex(targetIndex)
            
            // Find which sentence contains this word and highlight the entire sentence
            // Get sentences from state or parse them here
            const textSentences: Array<{ startWordIndex: number; endWordIndex: number }> = []
            let wordIdx = 0
            const sentenceEndings = /([.!?]+)\s+/g
            const parts = text.split(sentenceEndings)
            let sentenceStartWordIndex = 0
            
            for (let i = 0; i < parts.length; i++) {
              const part = parts[i]
              if (/^[.!?]+$/.test(part.trim())) {
                const sentenceWords = parts.slice(Math.max(0, i - 1), i + 1).join('').split(/(\s+)/).filter(w => w.trim().length > 0)
                if (sentenceWords.length > 0) {
                  textSentences.push({
                    startWordIndex: sentenceStartWordIndex,
                    endWordIndex: sentenceStartWordIndex + sentenceWords.length - 1
                  })
                  wordIdx += sentenceWords.length
                  sentenceStartWordIndex = wordIdx
                }
              }
            }
            
            // Add remaining as final sentence
            if (wordIdx < textWords.length) {
              textSentences.push({
                startWordIndex: sentenceStartWordIndex,
                endWordIndex: textWords.length - 1
              })
            }
            
            const sentenceIndex = textSentences.findIndex(s => 
              targetIndex >= s.startWordIndex && targetIndex <= s.endWordIndex
            )
            if (sentenceIndex >= 0) {
              setCurrentSentenceIndex(sentenceIndex)
            }
          }
          
          // Stop if audio ended
          if (audioRef.current.ended || (targetIndex >= totalWords - 1 && currentAudioTime >= audioDuration - 0.1)) {
            setCurrentWordIndex(totalWords - 1)
            if (sentences.length > 0) {
              setCurrentSentenceIndex(sentences.length - 1)
            }
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
  }, [text, speed, selectedVoice, sentences])

  const handlePlay = useCallback(async () => {
    if (isPaused) {
      if (audioRef.current) {
        // Resume playback
        await audioRef.current.play()
        setIsPaused(false)
        setIsPlaying(true)
        // Restart highlighting and visualization from current position
        startWordHighlighting()
        startWaveformVisualization()
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
    setCurrentSentenceIndex(-1)

    // Parse text into sentences
    // Split by sentence-ending punctuation (. ! ?) followed by space or newline
    const textSentences: Array<{ text: string; words: string[]; startWordIndex: number; endWordIndex: number }> = []
    let wordIndex = 0
    
    // Split text into sentences using regex
    const sentenceEndings = /([.!?]+)\s+/g
    const parts = text.split(sentenceEndings)
    
    let currentSentence = ''
    let sentenceStartWordIndex = 0
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      
      if (/^[.!?]+$/.test(part.trim())) {
        // This is sentence-ending punctuation
        currentSentence += part
        const sentenceWords = currentSentence.split(/(\s+)/).filter(w => w.trim().length > 0)
        
        if (sentenceWords.length > 0) {
          const sentenceEndWordIndex = sentenceStartWordIndex + sentenceWords.length - 1
          
          textSentences.push({
            text: currentSentence.trim(),
            words: sentenceWords,
            startWordIndex: sentenceStartWordIndex,
            endWordIndex: sentenceEndWordIndex
          })
          
          wordIndex += sentenceWords.length
          sentenceStartWordIndex = wordIndex
        }
        currentSentence = ''
      } else if (part.trim()) {
        currentSentence += part
      }
    }
    
    // Add remaining text as final sentence if any
    if (currentSentence.trim()) {
      const sentenceWords = currentSentence.split(/(\s+)/).filter(w => w.trim().length > 0)
      if (sentenceWords.length > 0) {
        textSentences.push({
          text: currentSentence.trim(),
          words: sentenceWords,
          startWordIndex: sentenceStartWordIndex,
          endWordIndex: sentenceStartWordIndex + sentenceWords.length - 1
        })
      }
    }
    
    setSentences(textSentences)

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

      // Check content type
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('audio')) {
        const errorText = await response.text().catch(() => 'Unknown error')
        console.error('Invalid response type:', contentType, errorText)
        throw new Error('Server returned invalid audio format')
      }

      const audioBlob = await response.blob()
      
      // Validate blob
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('Received empty audio file')
      }
      
      // Check blob type
      if (!audioBlob.type.includes('audio') && audioBlob.type !== 'application/octet-stream') {
        console.warn('Unexpected blob type:', audioBlob.type)
      }
      
      const audioUrl = URL.createObjectURL(audioBlob)
      
      // Create or update audio element
      if (!audioRef.current) {
        audioRef.current = new Audio()
      }
      
      // Clean up previous audio URL if it exists
      const previousSrc = audioRef.current.src
      if (previousSrc && previousSrc.startsWith('blob:')) {
        URL.revokeObjectURL(previousSrc)
      }
      
      // Set up error handler before setting src
      audioRef.current.onerror = (e) => {
        console.error('Audio element error:', e)
        console.error('Audio error details:', {
          error: audioRef.current?.error,
          code: audioRef.current?.error?.code,
          message: audioRef.current?.error?.message,
          src: audioRef.current?.src,
          blobSize: audioBlob.size,
          blobType: audioBlob.type
        })
        setIsPlaying(false)
        setIsPaused(false)
        setIsLoadingAudio(false)
        setCurrentWordIndex(-1)
        URL.revokeObjectURL(audioUrl)
        
        const errorMsg = audioRef.current?.error 
          ? `Audio error: ${audioRef.current.error.message || 'Unknown error'}`
          : 'Failed to load audio. Please try again.'
        alert(errorMsg)
      }
      
      audioRef.current.onended = () => {
        setIsPlaying(false)
        setIsPaused(false)
        setCurrentWordIndex(-1)
        stopWaveformVisualization()
        if (wordHighlightIntervalRef.current) {
          clearInterval(wordHighlightIntervalRef.current)
        }
        URL.revokeObjectURL(audioUrl)
      }

      // Wait for audio to be ready before starting
      audioRef.current.onloadedmetadata = () => {
        console.log('Audio metadata loaded:', {
          duration: audioRef.current?.duration,
          readyState: audioRef.current?.readyState
        })
        startWordHighlighting()
      }
      
      audioRef.current.oncanplay = () => {
        console.log('Audio can play')
      }
      
      audioRef.current.src = audioUrl
      audioRef.current.volume = volume
      audioRef.current.playbackRate = speed
      
      // Set up Web Audio API for waveform visualization
      setupAudioVisualization(audioRef.current)
      
      // Load the audio
      audioRef.current.load()
      
      // Wait for audio to be ready
      await new Promise<void>((resolve, reject) => {
        if (!audioRef.current) {
          reject(new Error('Audio element not available'))
          return
        }
        
        const timeout = setTimeout(() => {
          reject(new Error('Audio loading timeout'))
        }, 10000) // 10 second timeout
        
        const onCanPlay = () => {
          clearTimeout(timeout)
          audioRef.current?.removeEventListener('canplay', onCanPlay)
          audioRef.current?.removeEventListener('error', onError)
          resolve()
        }
        
        const onError = () => {
          clearTimeout(timeout)
          audioRef.current?.removeEventListener('canplay', onCanPlay)
          audioRef.current?.removeEventListener('error', onError)
          reject(new Error('Audio failed to load'))
        }
        
        audioRef.current.addEventListener('canplay', onCanPlay, { once: true })
        audioRef.current.addEventListener('error', onError, { once: true })
      })
      
      await audioRef.current.play()
      setIsPlaying(true)
      setIsPaused(false)
      setIsLoadingAudio(false)
      
      // Start highlighting and visualization after a short delay to ensure audio is playing
      setTimeout(() => {
        startWordHighlighting()
        startWaveformVisualization()
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
      setIsPaused(true)
      setIsPlaying(false)
      // Stop waveform animation when paused
      stopWaveformVisualization()
      // Interval will continue but won't update when paused (checked in interval)
    }
  }, [isPlaying, isPaused, stopWaveformVisualization])

  const handleStop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    stopWaveformVisualization()
    if (wordHighlightIntervalRef.current) {
      clearInterval(wordHighlightIntervalRef.current)
    }
    setIsPlaying(false)
    setIsPaused(false)
    setCurrentWordIndex(-1)
    setCurrentSentenceIndex(-1)
    setCurrentAudioTime(0)
    setSeekPosition(null)
  }, [stopWaveformVisualization])

  // Handle waveform click to seek
  const handleWaveformClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioRef.current || !canvasRef.current || !audioRef.current.duration) return
    
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const clickProgress = Math.max(0, Math.min(1, x / rect.width))
    const newTime = clickProgress * audioRef.current.duration
    
    // Seek to clicked position
    audioRef.current.currentTime = newTime
    setCurrentAudioTime(newTime)
    
    // If paused, resume playback; if not playing, start
    if (isPaused) {
      audioRef.current.play().then(() => {
        setIsPaused(false)
        setIsPlaying(true)
        startWordHighlighting()
        startWaveformVisualization()
      }).catch(console.error)
    } else if (!isPlaying) {
      // If not playing, toggle pause to start
      if (audioRef.current.paused) {
        audioRef.current.play().then(() => {
          setIsPlaying(true)
          setIsPaused(false)
          startWordHighlighting()
          startWaveformVisualization()
        }).catch(console.error)
      }
    }
    
    setSeekPosition(null)
  }, [isPlaying, isPaused, startWordHighlighting, startWaveformVisualization])

  // Handle waveform hover to show preview
  const handleWaveformHover = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return
    
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const hoverProgress = Math.max(0, Math.min(1, x / rect.width))
    setSeekPosition(hoverProgress)
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
      <div className="w-full space-y-6">
      {/* Text Input - Spotify-style */}
      <div className="bg-[#181818] rounded-lg p-6 border border-white/10 hover:bg-[#282828] transition-colors">
        {/* Input mode - shown when not playing */}
        {!isPlaying && !isPaused && (
          <div>
              <label htmlFor="text-input" className="block text-sm font-semibold text-gray-300 mb-3">
                Enter your text
              </label>
              <Textarea
                id="text-input"
                placeholder="Type or paste your text here... (LaTeX citations will be automatically removed)"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => {
                  e.preventDefault()
                  const pastedText = e.clipboardData.getData('text')
                  const cleanedText = removeLatexCitations(pastedText)
                  
                  // Insert cleaned text at cursor position
                  const textarea = e.currentTarget
                  const start = textarea.selectionStart
                  const end = textarea.selectionEnd
                  const newText = text.substring(0, start) + cleanedText + text.substring(end)
                  setText(newText)
                  
                  // Set cursor position after inserted text
                  setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = start + cleanedText.length
                  }, 0)
                }}
                className="min-h-[200px] resize-none bg-[#1a1a1a] border-white/10 text-white placeholder:text-gray-500 focus:ring-[#1db954] focus:border-[#1db954] text-base leading-relaxed rounded-md"
              />
              <div className="flex justify-between items-center mt-4">
                <span className="text-xs text-gray-400 font-medium">
                  {(() => {
                    const wordCount = text.trim() ? text.trim().split(/\s+/).filter(word => word.length > 0).length : 0
                    return `${wordCount} ${wordCount === 1 ? 'word' : 'words'}`
                  })()}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="latex-file-input"
                    accept=".tex,.latex,.txt"
                    onChange={handleFileImport}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs bg-[#1a1a1a] border-white/20 text-white hover:bg-[#282828] hover:border-white/30 hover:scale-105 transition-all"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3 w-3 mr-1.5" />
                    Import LaTeX
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCleanText}
                    disabled={!text.trim()}
                    className="h-8 text-xs bg-[#1a1a1a] border-white/20 text-white hover:bg-[#282828] hover:border-white/30 hover:scale-105 transition-all disabled:opacity-40"
                  >
                    <Trash2 className="h-3 w-3 mr-1.5" />
                    Clean Text
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setText("")}
                    disabled={!text.trim()}
                    className="h-8 text-xs bg-[#1a1a1a] border-white/20 text-white hover:bg-[#282828] hover:border-white/30 hover:scale-105 transition-all disabled:opacity-40"
                    type="button"
                  >
                    <X className="h-3 w-3 mr-1.5" />
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Display view - shown when playing/paused */}
          {(isPlaying || isPaused) && words.length > 0 && (
            <>
              {viewMode === 'netflix' ? (
                /* Spotify-style subtitle display */
                <div className="relative bg-[#050505] min-h-[320px] flex flex-col overflow-hidden rounded-lg border border-white/10">
              {/* Animated background glow - Spotify green */}
              <div 
                className="absolute inset-0 opacity-20 transition-all duration-500"
                style={{
                  background: `radial-gradient(ellipse at center, rgba(29, 185, 84, 0.2) 0%, transparent 70%)`,
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
                {/* Reading Character - appears during playback */}
                {(isPlaying || isPaused) && (
                  <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10 mb-8">
                    <div className="relative">
                      {/* Character Image with Mouth Animation */}
                      <div 
                        className={`relative transition-all duration-300 ${isPlaying ? 'animate-pulse' : ''}`} 
                        style={{ 
                          width: '180px', 
                          height: '220px',
                          transform: isPlaying ? 'scale(1.02)' : 'scale(1)',
                          animation: isPlaying ? 'gentleBounce 3s ease-in-out infinite, headNod 4s ease-in-out infinite' : 'none'
                        }}
                      >
                        {/* Base Image */}
                        <img 
                          src="/reading-character.png" 
                          alt="Reading Character"
                          className="w-full h-full object-contain drop-shadow-2xl"
                          style={{
                            filter: isPlaying ? 'brightness(1.05) saturate(1.1)' : 'brightness(1) saturate(1)',
                            transition: 'filter 0.3s ease',
                            transform: isPlaying ? 'scale(1.01)' : 'scale(1)'
                          }}
                        />
                        
                        {/* Mouth Animation Overlay - creates talking effect */}
                        {isPlaying && (
                          <>
                            {/* Main mouth opening */}
                            <div 
                              className="absolute bottom-[28%] left-1/2 -translate-x-1/2"
                              style={{
                                width: '40px',
                                height: '25px',
                                background: 'radial-gradient(ellipse at center, rgba(150, 30, 60, 0.7) 0%, rgba(150, 30, 60, 0.3) 50%, transparent 100%)',
                                borderRadius: '50%',
                                animation: 'mouthTalk 0.35s ease-in-out infinite',
                                mixBlendMode: 'multiply',
                                boxShadow: '0 2px 8px rgba(150, 30, 60, 0.4)'
                              }}
                            />
                            {/* Secondary mouth highlight for depth */}
                            <div 
                              className="absolute bottom-[28%] left-1/2 -translate-x-1/2"
                              style={{
                                width: '30px',
                                height: '15px',
                                background: 'radial-gradient(ellipse at center, rgba(200, 50, 100, 0.5) 0%, transparent 70%)',
                                borderRadius: '50%',
                                animation: 'mouthTalk 0.35s ease-in-out infinite',
                                mixBlendMode: 'screen',
                                animationDelay: '0.1s'
                              }}
                            />
                          </>
                        )}
                        
                        {/* Blinking Animation Overlay */}
                        <div 
                          className="absolute top-[38%] left-1/2 -translate-x-1/2 w-[60%]"
                          style={{
                            background: 'transparent',
                            animation: isPlaying ? 'blink 3.5s ease-in-out infinite' : 'none',
                            borderRadius: '50%'
                          }}
                        />
                        
                        {/* Speaking indicator rings */}
                        {isPlaying && (
                          <>
                            <div className="absolute inset-0 rounded-full border-2 border-[#1db954] animate-ping opacity-60" style={{ top: '10%', left: '10%', right: '10%', bottom: '10%' }} />
                            <div className="absolute inset-0 rounded-full border-2 border-[#1ed760] animate-ping opacity-40" style={{ top: '10%', left: '10%', right: '10%', bottom: '10%', animationDelay: '0.3s' }} />
                          </>
                        )}
                      </div>
                      
                      {/* Name label */}
                      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-gray-200 font-semibold whitespace-nowrap bg-[#1db954]/20 px-3 py-1 rounded border border-[#1db954]/30">
                        {selectedVoice.split('-')[2]?.replace('Neural', '') || 'Reading'} Voice
                      </div>
                    </div>
                  </div>
                )}

                {/* Previous sentence - fading out */}
                {currentSentenceIndex > 0 && (
                  <div className="absolute top-8 left-0 right-0 text-center opacity-30 transition-opacity duration-300 mt-20">
                    <p className="text-base md:text-lg text-gray-400 font-medium">
                      {sentences[currentSentenceIndex - 1].text}
                    </p>
                  </div>
                )}

                {/* Current subtitle line - main focus - showing current sentence as block */}
                <div className="text-center max-w-3xl mx-auto relative px-6 mt-24">
                  {currentSentenceIndex >= 0 && sentences[currentSentenceIndex] ? (
                    <>
                      <div
                        ref={highlightRef}
                        className="inline-block transition-all duration-300 ease-out rounded-xl px-6 py-4 bg-gradient-to-r from-[#1db954]/25 via-[#1db954]/20 to-[#1db954]/15 border-2 border-[#1db954] shadow-2xl shadow-[#1db954]/30"
                        style={{
                          boxShadow: '0 8px 32px rgba(29, 185, 84, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                        }}
                      >
                        <p className="text-2xl md:text-4xl font-semibold leading-relaxed tracking-wide text-white">
                          {sentences[currentSentenceIndex].text}
                        </p>
                      </div>
                      
                      {/* Animated glow bar for current sentence - Spotify green */}
                      <div className="mt-6 flex justify-center">
                        <div
                          className="h-1.5 bg-gradient-to-r from-transparent via-[#1db954] to-transparent transition-all duration-300 rounded-full"
                          style={{
                            width: currentSentenceIndex >= 0 ? '300px' : '0px',
                            opacity: 0.9,
                            boxShadow: '0 0 24px rgba(29, 185, 84, 1)'
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-2xl md:text-4xl font-semibold leading-snug tracking-wide text-gray-400">
                      {text.trim().split(/[.!?]+/)[0]}
                    </p>
                  )}
                </div>

                {/* Next sentence preview - fading in */}
                {currentSentenceIndex >= 0 && currentSentenceIndex + 1 < sentences.length && (
                  <div className="absolute bottom-8 left-0 right-0 text-center opacity-40 transition-opacity duration-300">
                    <p className="text-base md:text-lg text-gray-400 font-medium">
                      {sentences[currentSentenceIndex + 1].text}
                    </p>
                  </div>
                )}
              </div>
              
              {/* Bottom progress bar - Spotify style */}
              <div className="relative z-20 px-8 pb-5">
                <div className="flex items-center gap-4">
                  {/* Sentence counter */}
                  <span className="text-xs font-mono text-gray-400 w-16 text-right">
                    {currentSentenceIndex >= 0 ? `${currentSentenceIndex + 1}` : '0'} / {sentences.length}
                  </span>
                  
                  {/* Progress track */}
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden relative">
                    {/* Buffer/loaded indicator */}
                    <div className="absolute inset-0 bg-white/5" />
                    
                    {/* Progress fill - Spotify green */}
                    <div 
                      className="h-full bg-gradient-to-r from-[#1db954]/80 to-[#1db954] rounded-full transition-all duration-100 ease-linear relative"
                      style={{ 
                        width: `${sentences.length > 0 ? Math.max(0, ((currentSentenceIndex + 1) / sentences.length) * 100) : 0}%`
                      }}
                    >
                      {/* Glowing head */}
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#1db954] rounded-full shadow-[0_0_12px_rgba(29,185,84,1)]" />
                    </div>
                  </div>
                  
                  {/* Total sentences label */}
                  <span className="text-xs font-medium text-gray-400 w-20 text-left">
                    sentences
                  </span>
                </div>
              </div>
            </div>
              ) : (
                /* Full Text View - Spotify-style */
                <div className="relative bg-[#181818] rounded-lg border border-white/10 overflow-hidden">
                  {/* Ambient background */}
                  <div className="absolute inset-0 opacity-[0.05] pointer-events-none"
                       style={{
                         background: 'radial-gradient(ellipse at center, #1db954 0%, transparent 70%)'
                       }} />

                  {/* Reading Character - appears during playback */}
                  {(isPlaying || isPaused) && (
                    <div className="absolute top-4 right-8 z-10">
                      <div className="relative">
                        {/* Character Image with Mouth Animation - Smaller version */}
                        <div 
                          className={`relative transition-all duration-300 ${isPlaying ? 'animate-pulse' : ''}`} 
                          style={{ 
                            width: '110px', 
                            height: '135px',
                            transform: isPlaying ? 'scale(1.02)' : 'scale(1)',
                            animation: isPlaying ? 'gentleBounce 3s ease-in-out infinite, headNod 4s ease-in-out infinite' : 'none'
                          }}
                        >
                          {/* Base Image */}
                          <img 
                            src="/reading-character.png" 
                            alt="Reading Character"
                            className="w-full h-full object-contain drop-shadow-xl"
                            style={{
                              filter: isPlaying ? 'brightness(1.05) saturate(1.1)' : 'brightness(1) saturate(1)',
                              transition: 'filter 0.3s ease',
                              transform: isPlaying ? 'scale(1.01)' : 'scale(1)'
                            }}
                          />
                          
                          {/* Mouth Animation Overlay - creates talking effect */}
                          {isPlaying && (
                            <>
                              {/* Main mouth opening */}
                              <div 
                                className="absolute bottom-[28%] left-1/2 -translate-x-1/2"
                                style={{
                                  width: '24px',
                                  height: '15px',
                                  background: 'radial-gradient(ellipse at center, rgba(150, 30, 60, 0.7) 0%, rgba(150, 30, 60, 0.3) 50%, transparent 100%)',
                                  borderRadius: '50%',
                                  animation: 'mouthTalk 0.35s ease-in-out infinite',
                                  mixBlendMode: 'multiply',
                                  boxShadow: '0 1px 5px rgba(150, 30, 60, 0.4)'
                                }}
                              />
                              {/* Secondary mouth highlight */}
                              <div 
                                className="absolute bottom-[28%] left-1/2 -translate-x-1/2"
                                style={{
                                  width: '18px',
                                  height: '10px',
                                  background: 'radial-gradient(ellipse at center, rgba(200, 50, 100, 0.5) 0%, transparent 70%)',
                                  borderRadius: '50%',
                                  animation: 'mouthTalk 0.35s ease-in-out infinite',
                                  mixBlendMode: 'screen',
                                  animationDelay: '0.1s'
                                }}
                              />
                            </>
                          )}
                          
                          {/* Blinking Animation Overlay */}
                          <div 
                            className="absolute top-[38%] left-1/2 -translate-x-1/2 w-[60%]"
                            style={{
                              background: 'transparent',
                              animation: isPlaying ? 'blink 3.5s ease-in-out infinite' : 'none',
                              borderRadius: '50%'
                            }}
                          />
                          
                          {/* Speaking indicator rings */}
                          {isPlaying && (
                            <>
                              <div className="absolute inset-0 rounded-full border-2 border-[#1db954] animate-ping opacity-60" style={{ top: '5%', left: '5%', right: '5%', bottom: '5%' }} />
                              <div className="absolute inset-0 rounded-full border-2 border-[#1ed760] animate-ping opacity-40" style={{ top: '5%', left: '5%', right: '5%', bottom: '5%', animationDelay: '0.3s' }} />
                            </>
                          )}
                        </div>
                        
                        {/* Name label */}
                        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-200 font-semibold whitespace-nowrap bg-[#1db954]/20 px-2 py-1 rounded border border-[#1db954]/30">
                          {selectedVoice.split('-')[2]?.replace('Neural', '') || 'Reading'} Voice
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Scrollable text container */}
                  <div
                    ref={textContainerRef}
                    className="relative overflow-y-auto max-h-[500px] px-8 py-12 text-scroll-container"
                    onScroll={handleUserScroll}
                  >
                    <div className="max-w-3xl mx-auto space-y-4">
                      {sentences.map((sentence, sIdx) => {
                        const isCurrentSentence = sIdx === currentSentenceIndex
                        const isPastSentence = sIdx < currentSentenceIndex
                        const isFirstSentence = sIdx === 0
                        
                        return (
                          <div
                            key={sIdx}
                            ref={isCurrentSentence ? highlightRef : null}
                            className={`transition-all duration-300 ease-out rounded-lg px-4 py-3 ${
                              isCurrentSentence
                                ? "bg-gradient-to-r from-[#1db954]/20 via-[#1db954]/15 to-[#1db954]/10 border-2 border-[#1db954] shadow-lg shadow-[#1db954]/20 scale-[1.02]"
                                : isPastSentence
                                  ? "opacity-40 bg-[#1a1a1a]/50"
                                  : "opacity-70 bg-[#1a1a1a]/30"
                            }`}
                            style={isCurrentSentence ? {
                              boxShadow: '0 4px 16px rgba(29, 185, 84, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                            } : {}}
                          >
                            <p className={`text-base md:text-lg leading-relaxed ${
                              isCurrentSentence 
                                ? "text-white font-medium" 
                                : isPastSentence 
                                  ? "text-gray-400" 
                                  : "text-gray-300"
                            }`}>
                              {sentence.text}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Progress bar at bottom */}
                  <div className="sticky bottom-0 left-0 right-0 h-1.5 bg-[#1a1a1a]">
                    <div
                      className="h-full bg-gradient-to-r from-[#1db954] to-[#1ed760] transition-all duration-300 shadow-lg shadow-[#1db954]/50"
                      style={{ width: `${sentences.length > 0 ? ((currentSentenceIndex + 1) / sentences.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      {/* Audio Waveform Visualization - moved up */}
      {(isPlaying || isPaused) && audioRef.current && (
        <div className="bg-[#181818] rounded-lg p-6 border border-white/10 hover:bg-[#282828] transition-colors">
          <div className="w-full">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400 font-medium">Audio Waveform</span>
              {audioRef.current.duration && (
                <span className="text-xs text-gray-400 font-mono">
                  {seekPosition !== null 
                    ? `${Math.floor(seekPosition * audioRef.current.duration)}s`
                    : `${Math.floor(currentAudioTime)}s`
                  } / {Math.floor(audioRef.current.duration)}s
                </span>
              )}
            </div>
            <div className="relative w-full bg-[#050505] rounded-lg overflow-hidden border border-white/10 group">
              <canvas
                ref={canvasRef}
                className="w-full h-[120px] cursor-pointer transition-opacity"
                style={{ display: 'block' }}
                onClick={handleWaveformClick}
                onMouseMove={handleWaveformHover}
                onMouseLeave={() => setSeekPosition(null)}
                title="Click to seek, hover to preview"
              />
              {seekPosition !== null && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded pointer-events-none">
                  Click to seek
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Voice Selection - Spotify-style */}
      <div className="bg-[#181818] rounded-lg p-6 border border-white/10 hover:bg-[#282828] transition-colors">
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-[#1db954]" />
            <h3 className="text-lg font-bold text-white">Voice Selection</h3>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Choose from high-quality Microsoft Edge neural voices. Free to use; no API key required.
          </p>
          
          <div>
            <label htmlFor="voice-select" className="block text-sm font-semibold text-gray-300 mb-2">
              Select Voice
            </label>
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger className="w-full bg-[#1a1a1a] border-white/20 text-white hover:bg-[#282828]">
                <SelectValue placeholder="Select a voice" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] bg-[#282828] border-white/20">
                {edgeVoices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id} className="text-white hover:bg-[#1db954] focus:bg-[#1db954]">
                    <div className="flex flex-col">
                      <span className="font-medium">{voice.name}</span>
                      <span className="text-xs text-gray-400">{voice.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-2">
              Powered by Microsoft Edge-TTS • Free with unlimited usage
            </p>
          </div>
        </div>
      </div>

      {/* View Mode Toggle - shown only when playing/paused */}
      {(isPlaying || isPaused) && (
        <div className="bg-[#181818] rounded-lg p-4 border border-white/10">
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
              className={viewMode === 'full-text' 
                ? 'bg-[#1db954] hover:bg-[#1ed760] text-white border-0' 
                : 'bg-[#1a1a1a] border-white/20 text-white hover:bg-[#282828]'}
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
              className={viewMode === 'netflix' 
                ? 'bg-[#1db954] hover:bg-[#1ed760] text-white border-0' 
                : 'bg-[#1a1a1a] border-white/20 text-white hover:bg-[#282828]'}
            >
              <Subtitles className="w-4 h-4 mr-2" />
              Focus Mode
            </Button>
          </div>
        </div>
      )}

      {/* Controls - Spotify-style Player */}
      <div className="bg-[#181818] rounded-lg p-6 border border-white/10 hover:bg-[#282828] transition-colors">
        <div className="space-y-6">
          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={handleStop}
              disabled={!isPlaying && !isPaused}
              className="h-12 w-12 rounded-full border-white/20 hover:bg-[#282828] bg-transparent text-white hover:scale-110 transition-all disabled:opacity-40"
              aria-label="Stop"
            >
              <Square className="h-5 w-5" />
            </Button>
            
            <Button
              onClick={isPlaying ? handlePause : handlePlay}
              disabled={(!text.trim() && !isPaused) || isLoadingAudio}
              className="h-16 w-16 rounded-full bg-[#1db954] hover:bg-[#1ed760] text-white shadow-lg shadow-[#1db954]/30 hover:scale-110 transition-all disabled:opacity-50"
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
              className="h-12 w-12 rounded-full border-white/20 hover:bg-[#282828] bg-transparent text-white hover:scale-110 transition-all disabled:opacity-40"
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
              <span className="text-sm text-[#1db954] font-medium">{downloadProgress}</span>
            </div>
          )}

          {/* Speed Control */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Gauge className="h-4 w-4" />
                <span className="font-medium">Speed</span>
              </div>
              <span className="text-sm font-bold text-white">{speed}x</span>
            </div>
            <Slider
              value={[speed]}
              onValueChange={handleSpeedChange}
              min={0.5}
              max={2}
              step={0.25}
              className="w-full [&_[role=slider]]:bg-[#1db954] [&_[role=slider]]:border-[#1db954]"
              aria-label="Playback speed"
            />
            <div className="flex justify-between text-xs text-gray-400">
              {speedLabels.map((label) => (
                <button
                  key={label.value}
                  onClick={() => setSpeed(label.value)}
                  className={`transition-colors hover:text-white ${
                    speed === label.value ? "text-[#1db954] font-bold" : ""
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
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Volume2 className="h-4 w-4" />
                <span className="font-medium">Volume</span>
              </div>
              <span className="text-sm font-bold text-white">{Math.round(volume * 100)}%</span>
            </div>
            <Slider
              value={[volume]}
              onValueChange={handleVolumeChange}
              min={0}
              max={1}
              step={0.1}
              className="w-full [&_[role=slider]]:bg-[#1db954] [&_[role=slider]]:border-[#1db954]"
              aria-label="Volume"
            />
          </div>
        </div>
      </div>

      {/* Info */}
      <p className="text-center text-xs text-gray-500">
        Powered by Microsoft Edge-TTS. Provides free, high-quality neural voice synthesis.
      </p>
    </div>
  )
}
