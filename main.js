var mat4 = require('gl-mat4')
var glclear = require('gl-clear')
var glBuffer = require('gl-buffer')
var complex = require('gl-simplicial-complex')
var sphere = require('primitive-sphere')
var shp2json = require('shapefile2geojson')
var Zip = require('zip')

var ecef = require('geodetic-to-ecef')
var wgs84 = require('wgs84')
var xtend = require('xtend')
var lookat = require('lookat-camera')

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
    addGeoJSON(file.name, data)
  }
}

function addGeoJSON (name, data) {
  var mesh = { cells: [], positions: [], vertexColors: [] }
  data.features.forEach(function (feature) {
    if (feature.geometry.type === 'MultiLineString') {
      feature.geometry.coordinates.forEach(function (pts) {
        var len = mesh.positions.length
        for (var i = 1; i < pts.length; i++) {
          mesh.cells.push([ len + i - 1, len + i ])
        }
        for (var i = 0; i < pts.length; i++) {
          mesh.positions.push(xecef(pts[i][0], pts[i][1], 0))
          mesh.vertexColors.push([0,1,0])
        }
      })
    } else if (feature.geometry.type === 'Polygon') {
      feature.geometry.coordinates.forEach(function (pts) {
        var len = mesh.positions.length
        for (var i = 1; i < pts.length; i++) {
          mesh.cells.push([ len + i - 1, len + i ])
        }
        for (var i = 0; i < pts.length; i++) {
          var loop = []
        }
        for (var i = 0; i < pts.length; i++) {
          mesh.positions.push(xecef(pts[i][0], pts[i][1], 0))
          mesh.vertexColors.push([0,1,0])
        }
      })
    }
  })
  var meshes = {}
  meshes[name] = mesh
  loop.update(xtend(loop.state, {
    meshes: xtend(loop.state.meshes, meshes)
  }))
}

var clear = glclear({ color: [0.15, 0.08, 0.10, 1.0] })
var vdom = require('virtual-dom')
var h = require('virtual-hyperscript-hook')(vdom.h)

var gl, canvas, complexes = {}, meshCache = {}

var main = require('main-loop')
var loop = main({
  width: window.innerWidth,
  height: window.innerHeight,
  camera: [45,-120],
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
    var lat0 = Math.cos(theta0) * 180
    var lon0 = 0
    var lat1 = Math.cos(theta1) * 180
    var lon1 = 0
    pos.push(xecef(lat0, lon0, 0))
    pos.push(xecef(lat1, lon1, 0))
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
  var camera = lookat()
  camera.position = xecef(state.camera[0], state.camera[1], wgs84.RADIUS*3)
  camera.target = [0,0,0]

  var drawopts = {
    view: camera.view(mat4.create()),
    projection: mat4.perspective(
      mat4.create(), Math.PI/4.0, width/height, 0.1, 1e10)
  }
  Object.keys(complexes).forEach(function (key) {
    complexes[key].draw(drawopts)
  })
}

function xecef (lat, lon, elev) {
  var xyz = ecef(lat, lon, elev)
  xyz[0] /= 1e3
  xyz[1] /= 1e3
  xyz[2] /= 1e3
  return xyz
}
