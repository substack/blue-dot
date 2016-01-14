var h = require('virtual-dom/h')

module.exports = function (state) {
  return [
    h('h1', 'layers'),
    h('div.layers', Object.keys(state.layers).map(function (key) {
      var layer = state.layers[key]
      return h('div.layer', [
        h('div', layer.title),
        h('div', layer.size + ' bytes')
      ])
    }))
  ]
}
