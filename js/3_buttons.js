function _play () {
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
  videoEl.play()
}

async function _play_then_infer (mode, singleShot = false) {
  _play()

  await new Promise((resolve) => {
    setTimeout(resolve, 100)
  })
  console.log(mode, singleShot)
  forwardPass(mode, singleShot)
}

function play () {
  $('#status').text('Recording resumed')
  _play()
}

function stop () {
  $('#status').text('Recording paused')
  videoEl.pause()
}

function deleteClass () {
  const cls = $('#trainClass').val()
  myDB.deleteClass(cls)
  $('#status').text(`Class ${cls} deleted.`)
}

function singleShot () {
  _play_then_infer('inference', true)
}

function realTime () {
  _play_then_infer('inference')
}

function trainClass() {
  _play_then_infer('training')
}
