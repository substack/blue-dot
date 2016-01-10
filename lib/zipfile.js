var shp2json = require('shapefile2geojson')
var Zip = require('zip')

module.exports = function (file, buf, cb) {
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
    cb(null, 'geojson', data)
  }
}
