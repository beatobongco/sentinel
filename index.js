let modelLoaded = false
let videoEl = document.querySelector('#inputVideo')
let minConfidence = .5

function startDetection() {
  console.log('why')
  onPlay(videoEl)
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

async function onPlay(videoEl) {
  console.log('onPlay')

  if(videoEl.paused || videoEl.ended || !modelLoaded) {
    console.log('eep')
    return false
  }

  const mtcnnParams = {minFaceSize: 200}
  const {width, height} = faceapi.getMediaDimensions(videoEl)
  const canvas = document.getElementById('overlay')
  canvas.width = width
  canvas.height = height

  const {results, stats} = await faceapi.nets.mtcnn.forwardWithStats(videoEl, mtcnnParams)

  if (results) {
    results.forEach(({faceDetection, faceLandmarks}) => {
      if (faceDetection.score < minConfidence) {
        return
      }
      const {x, y, height: boxHeight} = faceDetection.getBox()
      faceapi.drawDetection('overlay', faceDetection.forSize(width, height))
      faceapi.drawLandmarks('overlay', faceLandmarks.forSize(width, height), {lineWidth: 4, color: 'red'})
      faceapi.drawText(
        canvas.getContext('2d'),
        x,
        y + boxHeight,
        'hello',
        Object.assign(faceapi.getDefaultDrawOptions(), { color: 'green', fontSize: 20 })
      )
      console.log(faceDetection)
      console.log(faceLandmarks)
    })
    return
  } else {
    console.log('no results')
  }
  /* The next lines error out because I think I'm missing a model...
    Next steps:
    * check what's missing (prolly classifier) from the example code
    * just dump the models from the repo here, wouldn't harm to upload them too
  */

  // const fullFaceDescriptions = (await faceapi.allFacesMtcnn(videoEl, mtcnnParams))
  //   .map(fd => fd.forSize(width, height))

  // fullFaceDescriptions.forEach(({ detection, landmarks, descriptor }) => {
  //   faceapi.drawDetection('overlay', [detection], { withScore: false })
  //   faceapi.drawLandmarks('overlay', landmarks.forSize(width, height), { lineWidth: 4, color: 'red' })
  //   const { x, y, height: boxHeight } = detection.getBox()
  //   faceapi.drawText(
  //     canvas.getContext('2d'),
  //     x,
  //     y + boxHeight,
  //     text,
  //     Object.assign(faceapi.getDefaultDrawOptions(), { color: 'red', fontSize: 16 })
  //   )
  // })
  setTimeout(() => onPlay(videoEl), 10)
}

window.onload = function() {
  run()
}
// document.addEventListener('DOMContentLoaded', run, false)
