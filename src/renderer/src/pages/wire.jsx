import { useState, useEffect, useRef } from 'react'
import {
  Button,
  Autocomplete,
  AutocompleteItem,
  Spacer,
  Input,
  Tooltip,
  Divider
} from '@nextui-org/react'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowsRotate,
  faPlay,
  faStop,
  faScissors,
  faClock,
  faVideo,
  faCircle
} from '@fortawesome/free-solid-svg-icons'

const Wire = () => {
  const [sources, setSources] = useState([])
  const [recording, setRecording] = useState(false)
  const [selectedSource, setSelectedSource] = useState(null)
  const [clipDuration, setClipDuration] = useState(10)
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerIntervalRef = useRef(null)
  const startTimeRef = useRef(null)
  const recordingBufferRef = useRef([]) // Rolling buffer for the last N seconds

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainingSeconds = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const startRecording = async () => {
    if (!selectedSource) {
      console.error('No source selected')
      return
    }

    try {
      console.log('Starting recording with source:', selectedSource)
      const { constraints } = await window.api.startRecording(selectedSource.id)
      console.log('Got constraints:', constraints)

      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        console.log('Available devices:', devices)

        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        const audioStream = new MediaStream()
        const audioTracks = stream.getAudioTracks()

        if (audioTracks.length === 0) {
          throw new Error('No audio tracks found in the stream')
        }

        audioTracks.forEach((track) => audioStream.addTrack(track))

        const mediaRecorder = new MediaRecorder(audioStream, {
          mimeType: 'audio/webm;codecs=opus'
        })

        console.log('Created MediaRecorder')
        chunksRef.current = []
        recordingBufferRef.current = []
        setRecordingTime(0)
        startTimeRef.current = Date.now()

        timerIntervalRef.current = setInterval(() => {
          setRecordingTime((prev) => prev + 1)
        }, 1000)

        let isFirstChunk = true
        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            console.log(
              'Received chunk of size:',
              e.data.size,
              isFirstChunk ? '(header chunk)' : ''
            )

            // Store the chunk
            chunksRef.current.push(e.data)

            // For the rolling buffer, don't include the header chunk
            if (!isFirstChunk) {
              recordingBufferRef.current.push({
                data: e.data,
                timestamp: Date.now()
              })

              // Keep only the chunks we need for clipping
              const maxBufferDuration = Math.max(30, clipDuration) * 1000
              const cutoffTime = Date.now() - maxBufferDuration
              recordingBufferRef.current = recordingBufferRef.current.filter(
                (chunk) => chunk.timestamp > cutoffTime
              )
            }
            isFirstChunk = false
          }
        }

        mediaRecorder.onerror = (error) => {
          console.error('MediaRecorder error:', error)
          setRecording(false)
          stream.getTracks().forEach((track) => track.stop())
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current)
          }
        }

        mediaRecorder.onstop = async () => {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current)
          }

          if (chunksRef.current.length === 0) {
            console.error('No chunks recorded')
            return
          }

          const blob = new Blob(chunksRef.current, {
            type: 'audio/webm;codecs=opus'
          })
          console.log(`Saving full recording, size: ${blob.size} bytes`)
          const arrayBuffer = await blob.arrayBuffer()
          await window.api.saveAudioFile(arrayBuffer)
          stream.getTracks().forEach((track) => track.stop())
        }

        // Start recording with 500ms timeslices
        mediaRecorder.start(500)
        mediaRecorderRef.current = mediaRecorder
        setRecording(true)
      } catch (error) {
        console.error('Error getting media stream:', error)
        if (error.name === 'NotAllowedError') {
          console.error('Permission denied to access media devices')
        } else if (error.name === 'NotFoundError') {
          console.error('No audio device found')
        }
        throw error
      }
    } catch (error) {
      console.error('Error starting recording:', error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop()
      setRecording(false)
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
    }
  }

  const clip = async () => {
    if (!recording || recordingBufferRef.current.length === 0) {
      console.log('No recording data available')
      return
    }

    try {
      // Always include the first chunk (contains WebM header) and recent chunks
      const firstChunk = chunksRef.current[0]
      const cutoffTime = Date.now() - clipDuration * 1000
      const recentChunks = recordingBufferRef.current
        .filter((chunk) => chunk.timestamp >= cutoffTime)
        .map((chunk) => chunk.data)

      if (recentChunks.length === 0) {
        console.log(`No audio data in the last ${clipDuration} seconds`)
        return
      }

      console.log(`Creating clip from ${recentChunks.length} chunks (plus header)`)

      // Create a new blob with the header chunk first, then the recent chunks
      const blob = new Blob([firstChunk, ...recentChunks], {
        type: 'audio/webm;codecs=opus'
      })

      console.log(`Clip blob size: ${blob.size} bytes`)
      const arrayBuffer = await blob.arrayBuffer()
      console.log(`ArrayBuffer size: ${arrayBuffer.byteLength} bytes`)

      const success = await window.api.saveAudioFile(arrayBuffer)
      if (success) {
        console.log('Clip saved successfully')
      } else {
        console.error('Failed to save clip')
      }
    } catch (error) {
      console.error('Error creating clip:', error)
    }
  }

  const getSources = async () => {
    try {
      if (!window.api?.getDesktopSources) {
        throw new Error('getDesktopSources is not available')
      }
      setSources(await window.api.getDesktopSources())
    } catch (error) {
      console.error('Error getting sources:', error)
    }
  }

  useEffect(() => {
    getSources()
    return () => {
      // Cleanup on unmount
      if (mediaRecorderRef.current && recording) {
        stopRecording()
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
    }
  }, [])

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2 items-center">
        <Autocomplete
          label="Audio source"
          size="lg"
          onSelectionChange={(key) =>
            setSelectedSource(sources.find((source) => source.id === key))
          }
        >
          {sources.map((source) => (
            <AutocompleteItem key={source.id} value={source.id}>
              {source.name}
            </AutocompleteItem>
          ))}
        </Autocomplete>
        <Tooltip content="Refresh audio sources" showArrow color="primary">
          <Button
            startContent={<FontAwesomeIcon icon={faArrowsRotate} />}
            isIconOnly
            onPress={getSources}
            size="lg"
          />
        </Tooltip>
      </div>
      <div className="flex gap-4 items-center">
        <Input
          label="Clip duration"
          startContent={<FontAwesomeIcon icon={faClock} />}
          endContent="s"
          type="number"
          value={clipDuration}
          onChange={(e) => setClipDuration(e.target.value)}
          className="w-1/2"
        ></Input>
        <Button
          startContent={<FontAwesomeIcon icon={faScissors} />}
          size="lg"
          onPress={clip}
          color="primary"
          className="flex-1"
        >
          Clip last {clipDuration} seconds
        </Button>
      </div>
      <Spacer y={5} />
      <div className="flex justify-center">
        <Button
          onPress={recording ? stopRecording : startRecording}
          color={recording ? 'danger' : 'primary'}
          startContent={<FontAwesomeIcon icon={recording ? faStop : faPlay} />}
          size="lg"
          radius="full"
        >
          {recording ? 'Stop Recording' : 'Start Recording'}
        </Button>
      </div>
      <Divider />
      <Input
        startContent={
          recording ? <FontAwesomeIcon icon={faVideo} /> : <FontAwesomeIcon icon={faCircle} />
        }
        value={recording ? 'Recording' : 'Ready to record'}
        endContent={formatTime(recordingTime)}
        isReadOnly
        className="text-center"
      />
    </div>
  )
}

export default Wire
