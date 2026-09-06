/* NOAA solar equations. No API, no key, no network. Works offline forever. */
const RAD = Math.PI / 180;

function solar(date, lat, lng) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 864e5);
  const g = (2 * Math.PI / 365) * (doy - 1 + 0.5);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
                 - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
             - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
             - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  return { eqtime, decl };
}

/* zenith: 90.833 = sunrise/sunset (incl. refraction), 96 = civil twilight */
function eventUTC(date, lat, lng, zenith, rising) {
  const { eqtime, decl } = solar(date, lat, lng);
  const cosH = (Math.cos(zenith * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)))
             - Math.tan(lat * RAD) * Math.tan(decl);
  if (cosH > 1)  return null;   // sun never rises that day
  if (cosH < -1) return null;   // sun never sets
  const ha = Math.acos(cosH) / RAD;
  return 720 + (rising ? -4 * (lng + ha) : -4 * (lng - ha)) - eqtime;   // minutes UTC
}

/* returns local clock minutes past midnight, given a tz offset in minutes */
function sunTimes(date, lat, lng, tzOffsetMin) {
  const wrap = m => m === null ? null : ((Math.round(m + tzOffsetMin) % 1440) + 1440) % 1440;
  return {
    firstLight: wrap(eventUTC(date, lat, lng, 96,     true)),
    sunrise:    wrap(eventUTC(date, lat, lng, 90.833, true)),
    sunset:     wrap(eventUTC(date, lat, lng, 90.833, false)),
    lastLight:  wrap(eventUTC(date, lat, lng, 96,     false)),
  };
}
if (typeof module !== "undefined") module.exports = { sunTimes };
