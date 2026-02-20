const BEER_WORDS = ['choppes', 'bières', 'pintes', 'bibines', 'cinquantes', 'guiness'];

function randomBeer() {
  return BEER_WORDS[Math.floor(Math.random() * BEER_WORDS.length)];
}

module.exports = { randomBeer };
