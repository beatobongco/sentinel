/*
  Vue app for controlling state of certain parts of the app.

  For function definition shorthand: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Method_definitions

  TODO:
    * most of the app will eventually be refactored in Vue.
    * globals should be ALL_CAPS
*/

// All our constants should only be under one namespace
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

const app = new Vue({
  el: '#app',
  data: {
    mode: constants.modes.LOADING,
    tab: 'info',
    sharedState: constants.db.state,
    forwardTimes: []
  },
  mounted: async function () {
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
      await this.forwardPass()
      videoEl.removeEventListener('canplay', handler)
      this.setMode(modes.IDLE)
    }.bind(this)

    videoEl.addEventListener('canplay', handler)
  },
  computed: {
    avgTimeInMs () {
      if (this.forwardTimes.length > 0) {
        return this.forwardTimes.reduce((total, t) => total + t) / this.forwardTimes.length
      }
    },
    fps () {
      return `${Math.round(1000 / this.avgTimeInMs) || 0} fps`
    },
    avgInferenceTime () {
      return `${Math.round(this.avgTimeInMs) || 0} ms`
    }
  },
  watch: {
    mode (mode) {
      console.log(`System is now ${mode}.`)
    }
  },
  methods: {
    switchTab (tabName) {
      this.tab = tabName
    },
    setMode (mode) {
      this.mode = mode
    },
    forwardPass: async function () {
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
        this.updateTimeStats(Date.now() - ts)
        return fullFaceDescriptions
      } catch (err) {
        console.log(err)
      }
    },
    drawDetection (detection, landmarks, color, className) {
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
    },
    computeMeanDistance (descriptors, queryDescriptor) {
      const {faceapi} = constants
      return faceapi.round(
        descriptors
          .map(d => faceapi.euclideanDistance(d, queryDescriptor))
          .reduce((d1, d2) => d1 + d2, 0) / (descriptors.length || 1)
        )
    },
    getBestMatch (queryDescriptor) {
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
            distance: this.computeMeanDistance(descriptors, queryDescriptor),
            className
          })
        )
        .reduce((best, curr) => best.distance < curr.distance ? best : curr)
    },
    classifyFace: async function () {
      const {db, videoEl, detectorCnv, detectorCtx,
             maxFaceDist, unknownPrefix, minConfidence,
             modes, canvasCtx, canvas} = constants

      const faceDescriptions = await this.forwardPass()

      // boolean flag needed for single shot mode
      let detected = false

      if (faceDescriptions) {
        faceDescriptions.forEach(({detection, landmarks, descriptor}) => {
          const {x, y, height: boxHeight, width: boxWidth} = detection.getBox()
          const bestMatch = this.getBestMatch(descriptor)
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
            // If class is unknown, assign it a number and
            // save the embeddings to the database
            className = unknownPrefix + db.getAutoIncrement()
            db.addClass(className, [descriptor], detectorCnv.toDataURL())
            color = 'red'
            // detectorCtx.drawImage(videoEl, x, y, boxHeight, boxWidth,
            //                       0, 0, detectorCnv.width, detectorCnv.height)
          }

          this.drawDetection(detection, landmarks, color, className)
        })
      }

      // Three things can happen
      // * we keep looping detection
      // * we stop detection
      // * if we detected at least one face,
      //   we pause video and show detection box (for slow computers)

      canvasCtx.clearRect(0, 0, canvas.width, canvas.height)

      if (this.mode === modes.IDLE) {
        return
      } else if (this.mode === modes.LOOP) {
        this.classifyFace()
      } else if (this.mode === modes.SINGLE) {
        if (detected) {
          videoEl.pause()
          this.setMode(modes.IDLE)
        } else {
          this.classifyFace()
        }
      }
    },
    updateTimeStats (timeInMs) {
      this.forwardTimes = [timeInMs].concat(this.forwardTimes).slice(0, 30)
    },
    onDetect: async function (btnMode) {
      const {modes, videoEl} = constants
      if (videoEl.paused) {
        videoEl.play()
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      if (btnMode === 'single') {
        this.setMode(modes.SINGLE)
        this.classifyFace()
      } else if (btnMode === 'realtime') {
        this.setMode(modes.LOOP)
        this.classifyFace()
      } else if (btnMode === 'stop') {
        this.setMode(modes.IDLE)
      }
    }
  }
})

