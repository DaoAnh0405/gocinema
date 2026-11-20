const { MOVIE_STATUS } = require('../constants');
const movieModel = require('../models/movieModel');
const promotionModel = require('../models/promotionModel');

const MOVIES_PER_TAB = 36;

async function getHomeData() {
  const [hotMovies, nowShowing, comingSoon, promotions] = await Promise.all([
    movieModel.listHot(5),
    movieModel.listByStatus(MOVIE_STATUS.NOW_SHOWING, MOVIES_PER_TAB),
    movieModel.listByStatus(MOVIE_STATUS.COMING_SOON, MOVIES_PER_TAB),
    promotionModel.listActive(4),
  ]);
  return { hotMovies, nowShowing, comingSoon, promotions };
}

module.exports = { getHomeData };