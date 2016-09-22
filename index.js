var ecef = require('geodetic-to-ecef')
var sphereMesh = require('sphere-mesh')
var mat4 = require('gl-mat4')
var fs = require('fs')
var scatter = fs.readFileSync(__dirname+'/scatter.glsl','utf8')

module.exports = function (regl, opts) {
  var draw = {
    earth: earth(regl),
    scattering: scattering(regl)
  }
  return function () {
    draw.earth()
    draw.scattering()
  }
}

function scattering (regl) {
  var model = []
  var mesh = earthMesh()
  var R = 6.378137, RO = R*1.1;
  return regl({
    frag: `
      precision mediump float;
      varying vec3 vpos;
      varying float vdist;
      uniform vec2 size;
      uniform float time, distance;
      ${scatter}
      void main () {
        gl_FragColor = vec4(
          scatter(
            gl_FragCoord.xy + (exp(distance)/vdist-1.0)*size*0.5,
            size/vdist*exp(distance),
            time
          ),
          0.5
        );
      }
    `,
    vert: `
      precision mediump float;
      uniform mat4 projection, view, model;
      uniform vec3 eye;
      attribute vec3 position;
      varying vec3 vpos;
      varying float vdist;
      void main () {
        vpos = position;
        vdist = length(eye);
        gl_Position = projection * view * model * vec4(position,1);
      }
    `,
    attributes: {
      position: mesh.positions
    },
    uniforms: {
      model: function () {
        mat4.identity(model)
        var r = 1.3
        mat4.scale(model, model, [r,r,r])
        return model
      },
      size: function (props) {
        return [props.viewportWidth,props.viewportHeight]
      },
      time: regl.context('time')
    },
    elements: mesh.cells,
    blend: {
      enable: true,
      func: {
        src: 'src alpha',
        dst: 'one minus src alpha'
      }
    },
    depth: {
      mask: false
    }
  })
}

function earth (regl) {
  var model = []
  var mesh = earthMesh()
  return regl({
    frag: `
      precision mediump float;
      varying vec3 vpos;
      void main () {
        float c = clamp(max(
          dot(vec3(0.4,0.5,0.2),vpos) * 0.5,
          dot(vec3(-0.8,-0.8,-0.7),vpos) * 0.05
        ), 0.0, 1.0);
        gl_FragColor = vec4(vec3(0,0.5,1)*pow(c,1.2),1);
      }
    `,
    vert: `
      precision mediump float;
      uniform mat4 projection, view, model;
      attribute vec3 position;
      varying vec3 vpos;
      void main () {
        vpos = position;
        gl_Position = projection * view * model * vec4(position,1);
      }
    `,
    attributes: {
      position: mesh.positions
    },
    uniforms: {
      model: function () {
        mat4.identity(model)
        return model
      }
    },
    elements: mesh.cells
  })
}

function earthMesh () {
  var mesh = sphereMesh(20, 1)
  var pts = mesh.positions
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i]
    var lon = Math.atan2(p[0], p[2]) * 180 / Math.PI
    var lat = Math.asin(p[1]) * 180 / Math.PI
    pts[i] = ecef(lat, lon)
    pts[i][0] = pts[i][0]/1e6
    pts[i][1] = pts[i][1]/1e6
    pts[i][2] = pts[i][2]/1e6
  }
  return mesh
}
