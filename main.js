var mat4 = require('gl-mat4')
var glclear = require('gl-clear')
var glBuffer = require('gl-buffer')
var complex = require('gl-simplicial-complex')
var sphere = require('primitive-sphere')
var shp2json = require('shapefile2geojson')
var Zip = require('zip')

var gecef = require('geodetic-to-ecef')
var wgs84 = require('wgs84')
var xtend = require('xtend')

var dragDrop = require('drag-and-drop-files')
dragDrop(window, function (files) {
  files.forEach(function (file) {
    if (/\.zip$/i.test(file.name)) {
      var reader = new FileReader();
      reader.addEventListener('load', function (ev) {
        var buf = Buffer(new Uint8Array(ev.target.result))
        loadZip(file, buf)
      })
      reader.readAsArrayBuffer(file)
    }
  })
})

function loadZip (file, buf) {
  var z = new Zip.Reader(buf)
  var dbf, shp
  z.forEach(function (entry) {
    if (!entry.isFile()) return
    var name = entry.getName()
    if (/\.dbf$/i.test(name)) {
      dbf = entry
    } else if (/\.shp$/i.test(name)) {
      shp = entry
    }
  })
  if (dbf && shp) {
    var data = shp2json(shp.getData(), dbf.getData())
    addGeoJSON(data)
  }
}

function addGeoJSON (data) {
  loop.state.overlays.push({ type: 'geojson', data: data })
  loop.update(loop.state)
}

var clear = glclear({ color: [0.15, 0.08, 0.10, 1.0] })
var vdom = require('virtual-dom')
var h = require('virtual-hyperscript-hook')(vdom.h)

var gl, complexes = {}, meshCache = {}

var main = require('main-loop')
var loop = main({
  width: window.innerWidth,
  height: window.innerHeight,
  camera: {
    translation: (function () {
      var v = mat4.create()
      return mat4.translate(v, v, [0,0,-3*wgs84.RADIUS/1e3])
    })(),
    rotation: mat4.create()
  },
  meshes: { earth: createEarth() }
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
        ongl(gl, state)
        draw(gl, state)
      }
    })
  ])
}

function createEarth () {
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
  return {
    cells: cells,
    vertexColors: colors,
    vertexNormals: normals,
    positions: pos
  }
}

function ongl (gl, state) {
  complexes = {}
  Object.keys(state.meshes).forEach(function (key) {
    if (meshCache[key] !== state.meshes[key]) {
      complexes[key] = complex(gl, state.meshes[key])
      meshCache[key] = state.meshes[key]
    }
  })
  Object.keys(complexes).forEach(function (key) {
    if (!state.meshes[key]) delete complexes[key]
  })
}

function draw (gl, state) {
  var width = gl.drawingBufferWidth
  var height = gl.drawingBufferHeight
  clear(gl)
  gl.viewport(0, 0, width, height)
  var view = mat4.create()
  mat4.multiply(view, view, state.camera.rotation)
  mat4.multiply(view, view, state.camera.translation)

  Object.keys(complexes).forEach(function (key) {
    complexes[key].draw({
      view: view,
      projection: mat4.perspective(
        mat4.create(), Math.PI/4.0, width/height, 0.1, 1e10)
    })
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
