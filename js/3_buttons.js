// async function _play_then_infer (mode, singleShot = false) {
//   if (videoEl.paused) {
//     videoEl.play()
//   }

//   await new Promise((resolve) => {
//     setTimeout(resolve, 100)
//   })

//   shouldInfer = true
//   forwardPass(mode, singleShot)
// }

// function stop () {
//   shouldInfer = false
//   if (videoEl.paused) {
//     videoEl.play()
//   }
//   canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
//   setTimeout(() => {
//     $('#status').text('Detection paused')
//   }, 100)
// }

// function deleteClass () {
//   const cls = $('#trainClass').val()
//   myDB.deleteClass(cls)
//   $('#status').text(`Class ${cls} deleted.`)
// }

// function singleShot () {
//   _play_then_infer('inference', true)
// }

// function realTime () {
//   _play_then_infer('inference')
// }

// function trainClass () {
//   app.isTraining = true
//   trainState.setClassName($('#trainClass').val())
//   _play_then_infer('training')
// }

