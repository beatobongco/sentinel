/*
  Vue app for controlling state of certain parts of the app.

  For function definition shorthand: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Method_definitions

  TODO: most of the app will eventually be refactored in Vue.
*/
const app = new Vue({
  el: '#app',
  data: {
    isTraining: false,
    tab: 'info',
    sharedState: myDB.state,
  },
  methods: {
    switchTab (tabName) {
      this.tab = tabName
    },
    setTrainingFlag (val) {
      this.isTraining = val
    },
    getTrainingFlag () {
      return this.isTraining
    },
    forwardPass: async function () {
      // Performs a forward pass on the network with the video element as input
      if (videoEl.paused || videoEl.ended || !modelLoaded) {
        return false
      }

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
        updateTimeStats(Date.now() - ts)
        return fullFaceDescriptions
      } catch (err) {
        console.log(err)
      }
    },
    drawDetection: function (detection, landmarks) {
      const {width, height} = faceapi.getMediaDimensions(videoEl)

      canvas.width = width
      canvas.height = height

      faceapi.drawDetection('overlay', detection.forSize(width, height), {lineWidth: 2})
      faceapi.drawLandmarks('overlay', landmarks.forSize(width, height), {lineWidth: 4})
    }
  }
})

Vue.component('training-app', {
  props: ['setTrainingFlag', 'isTraining', 'drawDetection', 'forwardPass'],
  data () {
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
      this.setTrainingFlag(true)

      const faceDescriptions = await this.forwardPass()

      faceDescriptions.forEach(({detection, landmarks, descriptor}) => {
        if (detection.score < minConfidence) {
          return
        }

        this.drawDetection(detection, landmarks)

        const {x, y, height: boxHeight, width: boxWidth} = detection.getBox()
        detectorCtx.drawImage(videoEl, x, y, boxHeight, boxWidth,
                              0, 0, detectorCnv.width, detectorCnv.height)

        this.embeddings.push(descriptor)
        // We save the first image taken as the display picture
        if (this.embeddings.length === 1) {
          this.classImage = detectorCnv.toDataURL()
        }
      })

      // If we have all the data we need, save to DB
      if (this.embeddings.length >= this.numTrainImages) {
        myDB.addClass(this.trainClassName, this.embeddings, this.classImage)
        this.setTrainingFlag(false)
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
      <div v-if="!isTraining">
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
      <div v-else>
        <p>Training class {{trainClassName}}... {{embeddings.length}}/{{numTrainImages}}. Move your head around!</p>
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
        this.$nextTick(() => {this.$refs.inputRef.select()})
      }
    }
  },
  methods: {
    toggleEdit () {
      this.isEditing = !this.isEditing
    },
    deleteClass () {
      if (confirm(`Are you sure you want to delete class ${this.faceName}?`)) {
        myDB.deleteClass(this.faceName)
      }
    },
    updateClass () {
      myDB.updateClass(this.embs.className, this.faceName)
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
