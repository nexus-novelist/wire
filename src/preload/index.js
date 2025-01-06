import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getDesktopSources: async () => {
    return await ipcRenderer.invoke('GET_DESKTOP_SOURCES')
  },
  startRecording: async (sourceId) => {
    return await ipcRenderer.invoke('START_RECORDING', sourceId)
  },
  saveAudioFile: async (buffer) => {
    return await ipcRenderer.invoke('SAVE_AUDIO_FILE', buffer)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    console.log('Exposing APIs through contextBridge')
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    console.log('APIs exposed successfully')
  } catch (error) {
    console.error('Failed to expose APIs:', error)
  }
} else {
  console.log('Context isolation is disabled')
  window.electron = electronAPI
  window.api = api
}
