import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Button,
  Autocomplete,
  AutocompleteItem,
  Spacer,
  Input,
  Tooltip,
  Divider,
  Kbd
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
  const [selectedSource, setSelectedSource] = useState(null)
  const [clipDuration, setClipDuration] = useState(10)
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerIntervalRef = useRef(null)
  const isRecordingRef = useRef(false)
  const [isSaving, setIsSaving] = useState(false)

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainingSeconds = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const startRecording = async () => {
    try {
      console.log('Starting recording...')
      const { constraints } = await window.api.startRecording(selectedSource.id)
      console.log('Got constraints:', constraints)

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      console.log('Got media stream')

      const audioStream = new MediaStream()
      const audioTracks = stream.getAudioTracks()

      if (audioTracks.length === 0) {
        throw new Error('No audio tracks found in the stream')
      }

      audioTracks.forEach((track) => audioStream.addTrack(track))

      const mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: 'audio/webm;codecs=opus',
        bitsPerSecond: 128000
      })

      console.log('Created MediaRecorder')
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        console.log('Data available:', event.data.size, 'bytes')
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.start(100) // Collect data more frequently
      isRecordingRef.current = true
      setRecordingTime(0)

      // Start the timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)

      console.log('Recording started')
    } catch (error) {
      console.error('Error in startRecording:', error)
    }
  }

  const stopRecording = async () => {
    console.log('Stopping recording...')
    try {
      if (!mediaRecorderRef.current) {
        console.error('No media recorder found')
        return
      }

      // Clear the timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }

      const recorder = mediaRecorderRef.current

      // Create a promise that resolves when we get the last chunk of data
      const dataPromise = new Promise((resolve) => {
        const handleData = async (event) => {
          console.log('Final data available:', event.data.size, 'bytes')
          if (event.data.size > 0) {
            chunksRef.current.push(event.data)
          }
          resolve()
        }
        recorder.addEventListener('dataavailable', handleData, { once: true })
      })

      // Stop the recording
      console.log('Stopping MediaRecorder...')
      recorder.stop()
      isRecordingRef.current = false

      // Wait for the last chunk of data
      console.log('Waiting for final data...')
      await dataPromise

      if (chunksRef.current.length > 0) {
        console.log('Processing', chunksRef.current.length, 'chunks')
        const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' })
        console.log('Created blob:', blob.size, 'bytes')
        const arrayBuffer = await blob.arrayBuffer()
        console.log('Converted to array buffer:', arrayBuffer.byteLength, 'bytes')

        try {
          setIsSaving(true)
          const success = await window.api.convertAndSaveAudio(arrayBuffer)
          if (success) {
            console.log('Audio saved successfully as MP3')
          } else {
            console.error('Failed to save audio')
          }
        } catch (error) {
          console.error('Error converting audio:', error)
        } finally {
          setIsSaving(false)
        }
      }

      // Clear the audio chunks and reset state
      chunksRef.current = []
      mediaRecorderRef.current = null
      console.log('Recording cleanup completed')
    } catch (error) {
      console.error('Error in stopRecording:', error)
    }
  }

  const clip = useCallback(async () => {
    if (!isRecordingRef.current || chunksRef.current.length === 0) {
      console.log('No recording data available')
      return
    }

    try {
      console.log('Creating clip of last', clipDuration, 'seconds')

      // Calculate how many chunks we need based on the chunk interval (100ms)
      const chunksNeeded = Math.ceil((clipDuration * 1000) / 100)

      // Always include the first chunk (contains WebM header)
      const firstChunk = chunksRef.current[0]

      // Get the recent chunks, but exclude the first chunk if it's in the range
      const recentChunks = chunksRef.current.slice(-chunksNeeded)
      if (recentChunks[0] === firstChunk && recentChunks.length > 1) {
        recentChunks.shift()
      }

      if (recentChunks.length === 0) {
        console.log('No recent chunks available')
        return
      }

      const chunks = [firstChunk, ...recentChunks]
      console.log(`Using ${chunks.length} chunks for the clip (including header)`)

      const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' })
      console.log('Created clip blob:', blob.size, 'bytes')

      const arrayBuffer = await blob.arrayBuffer()
      console.log('Converting clip to MP3...')

      try {
        setIsSaving(true)
        const success = await window.api.convertAndSaveAudio(arrayBuffer)
        if (success) {
          console.log('Clip saved successfully')
        } else {
          console.error('Failed to save clip')
        }
      } catch (error) {
        console.error('Error saving clip:', error)
      } finally {
        setIsSaving(false)
      }
    } catch (error) {
      console.error('Error creating clip:', error)
    }
  }, [isRecordingRef, clipDuration])

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

    // Set up clip shortcut listener
    const cleanup = window.api.onTriggerClip(() => {
      console.log('Shortcut triggered in renderer, recording state:', isRecordingRef.current)
      if (isRecordingRef.current) {
        console.log('Recording active, calling clip function')
        clip()
      } else {
        console.log('Not recording, ignoring shortcut')
      }
    })

    return () => {
      // Cleanup on unmount
      if (mediaRecorderRef.current && isRecordingRef.current) {
        stopRecording()
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
      cleanup()
    }
  }, [isRecordingRef, clip])

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
        <Tooltip content="Control + Shift + F6" showArrow color="primary">
          <Button
            startContent={<FontAwesomeIcon icon={faScissors} />}
            size="lg"
            onPress={clip}
            color="primary"
            className="flex-1"
            endContent={<Kbd keys={['ctrl', 'shift']}>F6</Kbd>}
          >
            Clip last {clipDuration} seconds
          </Button>
        </Tooltip>
      </div>
      <Spacer y={5} />
      <div className="flex justify-center">
        <Button
          onPress={isRecordingRef.current ? stopRecording : startRecording}
          color={isRecordingRef.current ? 'danger' : 'primary'}
          startContent={<FontAwesomeIcon icon={isRecordingRef.current ? faStop : faPlay} />}
          size="lg"
          radius="full"
          isLoading={isSaving}
        >
          {isRecordingRef.current ? 'Stop Recording' : 'Start Recording'}
        </Button>
      </div>
      <Divider />
      <Input
        startContent={
          isRecordingRef.current ? (
            <FontAwesomeIcon icon={faVideo} />
          ) : (
            <FontAwesomeIcon icon={faCircle} />
          )
        }
        value={isRecordingRef.current ? 'Recording' : 'Ready to record'}
        endContent={formatTime(recordingTime)}
        isReadOnly
        className="text-center"
      />
    </div>
  )
}

export default Wire
