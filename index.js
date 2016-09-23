// http://http.developer.nvidia.com/GPUGems2/gpugems2_chapter16.html
// https://www.shadertoy.com/view/lslXDr

var ecef = require('geodetic-to-ecef')
//var sphereMesh = require('sphere-mesh')
var sphereMesh = require('icosphere')

var mat4 = require('gl-mat4')
var fs = require('fs')
var scatter = fs.readFileSync(__dirname+'/scatter.glsl','utf8')
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
  var r = 1.01, inSteps = 10, outSteps = 10
  var R = 6.378137, RO = R*r

  return regl({
    frag: `
      precision mediump float;
      varying vec3 vscatter, vpos, vray, vsun;
      uniform vec3 sunpos, eye;
      void main () {
        gl_FragColor = vec4(pow(vscatter,vec3(2.2)),sqrt(length(vscatter)*0.4));
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
        vpos = position*${r.toPrecision(8)};
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
          + ggx(npos,vray,neye,0.6,0.5)*0.1;
        float c = clamp(max(
          dot(normalize(sunpos),npos),
          dot(vec3(-0.8,-0.8,-0.7),npos) * 0.002
        ), 0.0, 1.0)*2.2;
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
        vec3 cl = texture2D(clouds,vec2(lon,lat)).rgb
          *pow(cos(pow(npos.y,32.0)),32.0);
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
  var mesh = sphereMesh(5)
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
  /*
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
  */
  return mesh
}
