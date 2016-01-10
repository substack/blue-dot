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
var triangulate = require('delaunay-triangulate')

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

var colors = [ [1,1,0], [1,0,1], [1,0,0], [0,1,1], [0,1,0], [0,0,1] ]
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
          mesh.positions.push(xecef(pts[i][1], pts[i][0], 0))
          mesh.vertexColors.push([0,0,0.5])
        }
      })
    } else if (feature.geometry.type === 'Polygon') {
      // fill
      /*
      feature.geometry.coordinates.forEach(function (points) {
        var len = mesh.positions.length
        var pts = points.map(function (pt) {
          return xecef(pt[1], pt[0], 0)
        })
        mesh.positions.push.apply(mesh.positions, pts)
        for (var i = 0; i < pts.length; i++) {
          mesh.vertexColors.push(colors[i%colors.length])
        }
        var triangles = triangulate(points)
        for (var i = 0; i < triangles.length; i++) {
          var t = triangles[i]
          mesh.cells.push([t[0]+len,t[1]+len,t[2]+len])
        }
      })
      */
      // outline
      feature.geometry.coordinates.forEach(function (pts) {
        var len = mesh.positions.length
        for (var i = 1; i < pts.length; i++) {
          mesh.cells.push([ len + i - 1, len + i ])
        }
        for (var i = 0; i < pts.length; i++) {
          mesh.positions.push(xecef(pts[i][1], pts[i][0], 0))
          mesh.vertexColors.push([1,0,0])
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
  camera: [25,-120, wgs84.RADIUS*2],
  meshes: { earth: createEarth() }
}, render, vdom)
document.querySelector('#content').appendChild(loop.target)

window.addEventListener('resize', function () {
  loop.update(xtend(loop.state, {
    width: window.innerWidth,
    height: window.innerHeight
  }))
})

window.addEventListener('keydown', function (ev) {
  var c = loop.state.camera
  if (ev.keyCode === 37) { // left
    loop.update(xtend(loop.state, { camera: [c[0],c[1]-1,c[2]] }))
  } else if (ev.keyCode === 39) { // right
    loop.update(xtend(loop.state, { camera: [c[0],c[1]+1,c[2]] }))
  } else if (ev.keyCode === 38) { // up
    loop.update(xtend(loop.state, { camera: [c[0]+1,c[1],c[2]] }))
  } else if (ev.keyCode === 40) { // down
    loop.update(xtend(loop.state, { camera: [c[0]-1,c[1],c[2]] }))
  } else if (ev.keyCode === 187) { // -
    loop.update(xtend(loop.state, {
      camera: [c[0],c[1],Math.max(1e3,c[2]/1.1)]
    }))
  } else if (ev.keyCode === 189) { // +
    loop.update(xtend(loop.state, {
      camera: [c[0],c[1],Math.min(wgs84.RADIUS*4,c[2]*1.1)]
    }))
  }
  console.log(ev.keyCode)
})

window.addEventListener('wheel', function (ev) {
  var c = loop.state.camera
  var z = Math.max(1e3,Math.min(
    wgs84.RADIUS*4, c[2]*(1+ev.deltaY/1000)))
  loop.update(xtend(loop.state, { camera: [c[0],c[1],z] }))
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
    var lat0 = Math.sin(theta0) * 180
    var lat1 = Math.sin(theta1) * 180
    var pt0 = xecef(lat0, 0, 0)
    pt0[1] -= 1e3
    var pt1 = xecef(lat1, 0, 0)
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
  camera.position = xecef(
    state.camera[0],
    state.camera[1],
    state.camera[2]
  )
  camera.up = [0,0,1]
  camera.target = [0,0,0]

  var xcamera = lookat()
  xcamera.position = xecef(0, -90, state.camera[2])
  xcamera.up = [0,0,1]
  xcamera.target = [0,0,0]

  var view = camera.view(mat4.create())
  var proj = mat4.perspective(
    mat4.create(), Math.PI/4.0, width/height, 0.1, 1e10
  )
  Object.keys(complexes).forEach(function (key) {
    complexes[key].draw({
      view: key === 'earth' ? xcamera.view(mat4.create()) : view,
      projection: proj
    })
  })
}

function xecef (lat, lon, elev) {
  var xyz = ecef(lat, lon, elev)
  xyz[0] /= 1e3
  xyz[1] /= 1e3
  xyz[2] /= 1e3
  return xyz
}
