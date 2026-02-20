const BEER_WORDS = ['choppe', 'bière', 'pinte', 'bibines', 'cinquante', 'guiness'];

function randomBeer() {
  return BEER_WORDS[Math.floor(Math.random() * BEER_WORDS.length)];
}

module.exports = { randomBeer };
