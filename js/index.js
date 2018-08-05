const videoEl = document.querySelector('#inputVideo')
const canvas = document.getElementById('overlay')
const canvasCtx = canvas.getContext('2d')
const maxFaceDist = 0.6
const minConfidence = 0.9
const mtcnnParams = {
  /*
    Using CPU (Intel Core i5-6300U CPU @ 2.40GHz)
    minFaceSize
      100 gets me ~20fps
      200 gets me ~30-40fps
  */
  minFaceSize: 100
}

let modelLoaded = false
let forwardTimes = []
let CLASSES = ['beato']
let faceEmbeddings

function updateTimeStats(timeInMs) {
  forwardTimes = [timeInMs].concat(forwardTimes).slice(0, 30)
  const avgTimeInMs = forwardTimes.reduce((total, t) => total + t) / forwardTimes.length
  $('#time').val(`${Math.round(avgTimeInMs)} ms`)
  $('#fps').val(`${faceapi.round(1000 / avgTimeInMs)}`)
}

async function fetchImage(uri) {
  return (await fetch(uri)).blob()
}

async function trainFaceRecognition(classes) {
  return Promise.all(classes.map(
    async className => {
      // all this anonymous function does is get face embeddings
      // for each of our classes
      const img = await faceapi.bufferToImage(
        await fetchImage('train/' + className + '.jpg'))
      // 128-D face embedding
      const descriptor = await faceapi.recognitionNet.computeFaceDescriptor(img)
      return {
        className: className,
        // an array for now so we can have multiple descriptors later
        descriptors: [descriptor]
      }
    }))
}

async function run() {
  // load models
  await faceapi.loadMtcnnModel('models/')
  await faceapi.loadFaceRecognitionModel('models/')

  modelLoaded = true

  faceEmbeddings = await trainFaceRecognition(CLASSES)

  // setup video feed
  navigator.mediaDevices.getUserMedia({video: true}).
    then(stream => videoEl.srcObject = stream)
}

async function onPlay(isVideo) {
  if (videoEl.paused || videoEl.ended || !modelLoaded) {
    return false
  }

  const {width, height} = faceapi.getMediaDimensions(videoEl)

  // I've tried removing this, it seems explicit setting of
  // canvas width and height is required to draw properly
  canvas.width = width
  canvas.height = height

  const {results, stats} = await faceapi.nets.mtcnn.forwardWithStats(videoEl, mtcnnParams)
  updateTimeStats(stats.total)

  if (results) {
    results.forEach(({faceDetection, faceLandmarks}) => {
      if (faceDetection.score < minConfidence) {
        return
      }
      const {x, y, height: boxHeight} = faceDetection.getBox()
      faceapi.drawDetection('overlay', faceDetection.forSize(width, height))
      faceapi.drawLandmarks('overlay', faceLandmarks.forSize(width, height), {lineWidth: 4, color: 'red'})
      faceapi.drawText(
        canvasCtx,
        x,
        y + boxHeight,
        'hello',
        Object.assign(faceapi.getDefaultDrawOptions(), { color: 'green', fontSize: 20 })
      )
    })

    //pause if in single shot mode
    if (!isVideo) {
      videoEl.pause()
    }
  }
  setTimeout(() => onPlay(videoEl))
}

$(document).ready(run)
