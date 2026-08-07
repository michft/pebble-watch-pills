var COLOR_ID_MAX = 19;

var COLORS = [
  { id: 0, name: "White", css: "#ffffff" },
  { id: 1, name: "Black", css: "#000000" },
  { id: 2, name: "Red", css: "#ff0000" },
  { id: 3, name: "Orange", css: "#ff5500" },
  { id: 4, name: "Yellow", css: "#ffff00" },
  { id: 5, name: "Green", css: "#00ff00" },
  { id: 6, name: "Cyan", css: "#00ffff" },
  { id: 7, name: "Blue", css: "#0000ff" },
  { id: 8, name: "Purple", css: "#aa00ff" },
  { id: 9, name: "Magenta", css: "#ff00ff" },
  { id: 10, name: "Chrome yellow", css: "#ffaa00" },
  { id: 11, name: "Bright green", css: "#55ff00" },
  { id: 12, name: "Electric blue", css: "#55ffff" },
  { id: 13, name: "Vivid cerulean", css: "#00aaff" },
  { id: 14, name: "Picton blue", css: "#55aaff" },
  { id: 15, name: "Indigo", css: "#5500aa" },
  { id: 16, name: "Jazzberry", css: "#aa0055" },
  { id: 17, name: "Folly", css: "#ff0055" },
  { id: 18, name: "Dark red", css: "#aa0000" },
  { id: 19, name: "Oxford blue", css: "#000055" },
];

var SCHEMES = [
  { id: "classic-dark", name: "Classic dark", textColor: 0, backgroundColor: 1 },
  { id: "classic-light", name: "Classic light", textColor: 1, backgroundColor: 0 },
  { id: "midnight", name: "Midnight", textColor: 0, backgroundColor: 19 },
  { id: "electric", name: "Electric", textColor: 1, backgroundColor: 12 },
  { id: "cerulean", name: "Cerulean", textColor: 1, backgroundColor: 13 },
  { id: "sky", name: "Sky", textColor: 1, backgroundColor: 14 },
  { id: "solar", name: "Solar", textColor: 1, backgroundColor: 10 },
  { id: "lime", name: "Lime", textColor: 1, backgroundColor: 11 },
  { id: "orange", name: "Orange", textColor: 1, backgroundColor: 3 },
  { id: "red", name: "Red alert", textColor: 1, backgroundColor: 2 },
  { id: "hot-pink", name: "Hot pink", textColor: 1, backgroundColor: 17 },
  { id: "magenta", name: "Magenta", textColor: 1, backgroundColor: 9 },
  { id: "green", name: "Green", textColor: 1, backgroundColor: 5 },
  { id: "cyan", name: "Cyan", textColor: 1, backgroundColor: 6 },
  { id: "blue", name: "Blue", textColor: 0, backgroundColor: 7 },
  { id: "purple", name: "Purple pulse", textColor: 0, backgroundColor: 8 },
  { id: "indigo", name: "Indigo", textColor: 0, backgroundColor: 15 },
  { id: "berry", name: "Berry", textColor: 0, backgroundColor: 16 },
  { id: "gold-night", name: "Gold night", textColor: 10, backgroundColor: 19 },
  { id: "aqua-night", name: "Aqua night", textColor: 12, backgroundColor: 19 },
];

function colorForId(id) {
  return COLORS[id] || COLORS[0];
}

function colorIdValid(id) {
  return Number.isInteger(id) && id >= 0 && id <= COLOR_ID_MAX;
}

function findScheme(textColor, backgroundColor) {
  for (var index = 0; index < SCHEMES.length; index += 1) {
    if (
      SCHEMES[index].textColor === textColor
      && SCHEMES[index].backgroundColor === backgroundColor
    ) return SCHEMES[index];
  }
  return null;
}

exports.COLOR_ID_MAX = COLOR_ID_MAX;
exports.COLORS = COLORS;
exports.SCHEMES = SCHEMES;
exports.colorForId = colorForId;
exports.colorIdValid = colorIdValid;
exports.findScheme = findScheme;
