const videoEl = document.querySelector('#inputVideo')
const canvas = document.getElementById('overlay')
const canvasCtx = canvas.getContext('2d')
const maxFaceDist = 0.6
const minConfidence = 0.9
const numTrainingImages = 2
const mtcnnParams = {
  /*
    Using CPU (Intel Core i5-6300U CPU @ 2.40GHz)
    minFaceSize
      100 gets me ~20fps
      200 gets me ~30-40fps
  */
  minFaceSize: 200
}
let myDB = Object.create(db)
let modelLoaded = false
let forwardTimes = []

// a temporary container for our training data
// this should always be cleared after a new class is added
let trainingData = []

function updateTimeStats(timeInMs) {
  forwardTimes = [timeInMs].concat(forwardTimes).slice(0, 30)
  const avgTimeInMs = forwardTimes.reduce((total, t) => total + t) / forwardTimes.length
  $('#time').val(`${Math.round(avgTimeInMs)} ms`)
  $('#fps').val(`${faceapi.round(1000 / avgTimeInMs)}`)
}

function getBestMatch(descriptorsByClass, queryDescriptor) {
  /*
    Args:
      descriptorsByClass: array of objs with className and face
                          embeddings
      queryDescriptor: face embeddings of incoming detection
    Returns:
      Object {className, distance}
  */
  function computeMeanDistance(descriptors) {
    return faceapi.round(
      descriptors
        .map(d => faceapi.euclideanDistance(d, queryDescriptor))
        .reduce((d1, d2) => d1 + d2, 0) / (descriptors.length || 1)
      )
  }

  return descriptorsByClass
    .map(
      ({descriptors, className}) => ({
        distance: computeMeanDistance(descriptors),
        className
      })
    )
    .reduce((best, curr) => best.distance < curr.distance ? best : curr)
}

async function run() {
  // load models
  await faceapi.loadMtcnnModel('models/')
  await faceapi.loadFaceRecognitionModel('models/')

  modelLoaded = true
  $('#status').text('Models loaded! Loading data from localstorage...')

  await myDB.init()
  $('#status').text('Data loaded!')

  // setup video feed
  navigator.mediaDevices.getUserMedia({video: true}).
    then(stream => videoEl.srcObject = stream)
}

function doFaceDetection (detection, descriptor) {
  const {x, y, height: boxHeight} = detection.getBox()
  const bestMatch = getBestMatch(myDB.getEmbeddings(), descriptor)
  console.log('Detected: ' + bestMatch.className + '(' + bestMatch.distance + ')')
  let text = 'Unknown'
  let color = 'red'

  if (bestMatch.distance < maxFaceDist) {
    text = `${bestMatch.className} (${bestMatch.distance})`
    color = 'green'
  }

  faceapi.drawText(
    canvasCtx,
    x,
    y + boxHeight,
    text,
    Object.assign(faceapi.getDefaultDrawOptions(), { color: color, fontSize: 20 })
  )
}

async function onPlay(isVideo, isTraining, numTrainImages = 50) {
  $('#status').text('Recording...')
  if (videoEl.paused || videoEl.ended || !modelLoaded) {
    return false
  }

  const {width, height} = faceapi.getMediaDimensions(videoEl)

  // I've tried removing this, it seems explicit setting of
  // canvas width and height is required to draw properly
  canvas.width = width
  canvas.height = height

  const ts = Date.now()
  const fullFaceDescriptions = await faceapi.allFacesMtcnn(videoEl, mtcnnParams)
  updateTimeStats(Date.now() - ts)

  fullFaceDescriptions.forEach(({detection, landmarks, descriptor}) => {
    if (detection.score < minConfidence) {
      return
    } else if (!isVideo) {
      // pause if in single shot mode
      videoEl.pause()
    }

    faceapi.drawDetection('overlay', detection.forSize(width, height))
    faceapi.drawLandmarks('overlay', landmarks.forSize(width, height), {lineWidth: 4, color: 'red'})

    // TODO: refactor this later
    if (isTraining) {
      // If we're training, save the detection to localstorage
      // let's get 50 for now
      trainingData.push(descriptor)
      if (trainingData.length >= numTrainImages) {
        myDB.addClass($('#trainClass').val(), trainingData)

        // cleanup by pausing the video feed, stopping the loop
        // and setting training data to an empty array
        videoEl.pause()
        trainingData = []
        return
      }
    } else {
      doFaceDetection(detection, descriptor)
    }
  })
  setTimeout(() => onPlay(isVideo, isTraining))
}

$(document).ready(run)
