const videoEl = document.querySelector('#inputVideo')
const canvas = document.getElementById('overlay')
const canvasCtx = canvas.getContext('2d')
const minConfidence = .9

/*
  Using CPU (Intel Core i5-6300U CPU @ 2.40GHz)
  minFaceSize
    100 gets me ~20fps
    200 gets me ~30-40fps
*/
const mtcnnParams = {
  minFaceSize: 100
}

let modelLoaded = false
let forwardTimes = []

function updateTimeStats(timeInMs) {
  forwardTimes = [timeInMs].concat(forwardTimes).slice(0, 30)
  const avgTimeInMs = forwardTimes.reduce((total, t) => total + t) / forwardTimes.length
  $('#time').val(`${Math.round(avgTimeInMs)} ms`)
  $('#fps').val(`${faceapi.round(1000 / avgTimeInMs)}`)
}

async function run() {
  console.log('run')
  // load models
  await faceapi.loadMtcnnModel('models/')
  modelLoaded = true
  console.log('model loaded')

  // setup video feed
  const video = document.querySelector('#inputVideo')

  navigator.mediaDevices.getUserMedia({video: true}).
    then(stream => video.srcObject = stream)
}

async function onPlay(isVideo) {
  console.log('onPlay')

  if(videoEl.paused || videoEl.ended || !modelLoaded) {
    console.log('onPlay stopped')
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
    if (!isVideo) {
      videoEl.pause()
    }
  }
  setTimeout(() => onPlay(videoEl))
}

$(document).ready(run)
