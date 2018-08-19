/*
  USED FOR DEBUGGING PERFORMANCE Vue vs non-Vue
*/

const constants = {
  // Max euclidean distance that system will allow
  // before person is classified as unknown
  maxFaceDist: 0.6,
  // If score is any lower than minConfidence,
  // system wont process this face
  minConfidence: 0.9,
  // Prefix given to unknown classes
  unknownPrefix: 'Unknown #',
  db: Object.create(db),
  faceapi: faceapi,
  // canvas elements and contexts for cleaner code
  videoEl: document.querySelector('#inputVideo'),
  canvas: document.getElementById('overlay'),
  canvasCtx: document.getElementById('overlay').getContext('2d'),
  detectorCnv: document.getElementById('detectorCnv'),
  detectorCtx: document.getElementById('detectorCnv').getContext('2d'),
  // These modes are flags that control the app's behavior,
  // indicating when certain looping functions to terminate
  modes: {
    LOADING: 'LOADING',
    IDLE: 'IDLE',
    LOOP: 'LOOP',
    SINGLE: 'SINGLE'
  },
  modelsPath: 'models/',
  mtcnnParams: {
    minFaceSize: 200
  }
}

var app = {
  mode: constants.modes.LOOP,
  forwardTimes: [],
  setMode (mode) {
    this.mode = mode
  },
  updateTimeStats (timeInMs) {
    this.forwardTimes = [timeInMs].concat(this.forwardTimes).slice(0, 30)
    if (this.forwardTimes.length > 0) {
      const tmp = this.forwardTimes.reduce((total, t) => total + t) / this.forwardTimes.length
      console.log(`${Math.round(1000 / tmp)} fps | ${Math.round(tmp)} ms`)
    }
  }
}

async function classifyFace () {
  const {db, videoEl, detectorCnv, detectorCtx,
         maxFaceDist, unknownPrefix, minConfidence,
         modes} = constants

  const faceDescriptions = await forwardPass()

  // boolean flag needed for single shot mode
  let detected = false

  if (faceDescriptions) {
    faceDescriptions.forEach(({detection, landmarks, descriptor}) => {
      const {x, y, height: boxHeight, width: boxWidth} = detection.getBox()
      const bestMatch = getBestMatch(descriptor)
      let className, color

      if (detection.score < minConfidence) {
        return
      }

      detected = true

      if (bestMatch && bestMatch.distance < maxFaceDist) {
        className = `${bestMatch.className} (${bestMatch.distance})`
        if (bestMatch.className.startsWith(unknownPrefix)) {
          color = 'red'
        } else {
          color = 'green'
        }
      } else {
        // console.log('Tagged as unknown because dist was', bestMatch.distance, 'to best match', bestMatch.className)
        // If class is unknown, assign it a number and
        // save the embeddings to the database
        className = unknownPrefix + db.getAutoIncrement()
        db.addClass(className, [descriptor], detectorCnv.toDataURL())
        color = 'red'
        // detectorCtx.drawImage(videoEl, x, y, boxHeight, boxWidth,
        //                       0, 0, detectorCnv.width, detectorCnv.height)
      }

      drawDetection(detection, landmarks, color, className)
    })
  }

  // Three things can happen
  // * we keep looping detection
  // * we stop detection
  // * if we detected at least one face,
  //   we pause video and show detection box (for slow computers)

  if (app.mode === modes.IDLE) {
    return
  } else if (app.mode === modes.LOOP) {
    setTimeout(classifyFace)
  } else if (app.mode === modes.SINGLE) {
    if (detected) {
      videoEl.pause()
      app.setMode(modes.IDLE)
    } else {
      classifyFace()
    }
  }
}

async function forwardPass () {
  // Performs a forward pass on the network with the video element as input
  const {videoEl, canvas, faceapi, mtcnnParams} = constants

  // if (videoEl.paused || videoEl.ended) {
  //   return
  // }

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
    const fullFaceDescriptions = await faceapi.allFacesMtcnn(videoEl, mtcnnParams)
    app.updateTimeStats(Date.now() - ts)
    return fullFaceDescriptions
  } catch (err) {
    console.log(err)
  }
}

function getBestMatch (queryDescriptor) {
  /*
    Args:
      queryDescriptor: face embeddings of incoming detection
    Returns:
      Object {className, distance}
  */
  const embs = constants.db.getEmbeddings()

  if (embs.length === 0) {
    return
  }

  return embs
    .map(
      ({descriptors, className}) => ({
        distance: computeMeanDistance(descriptors, queryDescriptor),
        className
      })
    )
    .reduce((best, curr) => best.distance < curr.distance ? best : curr)
}

function computeMeanDistance (descriptors, queryDescriptor) {
  const {faceapi} = constants
  return faceapi.round(
    descriptors
      .map(d => faceapi.euclideanDistance(d, queryDescriptor))
      .reduce((d1, d2) => d1 + d2, 0) / (descriptors.length || 1)
    )
}

function drawDetection (detection, landmarks, color, className) {
  // TODO: Since we refactored, we are able to customize color better
  const {faceapi, videoEl, canvas, canvasCtx,
         detectorCnv, detectorCtx} = constants
  const {width, height} = faceapi.getMediaDimensions(videoEl)

  canvas.width = width
  canvas.height = height

  // FIXME: since the refactor this doesn't work anymore in realtime...
  // could it be the speed? Fuck.
  faceapi.drawDetection('overlay', detection.forSize(width, height), {lineWidth: 2})
  faceapi.drawLandmarks('overlay', landmarks.forSize(width, height), {lineWidth: 4})

  const {x, y, height: boxHeight, width: boxWidth} = detection.getBox()
  detectorCtx.drawImage(videoEl, x, y, boxWidth, boxHeight,
                        0, 0, detectorCnv.width, detectorCnv.height)

  if (className) {
    faceapi.drawText(
      canvasCtx,
      x,
      y + boxHeight + 3,
      className,
      Object.assign(faceapi.getDefaultDrawOptions(), { color: color, fontSize: 20 })
    )
  }
}

$(document).ready(async function () {
  const {faceapi, db, modes, modelsPath, videoEl} = constants
  await faceapi.loadMtcnnModel(modelsPath)
  await faceapi.loadFaceRecognitionModel(modelsPath)
  await db.init()

  // setup video feed
  navigator.mediaDevices.getUserMedia({video: true})
    .then(stream => {
      videoEl.srcObject = stream
    })

  const handler = async function () {
    console.log('Warming up the engines, my lord.')
    await forwardPass()
    videoEl.removeEventListener('canplay', handler)
    // this.setMode(modes.IDLE)
  }.bind(this)

  videoEl.addEventListener('canplay', handler)
})
