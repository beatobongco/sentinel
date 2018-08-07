function play() {
  videoEl.play()
}

function stop() {
  videoEl.pause()
}

function singleShot() {
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
  onPlay()
}

videoEl.onpause = () => {
  $('#status').text('Recording paused')
}

function deleteClass() {
  myDB.deleteClass($('#trainClass').val())
}
