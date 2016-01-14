var EventEmitter = require('events').EventEmitter
var RADIUS = require('wgs84').RADIUS
var xtend = require('xtend')
var loadZip = require('./zipfile.js')
var createGeoMesh = require('./geomesh.js')

module.exports = function (loop, store) {
  var bus = new EventEmitter
  bus.on('mode', function (mode) {
    loop.update(xtend(loop.state, { mode: mode }))
  })
  bus.on('area-point', function () {
    //...
  })
  bus.on('hit', function (hit) {
    loop.update(xtend(loop.state, { hit: hit }))
  })
  bus.on('resize', function () {
    loop.update(xtend(loop.state, {
      width: window.innerWidth,
      height: window.innerHeight
    }))
  })
  bus.on('keydown', function (code) {
    var c = loop.state.camera
    if (code === 37) { // left
      loop.update(xtend(loop.state, { camera: [c[0],c[1]-1,c[2]] }))
    } else if (code === 39) { // right
      loop.update(xtend(loop.state, { camera: [c[0],c[1]+1,c[2]] }))
    } else if (code === 38) { // up
      loop.update(xtend(loop.state, { camera: [c[0]+1,c[1],c[2]] }))
    } else if (code === 40) { // down
      loop.update(xtend(loop.state, { camera: [c[0]-1,c[1],c[2]] }))
    } else if (code === 187) { // -
      loop.update(xtend(loop.state, {
        camera: [c[0],c[1],Math.max(1e3,c[2]/1.1)]
      }))
    } else if (code === 189) { // +
      loop.update(xtend(loop.state, {
        camera: [c[0],c[1],Math.min(RADIUS*2,c[2]*1.1)]
      }))
    }
  })
  bus.on('wheel', function (deltaY) {
    var c = loop.state.camera
    var z = Math.max(1e3,Math.min(
      RADIUS*2, c[2]*(1+deltaY/1000)))
    loop.update(xtend(loop.state, { camera: [c[0],c[1],z] }))
  })
  bus.on('drag', function (x, y) {
    var c = loop.state.camera
    var m = Math.min(loop.state.height, loop.state.width)
    var dx = y * c[2] / RADIUS / m * 50
    var dy = -x * c[2] / RADIUS / m * 50
    loop.update(xtend(loop.state, {
      camera: [c[0]+dx,c[1]+dy,c[2]]
    }))
  })
  bus.on('error', function (err) {
    console.error(err.message)
  })
  bus.on('drop-file', function (file) {
    if (/\.zip$/i.test(file.name)) { 
      var reader = new FileReader();
      reader.addEventListener('load', function (ev) { 
        var buf = Buffer(new Uint8Array(ev.target.result))
        loop.state.layers[file.name] = {
          filename: file.name,
          title: file.name,
          type: 'pending',
          status: 'saving',
          size: buf.length
        }
        loop.update(loop.state)

        store.createWriteStream(function (err, w) {
          if (err) return bus.emit('error', err)
          loop.state.layers[file.name].status = 'saved'
        }).end(buf)

        loadZip(file, buf, function (err, type, data) {
          if (type === 'geojson') {
            var mesh = createGeoMesh(data)
            loop.state.meshes[file.name] = mesh
            loop.state.layers[file.name].type = 'geojson'
            loop.update(loop.state)
          } else {
            loop.state.layers[file.name].type = 'unknown'
          }
        })
      })
      reader.readAsArrayBuffer(file)
    }
  })
  return bus
}
