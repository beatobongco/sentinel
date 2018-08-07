/*
  An object that holds state using a basic OLOO pattern.
  This is preferrable to keeping separate global state variables
  because it's under one namespace (db or whatever it's initialized to be).

  I guess I kind of get this from YDKJS and Vue's recommendation
  of keeping state in bus/Vue-like object.
*/
const db = {
  init: async function () {
    // initializes current state from localforage
    // we need this to prevent gross code of too many awaits
    // we need this to be an async fn because we need our state complete
    // before doing anything else!
    if (this.initialized) {
      console.warn("DB already initialized. Only do this once.")
      return
    }

    this.initialized = true
    this.classes = []
    this.embeddings = []

    await localforage.getItem('CLASSES', async (err, val) => {
      if (!err) {
        this.classes = val
        await Promise.all(this.classes.map(
          async className => {
            await localforage.getItem(className, (err, val) => {
              if (!err) {
                this.embeddings.push({
                  className: className,
                  descriptors: val
                })
                console.log('Loaded class: ' + className)
              } else {
                console.log(err)
              }
            })
          }))
      } else {
        console.log(err)
      }
    })
  },
  getClasses: function () {
    return this.classes
  },
  getEmbeddings: function () {
    return this.embeddings
  },
  addClass: function (className, embeddings) {
    this.classes.push(className)
    this.embeddings.push({className, embeddings})

    localforage.setItem('CLASSES', this.classes, err => err ? console.log(err) : null)
    localforage.setItem(className, embeddings, err => err ? console.log(err) : null)
  }
}
