const db = {
  state: {
    autoIncrement: null,
    initialized: false,
    classes: [],
    embeddings: []
  },
  init: async function () {
    // initializes current state from localforage
    // we need this to prevent gross code of too many awaits
    // we need this to be an async fn because we need our state complete
    // before doing anything else!
    if (this.initialized) {
      console.warn('DB already initialized. Only do this once.')
      return
    }

    this.state.initialized = true
    this.state.classes = await localforage.getItem('CLASSES') || []
    this.state.embeddings = await Promise.all(
      this.state.classes.map(
        async className => ({className, descriptors: await localforage.getItem(className)})
        ))
    console.log('Loaded classes:', this.state.classes)

    this.state.autoIncrement = await localforage.getItem('AUTOINCREMENT') || 0
  },
  getAutoIncrement: function () {
    let tmp = this.state.autoIncrement
    this.state.autoIncrement = tmp + 1
    localforage.setItem('AUTOINCREMENT', this.state.autoIncrement)
    return tmp
  },
  getClasses: function () {
    return this.state.classes
  },
  getEmbeddings: function () {
    return this.state.embeddings
  },
  addClass: function (className, descriptors) {
    this.state.embeddings = [...this.state.embeddings, {className, descriptors}]
    this.state.classes = [...this.state.classes, className]

    localforage.setItem('CLASSES', this.state.classes)
    localforage.setItem(className, descriptors)
  },
  deleteClass: function (className) {
    this.state.classes = immutableRemove(this.state.classes, this.state.classes.indexOf(className))
    this.state.embeddings = immutableRemove(this.state.embeddings, this.state.embeddings.findIndex((el) => el.className === className))

    localforage.setItem('CLASSES', this.state.classes)
    localforage.removeItem(className)
  },
  updateClass: async function (oldClass, newClass) {
    // FIXME: the await here seems inefficient if we can
    // just get the embeddings from this object's state
    this.addClass(newClass, await localforage.getItem(oldClass))
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
