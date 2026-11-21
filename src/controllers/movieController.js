const asyncHandler = require('../utils/asyncHandler');
const movieService = require('../services/movieService');
const { errorMessages } = require('../middlewares/validate');
const { MOVIE_STATUS } = require('../constants');

exports.detail = asyncHandler(async (req, res) => {
  const data = await movieService.getDetail(req.params.id);
  res.render('pages/home/movieDetail', { title: data.movie.title, ...data });
});

// GET /movies?q=...  (không có q: liệt kê phim đang chiếu và sắp chiếu)
exports.search = asyncHandler(async (req, res) => {
  const raw = req.query.q;
  const hasKeyword = raw !== undefined;
  const keyword = typeof raw === 'string' ? raw.trim() : '';
  const errors = hasKeyword ? errorMessages(req) : [];

  const view = {
    title: hasKeyword ? 'Tìm kiếm phim' : 'Phim',
    hasKeyword,
    errors,
    searchQuery: keyword.slice(0, 100),
    nowShowing: [],
    comingSoon: [],
  };
  if (errors.length) return res.status(400).render('pages/home/movieSearch', view);

  const result = await movieService.search(keyword);
  return res.render('pages/home/movieSearch', { ...view, ...result });
});

// trang danh sách đầy đủ theo trạng thái phim
function statusPage(status, heading, emptyText) {
  return asyncHandler(async (req, res) => {
    const movies = await movieService.listByStatus(status);
    res.render('pages/home/movieList', { title: heading, heading, emptyText, movies });
  });
}

exports.nowShowing = statusPage(
  MOVIE_STATUS.NOW_SHOWING, 'Phim đang chiếu', 'Hiện chưa có phim đang chiếu.',
);
exports.comingSoon = statusPage(
  MOVIE_STATUS.COMING_SOON, 'Phim sắp chiếu', 'Hiện chưa có phim sắp chiếu.',
);