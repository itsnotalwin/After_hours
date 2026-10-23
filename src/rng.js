/* AFTERHOURS — seeded random numbers (mulberry32). Everything in the city is reproducible from a seed. */
(function () {
  'use strict';
  var AH = (window.AH = window.AH || {});

  function hashStr(s) {
    s = String(s);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function RNG(seed) {
    this.seed = typeof seed === 'string' ? hashStr(seed) : seed >>> 0;
    this._f = mulberry32(this.seed);
  }
  RNG.prototype.next = function () { return this._f(); };
  RNG.prototype.range = function (a, b) { return a + (b - a) * this._f(); };
  RNG.prototype.int = function (a, b) { return Math.floor(a + (b - a + 1) * this._f()); };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this._f() * arr.length)]; };
  RNG.prototype.chance = function (p) { return this._f() < p; };
  RNG.prototype.gauss = function () { return (this._f() + this._f() + this._f() + this._f() - 2) / 0.5774; };
  RNG.prototype.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this._f() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  RNG.prototype.fork = function (label) { return new RNG(hashStr(this.seed + ':' + label)); };

  AH.RNG = RNG;
  AH.hashStr = hashStr;
})();
