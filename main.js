var mat4 = require('gl-mat4')
var glclear = require('gl-clear')
var complex = require('gl-simplicial-complex')
var sphere = require('primitive-sphere')

var wgs84 = require('wgs84')
var xtend = require('xtend')

var clear = glclear({ color: [0.15, 0.08, 0.10, 1.0] })
var gl, earth

var vdom = require('virtual-dom')
var h = require('virtual-hyperscript-hook')(vdom.h)
var main = require('main-loop')
var loop = main({
  width: window.innerWidth,
  height: window.innerHeight,
  view: (function () {
    var v = mat4.create()
    return mat4.translate(v, v, [0,0,-3*wgs84.RADIUS/1e3])
  })()
}, render, vdom)
document.querySelector('#content').appendChild(loop.target)

window.addEventListener('resize', function () {
  loop.update(xtend(loop.state, {
    width: window.innerWidth,
    height: window.innerHeight
  }))
})

function render (state) {
  if (gl) draw(gl, state)
  return h('div', [
    h('div.overlay', [
      h('h1', 'hey')
    ]),
    h('canvas.gl', {
      width: state.width,
      height: state.height,
      hook: function (canvas) {
        gl = canvas.getContext('webgl')
        earth = complex(gl, sphere(wgs84.RADIUS/1e3))
        draw(gl, state)
      }
    })
  ])
}

function draw (gl, state) {
  var width = gl.drawingBufferWidth
  var height = gl.drawingBufferHeight
  clear(gl)
  gl.viewport(0, 0, width, height)
  earth.draw({
    view: state.view,
    projection: mat4.perspective(
      mat4.create(), Math.PI/4.0, width/height, 0.1, 1e10)
  })
}
