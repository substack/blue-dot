var xtend = require('xtend')
var glclear = require('gl-clear')
var clear = glclear({ color: [0.15, 0.08, 0.10, 1.0] })

var vdom = require('virtual-dom')
var h = require('virtual-hyperscript-hook')(vdom.h)
var main = require('main-loop')
var loop = main({
  width: window.innerWidth,
  height: window.innerHeight
}, render, vdom)
document.querySelector('#content').appendChild(loop.target)

window.addEventListener('resize', function () {
  loop.update(xtend(loop.state, {
    width: window.innerWidth,
    height: window.innerHeight
  }))
})

function render (state) {
  return h('div', [
    h('div.overlay', [
      h('h1', 'hey')
    ]),
    h('canvas.gl', {
      width: state.width,
      height: state.height,
      hook: function (canvas) {
        draw(canvas.getContext('webgl'))
      }
    })
  ])
}

function draw (gl) {
  var width = gl.drawingBufferWidth
  var height = gl.drawingBufferHeight
  clear(gl)
  gl.viewport(0, 0, width, height)
}
