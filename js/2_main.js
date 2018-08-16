const videoEl = document.querySelector('#inputVideo')
const canvas = document.getElementById('overlay')
const canvasCtx = canvas.getContext('2d')
const detectorCnv = document.getElementById('detectorCnv')
const detectorCtx = detectorCnv.getContext('2d')
const maxFaceDist = 0.6
const minConfidence = 0.99
const unknownPrefix = 'Unknown #'
const mtcnnParams = {
  /*
    Using CPU (Intel Core i5-6300U CPU @ 2.40GHz)
    minFaceSize
      100 gets me ~20fps
      200 gets me ~30-40fps
  */
  minFaceSize: 100
}
const myDB = Object.create(db)
let modelLoaded = false
let shouldInfer = false
let forwardTimes = []

// a temporary container for our training data
// this should always be cleared after a new class is added
const trainState = {
  state: {
    data: [],
    image: null,
    className: null
  },
  emptyState () {
    this.state.data = []
    this.state.image = null
    this.state.className = null
  },
  setImage (img) {
    this.state.image = img
  },
  setClassName (n) {
    this.state.className = n
  },
  appendData (d) {
    this.state.data.push(d)
  }
}

function updateTimeStats(timeInMs) {
  forwardTimes = [timeInMs].concat(forwardTimes).slice(0, 30)
  const avgTimeInMs = forwardTimes.reduce((total, t) => total + t) / forwardTimes.length
  $('#time').text(`${Math.round(avgTimeInMs)} ms`)
  $('#fps').text(`${faceapi.round(1000 / avgTimeInMs)}`)
}

function computeMeanDistance(descriptors, queryDescriptor) {
  return faceapi.round(
    descriptors
      .map(d => faceapi.euclideanDistance(d, queryDescriptor))
      .reduce((d1, d2) => d1 + d2, 0) / (descriptors.length || 1)
    )
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
  if (descriptorsByClass.length === 0) {
    $('#status').text('No classes. Train some first!')
    return
  }

  return descriptorsByClass
    .map(
      ({descriptors, className}) => ({
        distance: computeMeanDistance(descriptors, queryDescriptor),
        className
      })
    )
    .reduce((best, curr) => best.distance < curr.distance ? best : curr)
}

async function run () {

  // load models
  await faceapi.loadMtcnnModel('models/')
  await faceapi.loadFaceRecognitionModel('models/')

  modelLoaded = true
  $('#status').text('Models loaded! Loading data from localstorage...')

  await myDB.init()

  // setup video feed
  navigator.mediaDevices.getUserMedia({video: true}).
    then(stream => {
      videoEl.srcObject = stream
    })
}

function doFaceDetection (detection, descriptor) {
  $('#status').text('Detecting...')
  const {x, y, height: boxHeight, width: boxWidth} = detection.getBox()
  const bestMatch = getBestMatch(myDB.getEmbeddings(), descriptor)
  let className, color

  if (bestMatch && bestMatch.distance < maxFaceDist) {
    className = `${bestMatch.className} (${bestMatch.distance})`
    if (bestMatch.className.startsWith(unknownPrefix)) {
      color = 'red'
    } else {
      color = 'green'
    }
  } else {
    console.log('Tagged as unknown because dist was', bestMatch.distance, 'to best match', bestMatch.className)
    // If class is unknown, assign it a number and
    // save the embeddings to the database
    className = unknownPrefix + myDB.getAutoIncrement()
    color = 'red'
    detectorCtx.drawImage(videoEl, x, y, boxHeight, boxWidth,
                          0, 0, detectorCnv.width, detectorCnv.height)

    myDB.addClass(className, [descriptor], detectorCnv.toDataURL())
  }

  faceapi.drawText(
    canvasCtx,
    x,
    y + boxHeight + 3,
    className,
    Object.assign(faceapi.getDefaultDrawOptions(), { color: color, fontSize: 20 })
  )
}

function train (detection, descriptor, numTrainImages = app.numTrainImages) {
  let {data, className, image} = trainState.state

  $('#status').text(`Getting embeddings for class: ${className}... ${data.length} / ${numTrainImages}`)
  trainState.appendData(descriptor)

  const {x, y, height: boxHeight, width: boxWidth} = detection.getBox()
  detectorCtx.drawImage(videoEl, x, y, boxHeight, boxWidth,
                        0, 0, detectorCnv.width, detectorCnv.height)

  if (data.length === 1) {
    trainState.setImage(detectorCnv.toDataURL())
  }

  if (data.length >= numTrainImages) {
    // Save the embeddings to localstorage
    myDB.addClass(className, data, image)

    // cleanup by pausing the video feed
    // and setting training data to an empty array
    // videoEl.pause()
    app.isTraining = false
    trainState.emptyState()
    $('#status').text('Done training!')
  }
}

async function forwardPass (mode, singleShot = false) {
  if (videoEl.paused || videoEl.ended || !modelLoaded) {
    return false
  }

  const {width, height} = faceapi.getMediaDimensions(videoEl)

  // I've tried removing this, it seems explicit setting of
  // canvas width and height is required to draw properly
  canvas.width = width
  canvas.height = height

  const ts = Date.now()

  // We need this try catch block because of
  // https://github.com/justadudewhohacks/face-api.js/issues/66
  // If we dont have this block, inferencing of training will stop
  try {
    if (mode === 'warmup') {
      console.log('Warming up')
      $('#status').text('Warming up... Please wait just a little bit.')
    }

    const fullFaceDescriptions = await faceapi.allFacesMtcnn(videoEl, mtcnnParams)
    updateTimeStats(Date.now() - ts)

    if (mode === 'warmup') {
      $('#status').text('Ready to go!')
      $('.initial-hide').show()
      return
    }

    fullFaceDescriptions.forEach(({detection, landmarks, descriptor}) => {
      if (detection.score < minConfidence) {
        return
      }

      faceapi.drawDetection('overlay', detection.forSize(width, height), {lineWidth: 2})
      faceapi.drawLandmarks('overlay', landmarks.forSize(width, height), {lineWidth: 4})

      if (mode === 'training') {
        train(detection, descriptor)
      } else if (mode === 'inference') {
        doFaceDetection(detection, descriptor)
        if (singleShot) {
          videoEl.pause()
          $('#status').text('Detection paused (single shot mode)')
        }
      }
    })
  }
  catch (err) {
    console.log(err)
  }
  if (shouldInfer) {
    setTimeout(() => forwardPass(mode, singleShot))
  } else {
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
  }
}

$(document).ready(run)
