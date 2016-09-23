var regl = require('regl')()
var camera = require('regl-camera')(regl, {
  center: [0,0,0],
  distance: 20
})
var Earth = require('./')
var resl = require('resl')

resl({
  manifest: {
    night: {
      type: 'image',
      src: 'data/night.jpg'
    },
    day: {
      type: 'image',
      src: 'data/day.jpg'
    }
  },
  onDone: done
})

function done (assets) {
  var earth = Earth(regl, {
    textures: {
      night: regl.texture({ data: assets.night }),
      day: regl.texture({ data: assets.day })
    }
  })
  regl.frame(function () {
    regl.clear({ color: [0,0,0,1], depth: true })
    camera(function () {
      earth()
    })
  })
}
