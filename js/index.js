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
  minFaceSize: 100
}

let modelLoaded = false
let forwardTimes = []
let CLASSES = ['andrew']
let faceEmbeddings = []

function updateTimeStats(timeInMs) {
  forwardTimes = [timeInMs].concat(forwardTimes).slice(0, 30)
  const avgTimeInMs = forwardTimes.reduce((total, t) => total + t) / forwardTimes.length
  $('#time').val(`${Math.round(avgTimeInMs)} ms`)
  $('#fps').val(`${faceapi.round(1000 / avgTimeInMs)}`)
}

async function getEmbeddingsFromLocalStorage(classes) {
  return Promise.all(classes.map(
    async className => {
      await localforage.getItem(className, (err, val) => {
        if (!err) {
          faceEmbeddings.push({
            className: className,
            descriptors: val
          })
          console.log('Loaded class: ' + className)
        } else {
          console.log(err)
        }
      })
    }))
}

function getBestMatch(descriptorsByClass, queryDescriptor) {
  /*
    In:
      descriptorsByClass: array of objs with className and face
                          embeddings
      queryDescriptor: face embeddings of incoming detection
  */
  function computeMeanDistance(descriptors) {
    return faceapi.round(
      descriptors
        .map(d => faceapi.euclideanDistance(d, queryDescriptor))
        .reduce((d1, d2) => d1 + d2, 0) / (descriptors.length || 1)
      )
  }

  return descriptorsByClass
    // .map(
    //   ({descriptors, className}) => ({
    //     distance: computeMeanDistance(descriptors),
    //     className
    //   })
    // )
    .map(function({descriptors, className}) {
      const md = computeMeanDistance(descriptors)
      // console.log(className, md)
      return {
        distance: md,
        className
      }
    })
    .reduce((best, curr) => best.distance < curr.distance ? best : curr)
}

async function getClasses() {
  localforage.getItem('CLASSES', (err, val) => {
    if (!err) {
      CLASSES = JSON.parse(val)
      console.log('Loaded', CLASSES)
    } else {
      console.log(err)
      console.log("Why not train some classes of your own?")
    }
  })
}

async function run() {
  // load models
  await faceapi.loadMtcnnModel('models/')
  await faceapi.loadFaceRecognitionModel('models/')

  modelLoaded = true

  await localforage.getItem('CLASSES', (err, val) => {
    CLASSES = val
  })
  await getEmbeddingsFromLocalStorage(CLASSES)
  // faceEmbeddings = await trainFaceRecognition(CLASSES)

  // setup video feed
  navigator.mediaDevices.getUserMedia({video: true}).
    then(stream => videoEl.srcObject = stream)
}

let trainingData = []

async function onPlay(isVideo, isTraining, numTrainImages=50) {
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

  if (fullFaceDescriptions) {
    fullFaceDescriptions.forEach(({detection, landmarks, descriptor}) => {
      if (detection.score < minConfidence) {
        return
      }
      const {x, y, height: boxHeight} = detection.getBox()
      faceapi.drawDetection('overlay', detection.forSize(width, height))
      faceapi.drawLandmarks('overlay', landmarks.forSize(width, height), {lineWidth: 4, color: 'red'})

      // TODO: refactor this later
      if (isTraining) {
        // If we're training, save the detection to localstorage
        // let's get 50 for now
        trainingData.push(descriptor)
        if (trainingData.length >= numTrainImages) {
          let className = $('#trainClass').val()
          CLASSES.push(className)
          localforage.setItem('CLASSES', CLASSES, err => {
            if (err) {
              console.log('Something went wrong while saving to localstorage')
              console.log(err)
            }
          })
          localforage.setItem(className, trainingData, err => {
            if (err) {
              console.log('Something went wrong while saving to localstorage')
              console.log(err)
            }
          })
          // cleanup by pausing the video feed, stopping the loop
          // and setting training data to an empty array
          videoEl.pause()
          trainingData = []
          return
        }
      } else {
        // Inferencing
        const bestMatch = getBestMatch(faceEmbeddings, descriptor)
        console.log('Detected: ' + bestMatch.className + '(' + bestMatch.distance + ')')
        const text = `${bestMatch.distance < maxFaceDist ? bestMatch.className : 'Unknown'} (${bestMatch.distance})`
        faceapi.drawText(
          canvasCtx,
          x,
          y + boxHeight,
          text,
          Object.assign(faceapi.getDefaultDrawOptions(), { color: 'green', fontSize: 20 })
        )
      }
    })

    //pause if in single shot mode
    if (!isVideo) {
      videoEl.pause()
    }
  }
  setTimeout(() => onPlay(isVideo, isTraining))
}

$(document).ready(run)
