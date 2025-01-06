import { app, shell, BrowserWindow, ipcMain, desktopCapturer, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { writeFile } from 'fs/promises'

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowedPermissions = [
        'media',
        'mediaKeySystem',
        'audio-capture',
        'desktop-audio-capture',
        'desktopCapturer',
        'screen',
        'system-audio-capture'
      ]
      console.log('Permission requested:', permission)
      callback(allowedPermissions.includes(permission))
    }
  )

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.wire')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.

ipcMain.handle('GET_DESKTOP_SOURCES', async () => {
  try {
    console.log('Main: Getting desktop sources')
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen', 'audio'],
      thumbnailSize: { width: 0, height: 0 }
    })
    console.log('Main: Got sources:', sources)
    return sources
  } catch (error) {
    console.error('Main: Error getting sources:', error)
    throw error
  }
})

ipcMain.handle('START_RECORDING', async (event, sourceId) => {
  try {
    console.log('Main: Starting recording for source:', sourceId)
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen', 'audio'],
      thumbnailSize: { width: 0, height: 0 }
    })

    const selectedSource = sources.find((s) => s.id === sourceId)
    if (!selectedSource) {
      throw new Error('Source not found')
    }

    console.log('Main: Found source:', selectedSource.name)
    return {
      constraints: {
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop'
          }
        },
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        }
      }
    }
  } catch (error) {
    console.error('Main: Error starting recording:', error)
    throw error
  }
})

ipcMain.handle('STOP_RECORDING', async (event, buffer) => {
  try {
    const { filePath } = await dialog.showSaveDialog({
      buttonLabel: 'Save audio',
      defaultPath: `audio-${Date.now()}.wav`
    })

    if (filePath) {
      await writeFile(filePath, Buffer.from(buffer))
    }
    return true
  } catch (error) {
    console.error('Error saving:', error)
    return false
  }
})

ipcMain.handle('SAVE_AUDIO_FILE', async (event, buffer) => {
  try {
    const { filePath } = await dialog.showSaveDialog({
      buttonLabel: 'Save audio',
      defaultPath: `audio-${Date.now()}.webm`,
      filters: [{ name: 'WebM Audio', extensions: ['webm'] }]
    })

    if (filePath) {
      console.log(`Saving file to ${filePath}, buffer size: ${buffer.byteLength} bytes`)
      await writeFile(filePath, Buffer.from(buffer))
      console.log('File saved successfully')
      return true
    }
    return false
  } catch (error) {
    console.error('Error saving file:', error)
    throw error // Propagate error to renderer
  }
})
