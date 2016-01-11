var mat4 = require('gl-mat4')
var vec3 = require('gl-vec3')

var glclear = require('gl-clear')
var glBuffer = require('gl-buffer')
var complex = require('gl-simplicial-complex')
var sphereIntersect = require('ray-sphere-intersection')

var lookat = require('lookat-camera')
var triangulate = require('delaunay-triangulate')
var ecef = require('./lib/ecef.js')
var RADIUS = require('wgs84').RADIUS

var clear = glclear({ color: [0.15, 0.08, 0.10, 1.0] })
var vdom = require('virtual-dom')
var h = require('virtual-hyperscript-hook')(vdom.h)

var gl, canvas, complexes = {}, meshCache = {}

var main = require('main-loop')
var loop = main({
  width: window.innerWidth,
  height: window.innerHeight,
  camera: [25,-120, RADIUS*2],
  meshes: { earth: createEarth() },
  mode: 'view'
}, render, vdom)
document.querySelector('#content').appendChild(loop.target)

var bus = require('./lib/actions.js')(loop)
window.addEventListener('resize', function (ev) {
  bus.emit('resize', {
    width: window.innerWidth,
    height: window.innerHeight
  })
})
window.addEventListener('keydown', function (ev) {
  bus.emit('keydown', ev.keyCode)
})
window.addEventListener('wheel', function (ev) {
  bus.emit('wheel', ev.deltaY)
})
window.addEventListener('mousemove', function (ev) {
  if (ev.target.tagName.toUpperCase() !== 'CANVAS') return
  if (ev.buttons & 1 === 1) bus.emit('drag', ev.movementX, ev.movementY)
  var theta = (2*ev.screenX/loop.state.width-1) * Math.PI/8
  var rho = (1-2*ev.screenY/loop.state.width) * Math.PI/8

  var c = loop.state.camera
  var camera = lookat()
  camera.position = ecef(c[0], c[1], c[2])
  camera.up = [0,0,1]
  camera.target = [0,0,0]
  var view = camera.view(mat4.create())
  //mat4.rotateY(view, view, theta)
  //mat4.rotateX(view, view, rho)

  var ray = [0,0,0]
  vec3.transformMat4(ray, ray, view)
  vec3.normalize(ray, ray)
console.log('RAY=', ray)
console.log(camera.position)

  var hit = sphereIntersect([], camera.position, ray, [0,0,0], RADIUS/1e3)
  if (hit) {
    console.log('HIT=', hit)
  }
})
window.addEventListener('mousedown', function (ev) {
  if (ev.buttons & 1 === 1) {
    if (loop.state.mode === 'area') bus.emit('area-point')
  }
})

var dragDrop = require('drag-and-drop-files')
dragDrop(window, function (files) {
  files.forEach(function (file) { bus.emit('drop-file', file) })
})

function render (state) {
  if (gl) draw(gl, state)
  return h('div', [
    h('div.overlay', [
      h('div.toolbar', ['point','line','area'].map(function (mode) {
        var c = state.mode === mode ? '.selected' : ''
        return h('button' + c, { onclick: onclick }, mode)
        function onclick (ev) {
          ev.stopPropagation()
          if (loop.state.mode === mode) bus.emit('mode', 'view')
          else bus.emit('mode', mode)
        }
      }))
    ]),
    h('canvas.gl', {
      width: state.width,
      height: state.height,
      hook: function (canvasElem) {
        if (canvas !== canvasElem) {
          canvas = canvasElem
          gl = canvas.getContext('webgl')
          draw(gl, state)
        } else draw(gl, state)
      }
    })
  ])
}

function createEarth () {
  var pos = [], cells = [], colors = [], normals = []
  pos.push([0,0,0])
  colors.push([0,1,1])
  normals.push([0,-1,0])
  for (var i = 0; i < 128; i++) {
    var theta0 = i/128 * 2 * Math.PI
    var theta1 = (i-1)/128 * 2 * Math.PI
    var lat0 = Math.sin(theta0) * 180
    var lat1 = Math.sin(theta1) * 180
    var pt0 = ecef(lat0, 0, 0)
    pt0[1] -= 1e3
    var pt1 = ecef(lat1, 0, 0)
    pt1[1] -= 1e3
    pos.push(pt0, pt1)
    colors.push([0,0.5,1])
    colors.push([0,0.5,1])
    cells.push([0,i*2+1,i*2+2])
    normals.push([0,-1,0])
    normals.push([0,-1,0])
  }
  return {
    cells: cells,
    vertexColors: colors,
    vertexNormals: normals,
    positions: pos
  }
}

function draw (gl, state) {
  Object.keys(state.meshes).forEach(function (key) {
    if (meshCache[key] !== state.meshes[key]) {
      complexes[key] = complex(gl, state.meshes[key])
      meshCache[key] = state.meshes[key]
    }
  })
  Object.keys(complexes).forEach(function (key) {
    if (!state.meshes[key]) delete complexes[key]
  })

  var width = gl.drawingBufferWidth
  var height = gl.drawingBufferHeight
  clear(gl)
  gl.viewport(0, 0, width, height)
  gl.enable(gl.DEPTH_TEST)
  var camera = lookat()
  camera.position = ecef(
    state.camera[0],
    state.camera[1],
    state.camera[2]
  )
  camera.up = [0,0,1]
  camera.target = [0,0,0]

  var xcamera = lookat()
  xcamera.position = ecef(0, -90, state.camera[2])
  xcamera.up = [0,0,1]
  xcamera.target = [0,0,0]

  var view = camera.view(mat4.create())
  var proj = mat4.perspective(
    mat4.create(), Math.PI/4, width/height, 0.1, 1e10
  )
  Object.keys(complexes).forEach(function (key) {
    complexes[key].draw({
      view: key === 'earth' ? xcamera.view(mat4.create()) : view,
      projection: proj
    })
  })
}
