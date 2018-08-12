/*
  Vue app for controlling state of certain parts of the app.

  TODO: most of the app will eventually be refactored in Vue.
*/
let app = new Vue({
  el: '#app',
  data: {
    tab: 'info',
    // We don't actually use this state for manipulation
    // just so we can use it for rendering UI
    db: myDB
  },
  methods: {
    switchTab: function (tabName) {
      this.tab = tabName
    }
  }
})

Vue.component('face-class', {
  props: ['cls'],
  data: function () {
    return {
      isEditing: false,
      faceName: this.cls
    }
  },
  // This is buggy since every change of state triggers
  // updated: function () {
  //   if (this.isEditing) {
  //     this.$refs.inputRef.select()
  //   }
  // },
  methods: {
    toggleEdit: function () {
      this.isEditing = !this.isEditing
    },
    deleteClass: function () {
      myDB.deleteClass(this.faceName)
    },
    updateClass: function () {
      myDB.updateClass(this.cls, this.faceName)
    }
  },
  template: `
    <tr>
      <td>
        <input
          v-if="isEditing"
          ref="inputRef"
          v-model="faceName"
          type="text" />
        <span v-else>{{faceName}}</span>
      </td>
      <td v-if="isEditing">
        <button @click="updateClass">Save</button>
      </td>
      <td>
        <button @click="toggleEdit">
          <span v-if="isEditing">Cancel</span>
          <span v-else>Edit</span>
        </button>
      </td>
      <td><button @click="deleteClass">Delete</button></td>
    </tr>`
})
