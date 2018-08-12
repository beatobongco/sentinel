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
      console.warn('DB already initialized. Only do this once.')
      return
    }

    this.initialized = true
    this.classes = []

    this.classes = await localforage.getItem('CLASSES') || []
    this.embeddings = await Promise.all(
      this.classes.map(
        async className => ({className, descriptors: await localforage.getItem(className)})
        ))
    console.log('Loaded classes:', this.classes)

    this.autoIncrement = await localforage.getItem('AUTOINCREMENT') || 0
  },
  getAutoIncrement: function () {
    let tmp = this.autoIncrement
    this.autoIncrement = tmp + 1
    localforage.setItem('AUTOINCREMENT', this.autoIncrement)
    return tmp
  },
  getClasses: function () {
    return this.classes
  },
  getEmbeddings: function () {
    return this.embeddings
  },
  addClass: function (className, descriptors) {
    this.embeddings = [...this.embeddings, {className, descriptors}]
    this.classes = [...this.classes, className]

    localforage.setItem('CLASSES', this.classes)
    localforage.setItem(className, descriptors)
  },
  deleteClass: function (className) {
    this.classes = immutableRemove(this.classes, this.classes.indexOf(className))
    this.embeddings = immutableRemove(this.embeddings, this.embeddings.findIndex((el) => el.className === className))

    localforage.setItem('CLASSES', this.classes)
    localforage.removeItem(className)
  },
  updateClass: function (oldClass, newClass) {
    this.addClass(newClass, this.embeddings[oldClass])
    this.deleteClass(oldClass)
  }
}

function immutableRemove (list, idx) {
  if (idx > -1) {
    list = [
      ...list.slice(0, idx),
      ...list.slice(idx + 1)
    ]
  }
  return list
}
