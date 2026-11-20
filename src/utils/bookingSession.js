const get = (req, showtimeId) => {
  const b = req.session.booking;
  return b && b.showtimeId === showtimeId ? b : { showtimeId, foods: [], promoCode: null };
};
const set = (req, state) => { req.session.booking = state; };
const clear = (req) => { delete req.session.booking; };

module.exports = { get, set, clear };