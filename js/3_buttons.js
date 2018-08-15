// function _play () {
//   canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
//   videoEl.play()
// }

async function _play_then_infer (mode, singleShot = false) {
  if (videoEl.paused) {
    videoEl.play()
  }

  await new Promise((resolve) => {
    setTimeout(resolve, 100)
  })

  shouldInfer = true
  forwardPass(mode, singleShot)
}

// function play () {
//   $('#status').text('Recording resumed')
//   _play()
// }

function stop () {
  $('#status').text('Detection paused')
  shouldInfer = false
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

function onRangeInput(e) {
  $('#trainImagesSpan').text(e.value)
}

videoEl.addEventListener('canplay', () => {
  forwardPass('warmup')
})
