var ecef = require('./ecef.js')
var colors = [ [1,1,0], [1,0,1], [1,0,0], [0,1,1], [0,1,0], [0,0,1] ]

module.exports = function (data) {
  var mesh = { cells: [], positions: [], vertexColors: [] }
  data.features.forEach(function (feature) {
    if (feature.geometry.type === 'MultiLineString') {
      feature.geometry.coordinates.forEach(function (pts) {
        var len = mesh.positions.length
        for (var i = 1; i < pts.length; i++) {
          mesh.cells.push([ len + i - 1, len + i ])
        }
        for (var i = 0; i < pts.length; i++) {
          mesh.positions.push(ecef(pts[i][1], pts[i][0], 0))
          mesh.vertexColors.push([0,0,0.5])
        }
      })
    } else if (feature.geometry.type === 'Polygon') {
      // fill
      /*
      feature.geometry.coordinates.forEach(function (points) {
        var len = mesh.positions.length
        var pts = points.map(function (pt) {
          return ecef(pt[1], pt[0], 0)
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
          mesh.positions.push(ecef(pts[i][1], pts[i][0], 0))
          mesh.vertexColors.push([1,0,0])
        }
      })
    }
  })
  return mesh
}