Vue.component('training-app', {
  props: ['mode', 'setMode', 'drawDetection', 'forwardPass', 'computeMeanDistance'],
  data () {
    // It's fine for this component to have this much state because it's just temporary.
    // This state is cleared after it is sent to db after successful training.
    return {
      numTrainImages: 5,
      embeddings: [],
      classImage: null,
      trainClassName: null
    }
  },
  methods: {
    // We're not using the shortcut async train()
    // because *maybe* it's too bleeding edge
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Method_definitions#Async_methods
    train: async function () {
      // Trains a class
      const {minConfidence, maxFaceDist, detectorCnv, canvas,
             canvasCtx, db, modes} = constants
      this.setMode(modes.TRAINING)

      const faceDescriptions = await this.forwardPass()

      if (faceDescriptions) {
        faceDescriptions.forEach(({detection, landmarks, descriptor}) => {
          if (detection.score < minConfidence) {
            return
          }

          if (this.embeddings.length > 1) {
            const meanDistance = this.computeMeanDistance(this.embeddings, descriptor)
            // Don't save images too close to what we already have
            if (meanDistance < maxFaceDist) {
              console.log('REJECT. Image distance:', meanDistance)
              return
            }
            console.log('ACCEPT. Image distance:', meanDistance)
          }

          this.drawDetection(detection, landmarks)

          this.embeddings.push(descriptor)
          // We save the first image taken as the display picture
          if (this.embeddings.length === 1) {
            // TODO this is not functional
            this.classImage = detectorCnv.toDataURL()
          }
        })
      }

      // If we have all the data we need, save to DB
      if (this.embeddings.length >= this.numTrainImages) {
        db.addClass(this.trainClassName, this.embeddings, this.classImage)
        this.setMode(modes.IDLE)
        // reset state
        Object.assign(this.$data, this.$options.data())
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
      } else {
        this.train()
      }
    }
  },
  template: `
    <div
      class="train-tab">
      <h3>Train the system on a face</h3>
      <div v-if="mode === 'TRAINING'">
        <p>
          Training class {{trainClassName}}... {{embeddings.length}}/{{numTrainImages}}.
          Move your head around and doing other actions slowly (try blinking your eyes).
        </p>
      </div>
      <div v-else>
        <p>How many pictures will the system take for training?</p>
        <div class="train-slider">
          <input
            id="numTrainImages"
            type="range"
            min="1"
            max="10"
            v-model="numTrainImages">
          <span>{{numTrainImages}}</span>
        </div>
        <p>
          <small>Note: Even 1 image works great! Try it!</small>
        </p>
        <div>
          <p>Whose face is this?</p>
          <input v-model="trainClassName" type="text">
          <button @click="train">Train class</button>
        </div>
      </div>
    </div>
  `
})

Vue.component('face-class', {
  props: ['embs'],
  data () {
    return {
      isEditing: false,
      faceName: this.embs.className
    }
  },
  watch: {
    isEditing (val) {
      if (val) {
        this.$nextTick(() => { this.$refs.inputRef.select() })
      }
    }
  },
  methods: {
    toggleEdit () {
      this.isEditing = !this.isEditing
    },
    deleteClass () {
      if (confirm(`Are you sure you want to delete class ${this.faceName}?`)) {
        constants.db.deleteClass(this.faceName)
      }
    },
    updateClass () {
      constants.db.updateClass(this.embs.className, this.faceName)
      this.toggleEdit()
    },
    cancel () {
      this.faceName = this.embs.className
      this.toggleEdit()
    }
  },
  template: `
    <div class="face-class">
      <div class="class-image">
        <img :src="embs.image">
      </div>
      <div class="class-name">
        <input
          v-if="isEditing"
          ref="inputRef"
          v-model="faceName"
          type="text" />
        <span v-else>{{faceName}}</span>
      </div>
      <div class="controls">
        <span v-if="isEditing">
          <button @click="updateClass">Save</button>
          <button @click="cancel">Cancel</button>
        </span>
        <span v-else>
          <button @click="toggleEdit">Edit</button>
          <button @click="deleteClass">Delete</button>
        </span>
      </div>
    </div>`
})
