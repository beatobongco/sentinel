function _play () {
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
  videoEl.play()
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
  _play()
  forwardPass('inference', true)
}

function realTime () {
  _play()
  forwardPass('inference')
}

function trainClass() {
  _play()
  forwardPass('training')
}
