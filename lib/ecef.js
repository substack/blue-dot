var ecef = require('geodetic-to-ecef')
module.exports = function (lat, lon, elev) {
  var xyz = ecef(lat, lon, elev)
  xyz[0] /= 1e3
  xyz[1] /= 1e3
  xyz[2] /= 1e3
  return xyz
}
