const asyncHandler = require('../utils/asyncHandler');
const movieService = require('../services/movieService');
const { errorMessages } = require('../middlewares/validate');

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