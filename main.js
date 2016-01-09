var mat4 = require('gl-mat4')
var glclear = require('gl-clear')
var glBuffer = require('gl-buffer')
var complex = require('gl-simplicial-complex')
var sphere = require('primitive-sphere')

var gecef = require('geodetic-to-ecef')
var wgs84 = require('wgs84')
var xtend = require('xtend')

var clear = glclear({ color: [0.15, 0.08, 0.10, 1.0] })
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
        ongl(gl)
        draw(gl, state)
      }
    })
  ])
}

var gl, earth
function ongl (gl) {
  var pos = [], cells = [], colors = [], normals = []
  pos.push([0,0,0])
  colors.push([0,1,1])
  normals.push([0,0,-1])
  for (var i = 0; i < 128; i++) {
    var lat0 = Math.sin(i/128*2*Math.PI) * 180
    var lon0 = 90
    var lat1 = Math.sin((i-1)/128*2*Math.PI) * 180
    var lon1 = 90
    pos.push(ecef(lat0, lon0))
    pos.push(ecef(lat1, lon1))
    colors.push([0,0.5,1])
    colors.push([0,0.5,1])
    cells.push([0,i*2+1,i*2+2])
    normals.push([0,0,-1])
    normals.push([0,0,-1])
  }
  var edges = []
  cells.forEach(function (cell) {
    edges.push([cell[0],cell[1]])
    edges.push([cell[1],cell[2]])
    edges.push([cell[2],cell[0]])
  }),
  earth = complex(gl, {
    cells: cells,
    vertexColors: colors,
    vertexNormals: normals,
    positions: pos
  })
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

function ecef (lat, lon, elev) {
  var xyz = gecef(lat, lon, elev)
  var x = xyz[0] / 1e3
  var y = xyz[1] / 1e3
  xyz[0] = y
  xyz[1] = xyz[2] / 1e3
  xyz[2] = x
  return xyz
}
