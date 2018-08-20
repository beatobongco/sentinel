/*
  Vue app for controlling state of certain parts of the app.

  For function definition shorthand: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Method_definitions

  FIXME: Not sure if encasing in Vue app messes with performance.
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
    minFaceSize: 100
  }
}

function clearCanvas () {
  const {canvas, canvasCtx} = constants
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
}

const app = new Vue({
  el: '#app',
  data: {
    status: 'Loading...',
    mode: constants.modes.LOADING,
    tab: 'info',
    sharedState: constants.db.state,
    forwardTimes: []
  },
  mounted: async function () {
    const {faceapi, db, modes, modelsPath, videoEl} = constants
    this.status = 'Loading model weights...'
    // await faceapi.loadMtcnnModel(modelsPath)
    await faceapi.loadTinyYolov2Model(modelsPath)
    await faceapi.loadFaceRecognitionModel(modelsPath)
    this.status = 'Initializing database...'
    await db.init()

    // setup video feed
    navigator.mediaDevices.getUserMedia({video: true})
      .then(stream => {
        videoEl.srcObject = stream
      })

    const handler = async function () {
      console.log('Warming up the engines, my lord.')
      this.status = 'Warming up the network...'
      await this.forwardPass()
      videoEl.removeEventListener('canplay', handler)
      this.setMode(modes.IDLE)
      $('.canvas-container').show()
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
      console.log(`System mode: ${mode}.`)
      const {modes} = constants
      if (mode === modes.IDLE) {
        this.status = 'READY'
      } else if (mode === modes.LOOP | modes.SINGLE) {
        this.status = 'DETECTING'
      }
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
        //const fullFaceDescriptions = await faceapi.allFacesMtcnn(videoEl, mtcnnParams)
        const fullFaceDescriptions = await faceapi.tinyYolov2(videoEl, {
          scoreThreshold: 0.5,
          // any number or one of the predifened sizes:
          // 'xs' (224 x 224) | 'sm' (320 x 320) | 'md' (416 x 416) | 'lg' (608 x 608)
          inputSize: 'md'
        })
        this.updateTimeStats(Date.now() - ts)
        return fullFaceDescriptions
      } catch (err) {
        console.log(err)
      }
    },
    drawDetection (detection, color, className) {
      // TODO: Since we refactored, we are able to customize color better
      const {faceapi, videoEl, canvas, canvasCtx,
             detectorCnv, detectorCtx} = constants
      const {width, height} = faceapi.getMediaDimensions(videoEl)

      canvas.width = width
      canvas.height = height

      faceapi.drawDetection('overlay', detection.forSize(width, height), {lineWidth: 2, color})
      // faceapi.drawLandmarks('overlay', landmarks.forSize(width, height), {lineWidth: 4, color})

      const {x, y, height: boxHeight, width: boxWidth} = detection.getBox()
      detectorCtx.drawImage(videoEl, x, y, boxWidth, boxHeight,
                            0, 0, detectorCnv.width, detectorCnv.height)

      if (className) {
        faceapi.drawText(
          canvasCtx,
          x,
          y + boxHeight + 3,
          className,
          Object.assign(faceapi.getDefaultDrawOptions(), { color, fontSize: 20 })
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
             modes} = constants

      const faceDescriptions = await this.forwardPass()

      // boolean flag needed for single shot mode
      let detected = false

      if (faceDescriptions) {
        // faceDescriptions.forEach(({detection, landmarks, descriptor}) => {
          // if (detection.score < minConfidence) {
          //   return
          // }
        const tempcnv = document.createElement('canvas')
        faceDescriptions.forEach(async detection => {
          const {x, y, height: boxHeight, width: boxWidth} = detection.getBox()
          tempcnv.width = boxWidth
          tempcnv.height = boxHeight
          tempcnv.getContext('2d').drawImage(videoEl, x, y, boxWidth, boxHeight,
                                0, 0, boxWidth, boxHeight)
          const descriptor = await faceapi.computeFaceDescriptor(tempcnv)
          const bestMatch = this.getBestMatch(descriptor)

          let className, color
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
          }

          requestAnimationFrame(() => {
            this.drawDetection(detection, color, className) })
        })
      }

      // Three things can happen
      // * we keep looping detection
      // * we stop detection
      // * if we detected at least one face,
      //   we pause video and show detection box (for slow computers)

      if (this.mode === modes.IDLE) {
        clearCanvas()
        return
      } else if (this.mode === modes.LOOP) {
        // ATTENTION: You have to wrap heavy async functions like classifyFace
        // and train else drawing detection will not work
        setTimeout(this.classifyFace)
      } else if (this.mode === modes.SINGLE) {
        if (detected) {
          videoEl.pause()
          this.setMode(modes.IDLE)
        } else {
          setTimeout(this.classifyFace)
        }
      }
    },
    updateTimeStats (timeInMs) {
      this.forwardTimes = [timeInMs].concat(this.forwardTimes).slice(0, 30)
    },
    getTabs () {
      return [
        {id: 'train', text: 'Training'},
        {id: 'detect', text: 'Detection'},
        {id: 'classlist', text: 'Edit/Delete classes'},
        {id: 'info', text: 'Instructions'}
      ]
    },
    onDetect: async function (btnMode) {
      const {modes, videoEl} = constants
      if (videoEl.paused) {
        clearCanvas()
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
        clearCanvas()
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
      numTrainImages: 3,
      embeddings: [],
      classImage: null,
      trainClassName: null
    }
  },
  methods: {
    onClick () {
      const {videoEl} = constants
      clearCanvas()
      videoEl.play()
      this.train()
    },
    // We're not using the shortcut async train()
    // because *maybe* it's too bleeding edge
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Method_definitions#Async_methods
    train: async function () {
      // Trains a class
      const {videoEl, minConfidence, maxFaceDist, detectorCnv, db, modes} = constants
      this.setMode(modes.LOOP)

      const faceDescriptions = await this.forwardPass()

      if (faceDescriptions) {
        // faceDescriptions.forEach(({detection, landmarks, descriptor}) => {
        //   if (detection.score < minConfidence) {
        //     return
        //   }
        const tempcnv = document.createElement('canvas')
        faceDescriptions.forEach(async detection => {
          const {x, y, height: boxHeight, width: boxWidth} = detection.getBox()
          tempcnv.width = boxWidth
          tempcnv.height = boxHeight
          tempcnv.getContext('2d').drawImage(videoEl, x, y, boxWidth, boxHeight,
                                0, 0, boxWidth, boxHeight)
          const descriptor = await faceapi.computeFaceDescriptor(tempcnv)

          if (this.embeddings.length > 1) {
            const meanDistance = this.computeMeanDistance(this.embeddings, descriptor)
            // Don't save images too close to what we already have
            if (meanDistance < maxFaceDist) {
              console.log('REJECT. Image distance:', meanDistance)
              return
            }
            console.log('ACCEPT. Image distance:', meanDistance)
          }

          requestAnimationFrame(() => {
            this.drawDetection(detection, 'blue', this.trainClassName) })

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
        clearCanvas()
        Object.assign(this.$data, this.$options.data())
      } else {
        setTimeout(this.train)
      }
    }
  },
  template: `
    <div
      class="train-tab">
      <h3 id="train">Train the system on a face</h3>
      <div v-if="mode === 'LOOP'">
        <p>
          Training class {{trainClassName}}... {{embeddings.length}}/{{numTrainImages}}.
          Please move your head around.
        </p>
      </div>
      <div v-else>
        <p>How many pictures will the system take for training?</p>
        <div class="train-slider">
          <input
            id="numTrainImages"
            type="range"
            min="1"
            max="5"
            v-model="numTrainImages">
          <span>{{numTrainImages}}</span>
        </div>
        <p>
          <small>Note: Even 1 image works great! Try it!</small>
        </p>
        <div>
          <p>Whose face is this?</p>
          <input v-model="trainClassName" type="text">
          <button class="primary" @click="onClick">Train class</button>
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
          <button class="primary" @click="updateClass">Save</button>
          <button class="negative" @click="cancel">Cancel</button>
        </span>
        <span v-else>
          <button class="neutral" @click="toggleEdit">Edit</button>
          <button class="negative" @click="deleteClass">Delete</button>
        </span>
      </div>
    </div>`
})
