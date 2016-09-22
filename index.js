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
    regl.draw(function (context) {
      var t = context.time, sunr = 10
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
  var R = 6.378137, RO = R*1.1;
  var r = 1.3
  return regl({
    frag: `
      precision mediump float;
      varying vec3 vpos;
      varying float vdist;
      uniform vec2 size;
      uniform float distance, time;
      uniform mat4 eyem;
      uniform vec3 eye, sunpos;
      ${scatter}
      void main () {
        vec3 v = scatter(
          gl_FragCoord.xy + (exp(distance)/vdist-1.0)*size*0.5,
          size/vdist*exp(distance),
          sunpos,
          eyem
        );
        v.x = pow(v.x,3.0);
        v.y = pow(v.y,3.0);
        v.z = pow(v.z,3.0);
        gl_FragColor = vec4(v,length(v));
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
        vdist = length(eye - vpos*0.25*${r});
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
      uniform vec3 sunpos;
      void main () {
        vec3 npos = normalize(vpos);
        float c = clamp(max(
          dot(normalize(sunpos),npos) * 1.2,
          dot(vec3(-0.8,-0.8,-0.7),npos) * 0.05
        ), 0.0, 1.0);
        gl_FragColor = vec4(vec3(0,0.5,1)*pow(c,1.2),1);
        //float c = sin(vpos.x) + sin(vpos.y) + sin(vpos.z);
        //gl_FragColor = vec4(c,c,c,1);
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
