/*
  Vue app for controlling state of certain parts of the app.

  TODO: most of the app will eventually be refactored in Vue.
*/
let app = new Vue({
  el: '#app',
  data: {
    tab: 'info'
  },
  methods: {
    switchTab: function (tabName) {
      this.tab = tabName
    }
  }
})
