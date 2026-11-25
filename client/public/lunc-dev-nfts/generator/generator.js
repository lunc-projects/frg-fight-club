/*
 * LUNC Dev NFTs — Collection Generator core (Phase 1).
 *
 * Pure combination logic, shared by:
 *   - the browser page (generator/index.html) — compositing happens on
 *     canvas there and is handed in through the `render` callback, and
 *   - Node proof scripts (proof/) — compositing happens on raw RGBA
 *     buffers there, through the same callback.
 *
 * Layer model (plain data, no DOM / no image data in here):
 *   layers = [
 *     { name: "Background", allowNone: false, noneWeight: 1,
 *       traits: [ { name: "Crimson", weight: 1 }, ... ] },
 *     ...
 *   ]
 * A layer with allowNone gets one extra virtual trait named "None"
 * (weight = noneWeight) whose pick means "this layer is skipped".
 *
 * Generated set item shape (the handoff interface — see README in
 * PROOF.md): 
 *   { index, tokenId, name, traits, attributes, imageDataUrl }
 *   traits:     { "<layer name>": "<trait name>", ... }  (None picks omitted)
 *   attributes: [ { trait_type: "<layer name>", value: "<trait name>" } ]
 *               — exactly the shape cw721 mint extensions / the
 *                 launchpad's ldnftTokenMeta record expect.
 *
 * Generation is seeded and reproducible: same layers + same seed =>
 * same set. Uniqueness is guaranteed per combination (weighted random
 * sampling, combinations never repeat).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.LDNFTGenerator = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MAX_COUNT = 100; /* phase-1 cap */
  var NONE_NAME = "None";

  /* ---------- seeded RNG (mulberry32) ---------- */
  function mulberry32(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* FNV-1a string -> uint32 seed */
  function hashSeed(str) {
    var h = 0x811c9dc5;
    var s = String(str == null ? "" : str);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  function rngFrom(seed) {
    if (typeof seed === "function") return seed;
    if (typeof seed === "number" && isFinite(seed)) return mulberry32(seed);
    return mulberry32(hashSeed(seed));
  }

  /* ---------- layer helpers ---------- */
  function cleanWeight(w) {
    var n = Number(w);
    return isFinite(n) && n > 0 ? n : 1;
  }
  /* The traits a layer can actually pick from, incl. the virtual
     None trait when the layer allows skipping. Each entry:
     { name, weight, none:boolean, index } — index is the position in
     layer.traits, or -1 for the None trait. */
  function effectiveTraits(layer) {
    var out = [];
    var traits = (layer && layer.traits) || [];
    for (var i = 0; i < traits.length; i++) {
      out.push({ name: String(traits[i].name || ("Trait " + (i + 1))), weight: cleanWeight(traits[i].weight), none: false, index: i });
    }
    if (layer && layer.allowNone) {
      out.push({ name: NONE_NAME, weight: cleanWeight(layer.noneWeight), none: true, index: -1 });
    }
    return out;
  }
  function totalCombos(layers) {
    var total = 1;
    (layers || []).forEach(function (layer) {
      total *= Math.max(0, effectiveTraits(layer).length);
    });
    return total;
  }

  /* ---------- weighted unique combination generation ---------- */
  function pickWeightedIndex(effTraits, rng) {
    var sum = 0;
    for (var i = 0; i < effTraits.length; i++) sum += effTraits[i].weight;
    var r = rng() * sum;
    for (var j = 0; j < effTraits.length; j++) {
      r -= effTraits[j].weight;
      if (r < 0) return j;
    }
    return effTraits.length - 1;
  }

  function validateLayers(layers) {
    if (!Array.isArray(layers) || !layers.length) throw new Error("no layers");
    layers.forEach(function (layer, li) {
      if (!layer || !String(layer.name || "").trim()) throw new Error("layer " + (li + 1) + " has no name");
      if (!Array.isArray(layer.traits) || !layer.traits.length) {
        if (!layer.allowNone) throw new Error("layer '" + layer.name + "' has no traits");
      }
    });
  }

  /* Returns `count` unique combinations:
     [ { key, picks: [ { layer, layerIndex, trait, traitIndex, none } ] } ]
     Sampling is weighted per layer; a combination (the tuple of picks
     across all layers) is never repeated — duplicates are re-rolled. */
  function generateCombos(layers, count, seed) {
    validateLayers(layers);
    count = Math.floor(Number(count));
    if (!isFinite(count) || count < 1) throw new Error("count must be at least 1");
    if (count > MAX_COUNT) throw new Error("count exceeds the phase-1 cap of " + MAX_COUNT);
    var total = totalCombos(layers);
    if (count > total) {
      var err = new Error("only " + total + " unique combinations exist for these layers");
      err.code = "NOT_ENOUGH_COMBOS";
      err.total = total;
      throw err;
    }
    var rng = rngFrom(seed);
    var eff = layers.map(effectiveTraits);
    var seen = {};
    var out = [];
    var attempts = 0;
    var maxAttempts = Math.max(1000, count * 200);
    while (out.length < count) {
      if (++attempts > maxAttempts) throw new Error("could not find enough unique combinations");
      var picks = [];
      var keyParts = [];
      for (var li = 0; li < layers.length; li++) {
        var pi = pickWeightedIndex(eff[li], rng);
        var t = eff[li][pi];
        picks.push({ layer: layers[li].name, layerIndex: li, trait: t.name, traitIndex: t.index, none: !!t.none });
        keyParts.push(li + ":" + t.index);
      }
      var key = keyParts.join("|");
      if (seen[key]) continue;
      seen[key] = true;
      out.push({ key: key, picks: picks });
    }
    return out;
  }

  /* ---------- combo -> metadata ---------- */
  function traitsMap(combo) {
    var map = {};
    combo.picks.forEach(function (p) { if (!p.none) map[p.layer] = p.trait; });
    return map;
  }
  function attributesFor(combo) {
    return combo.picks
      .filter(function (p) { return !p.none; })
      .map(function (p) { return { trait_type: p.layer, value: p.trait }; });
  }

  /* ---------- build the handoff set ----------
     opts: { baseName, startId, layers, count, seed, render }
     render(combo, index) -> imageDataUrl | Promise<imageDataUrl>
     Resolves to [ { index, tokenId, name, traits, attributes, imageDataUrl } ].
     tokenIds are sequential numbers starting at startId (the launchpad
     convention); name is "<baseName> #<tokenId>". */
  function buildSet(opts) {
    opts = opts || {};
    var baseName = String(opts.baseName || "NFT").trim() || "NFT";
    var startId = Math.max(1, Math.floor(Number(opts.startId) || 1));
    var combos = opts.combos || generateCombos(opts.layers, opts.count, opts.seed);
    var render = typeof opts.render === "function" ? opts.render : function () { return ""; };
    var items = [];
    var chain = Promise.resolve();
    combos.forEach(function (combo, i) {
      chain = chain.then(function () {
        return Promise.resolve(render(combo, i)).then(function (imageDataUrl) {
          var tokenId = String(startId + i);
          items.push({
            index: i,
            tokenId: tokenId,
            name: baseName + " #" + tokenId,
            traits: traitsMap(combo),
            attributes: attributesFor(combo),
            imageDataUrl: imageDataUrl || "",
            key: combo.key
          });
        });
      });
    });
    return chain.then(function () { return items; });
  }

  return {
    MAX_COUNT: MAX_COUNT,
    NONE_NAME: NONE_NAME,
    mulberry32: mulberry32,
    hashSeed: hashSeed,
    effectiveTraits: effectiveTraits,
    totalCombos: totalCombos,
    generateCombos: generateCombos,
    traitsMap: traitsMap,
    attributesFor: attributesFor,
    buildSet: buildSet
  };
});
