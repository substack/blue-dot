// http://http.developer.nvidia.com/GPUGems2/gpugems2_chapter16.html
// https://www.shadertoy.com/view/lslXDr

var ecef = require('geodetic-to-ecef')
var chart = require('conway-hart')
var loop = require('loop-subdivide')
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
    regl.draw(function (context) {
      var t = context.time*0.1, sunr = 10
      var sunpos = [
        Math.sin(t)*sunr,
        Math.sin(t*0.2)*0.05*sunr,
        Math.cos(t)*sunr
      ]
      draw.earth({ sunpos: sunpos })
      draw.scattering({ sunpos: sunpos })
    })
  }
}

function scattering (regl) {
  var model = [], eyem = []
  var mesh = earthMesh()
  var r = 1.04, inSteps = 10, outSteps = 10
  var R = 6.378137, RO = R*r

  return regl({
    frag: `
      precision mediump float;
      varying vec3 vscatter, vpos, vray, vsun;
      uniform vec3 sunpos, eye;
      void main () {
        gl_FragColor = vec4(pow(vscatter,vec3(2.2)),length(vscatter));
      }
    `,
    vert: `
      precision mediump float;
      uniform mat4 projection, view, model;
      uniform vec3 eye, sunpos;
      attribute vec3 position;
      varying vec3 vscatter, vpos, vray, vsun;
      ${scatter}
      void main () {
        vpos = position*${r};
        vray = normalize(vpos - eye);
        vec2 e = ray_sphere_intersect(eye,vray,${RO});
        vsun = normalize(sunpos);
        if (e.x > e.y) {
          vscatter = vec3(0,0,0);
        } else {
          vec2 f = ray_sphere_intersect(eye,vray,${R});
          e.y = min(e.y,f.x);
          vscatter = in_scatter(eye,vray,e,vsun);
        }
        gl_Position = projection * view * model * vec4(position,1);
      }
    `,
    attributes: {
      position: mesh.positions
    },
    uniforms: {
      model: function () {
        mat4.identity(model)
        mat4.scale(model, model, [r,r,r])
        return model
      },
      eyem: function (context) {
        mat4.lookAt(eyem, context.center, context.eye, context.up)
        mat4.invert(eyem, eyem)
        return eyem
      },
      sunpos: regl.prop('sunpos'),
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
      mask: false,
      enable: true
    },
    cull: {
      enable: true
    }
  })
}

function earth (regl) {
  var model = []
  var mesh = earthMesh(1)
  return regl({
    frag: `
      precision mediump float;
      varying vec3 vpos;
      uniform vec3 sunpos;
      void main () {
        vec3 npos = normalize(vpos);
        float c = clamp(max(
          dot(normalize(sunpos),npos),
          dot(vec3(-0.8,-0.8,-0.7),npos) * 0.05
        ), 0.0, 1.0);
        gl_FragColor = vec4(pow(vec3(0.3,0.7,1)*pow(c,0.5),vec3(2.2)),1);
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
      },
      sunpos: regl.prop('sunpos')
    },
    elements: mesh.cells
  })
}

var cross = require('gl-vec3/cross')
var dot = require('gl-vec3/dot')
var sub = require('gl-vec3/subtract')

function earthMesh () {
  var mesh = sphereMesh(50, 1)
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
  var n = [], a = [], b = []
  for (var i = 0; i < mesh.cells.length; i++) {
    var c = mesh.cells[i]
    cross(n,
      sub(a,pts[c[1]],pts[c[2]]),
      sub(b,pts[c[0]],pts[c[2]])
    )
    if (dot(n, pts[c[0]]) < 0) {
      var x = c[0]
      c[0] = c[1]
      c[1] = x
    }
  }
  return mesh
}
