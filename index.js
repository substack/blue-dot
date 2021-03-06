// http://http.developer.nvidia.com/GPUGems2/gpugems2_chapter16.html
// https://www.shadertoy.com/view/lslXDr

var ecef = require('geodetic-to-ecef')
//var sphereMesh = require('sphere-mesh')
var sphereMesh = require('icosphere')

var mat4 = require('gl-mat4')
var fs = require('fs')
var scatter = fs.readFileSync(require.resolve('glsl-atmosphere/index.glsl'),'utf8')
var specular = ''
  + fs.readFileSync(require.resolve('glsl-specular-beckmann/distribution.glsl'),'utf8')
    .replace(/beckmannDistribution/g, 'distribution')
  + fs.readFileSync(require.resolve('glsl-specular-beckmann/index.glsl'),'utf8')

module.exports = function (regl, opts) {
  if (!opts) opts = {}
  var draw = {
    earth: earth(regl, opts),
    scattering: scattering(regl)
  }
  return function () {
    regl.draw(function (context) {
      var t = context.time*0.1, r = 10
      var sunpos = [
        Math.sin(t)*r,
        Math.sin(t*0.2)*0.05*r,
        Math.cos(t)*r
      ]
      draw.earth({ sunpos: sunpos })
      draw.scattering({ sunpos: sunpos })
    })
  }
}

function scattering (regl) {
  var model = [], eyem = []
  var mesh = earthMesh()
  var r = 1.01
  return regl({
    frag: `
      precision mediump float;
      varying vec3 vscatter, vpos;
      uniform vec3 sunpos, eye;
      void main () {
        gl_FragColor = vec4(pow(vscatter*0.7,vec3(1.2)),
          min(0.6,sqrt(length(vscatter)*0.4)));
      }
    `,
    vert: `
      precision mediump float;
      uniform mat4 projection, view, model;
      uniform vec3 eye, sunpos;
      attribute vec3 position;
      varying vec3 vscatter, vpos;
      ${scatter}
      void main () {
        vpos = position;
        vscatter = atmosphere(
          eye-vpos, vpos*6372e3, sunpos, 22.0,
          6371e3, 6471e3,
          2.0*vec3(5.5e-6,13.0e-6,22.4e-6),
          21e-6, 8e3, 1.2e3, 0.758
        );
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

function earth (regl, opts) {
  var model = []
  var mesh = earthMesh(1)
  var textures = opts.textures || {}
  return regl({
    frag: `
      precision mediump float;
      varying vec3 vpos;
      uniform vec3 sunpos, eye;
      uniform sampler2D night, day, clouds;
      ${specular}
      float ggx (vec3 N, vec3 V, vec3 L, float roughness, float F0) {
        float alpha = roughness*roughness;
        vec3 H = normalize(L - V);
        float dotLH = max(0.0, dot(L,H));
        float dotNH = max(0.0, dot(N,H));
        float alphaSqr = alpha * alpha;
        float denom = dotNH * dotNH * (alphaSqr - 1.0) + 1.0;
        float D = alphaSqr / (${Math.PI} * denom * denom);
        float F = F0 + (1.0 - F0) * pow(1.0 - dotLH, 5.0);
        float k = 0.5 * alpha;
        float k2 = k * k;
        return D * F / (dotLH*dotLH*(1.0-k2)+k2);
      }
      void main () {
        vec3 npos = normalize(vpos);
        vec3 neye = normalize(eye);
        vec3 vray = normalize(eye - vpos);
        vec3 vsun = normalize(sunpos);
        vec3 L = normalize(sunpos - vpos);
        float spec = beckmannSpecular(eye,vray,npos,0.4)
          + ggx(npos,vray,neye,0.6,0.5)*0.05;
        float c = clamp(max(
          dot(normalize(sunpos),npos),
          dot(vec3(-0.8,-0.8,-0.7),npos) * 0.002
        ), 0.0, 1.0)*1.5;
        float lon = mod(atan(npos.x,npos.z)*${0.5/Math.PI},1.0);
        float lat = asin(-npos.y*0.79-0.02)*0.5+0.5;
        vec3 d = pow(texture2D(day,vec2(lon,lat)).rgb,vec3(0.8));
        float sd = spec*pow(step(max(d.r,d.g),d.b*0.8),4.0)*max(1.2,c);
        vec3 dayc = pow(d*(pow(c,0.5)+sd),vec3(2.2));
        float dx = 0.0002;
        vec3 m0 = texture2D(night,vec2(lon+dx,lat-dx)).rgb;
        vec3 m1 = texture2D(night,vec2(lon+dx,lat+dx)).rgb;
        vec3 m2 = texture2D(night,vec2(lon-dx,lat-dx)).rgb;
        vec3 m3 = texture2D(night,vec2(lon-dx,lat+dx)).rgb;
        vec3 m = pow((m0+m1+m2+m3)*0.25,vec3(1.5));
        float polar = pow(cos(pow(npos.y,32.0)),32.0);
        vec3 cl = polar*texture2D(clouds,vec2(lon,lat)).rgb
          + (1.0-polar)*vec3(1);
        gl_FragColor = vec4(dayc+pow(1.0-c-length(cl)*0.5,16.0)*m
          +pow(cl*c,vec3(0.8)),1);
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
      sunpos: regl.prop('sunpos'),
      night: textures.night,
      day: textures.day,
      clouds: textures.clouds
    },
    elements: mesh.cells,
    depth: {
      enable: true,
      mask: false
    },
    cull: {
      enable: true,
      face: 'back'
    }
  })
}

var cross = require('gl-vec3/cross')
var dot = require('gl-vec3/dot')
var sub = require('gl-vec3/subtract')

function earthMesh () {
  return sphereMesh(5)
}
