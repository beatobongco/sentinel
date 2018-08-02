async function run() {
  console.log('run')
  // load models
  await faceapi.loadMtcnnModel('models/')

  // setup video feed
  const video = document.querySelector('#inputVideo')

  navigator.mediaDevices.getUserMedia({video: true}).
    then(stream => video.srcObject = stream)

  onPlay()
}

async function onPlay() {
  console.log('onPlay')

  const mtcnnParams = {minFaceSize: 200}
  const videoEl = document.getElementById('inputVideo')
  const width = 640
  const height = 480
  const canvas = document.getElementById('overlay')
  // const mtcnnResults = await faceapi.mtcnn(document.getElementById('inputVideo'), {minFaceSize: 200})

  // console.log(mtcnnResults)
  // faceapi.drawDetection('overlay', mtcnnResults.map(res => res.faceDetection), { withScore: false })

  // faceapi.drawLandmarks('overlay', mtcnnResults.map(res => res.faceLandmarks), { lineWidth: 4, color: 'red' })
  const fullFaceDescriptions = (await faceapi.allFacesMtcnn(videoEl, mtcnnParams))
    .map(fd => fd.forSize(width, height))

  fullFaceDescriptions.forEach(({ detection, landmarks, descriptor }) => {
    faceapi.drawDetection('overlay', [detection], { withScore: false })
    faceapi.drawLandmarks('overlay', landmarks.forSize(width, height), { lineWidth: 4, color: 'red' })
    const { x, y, height: boxHeight } = detection.getBox()
    faceapi.drawText(
      canvas.getContext('2d'),
      x,
      y + boxHeight,
      text,
      Object.assign(faceapi.getDefaultDrawOptions(), { color: 'red', fontSize: 16 })
    )
  })
  setTimeout(() => onPlay())
}
document.addEventListener('DOMContentLoaded', run, false)
