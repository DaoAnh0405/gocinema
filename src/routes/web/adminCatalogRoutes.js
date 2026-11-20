const router = require('express').Router();
const controller = require('../../controllers/adminCatalogController');
const { requirePermission } = require('../../middlewares/permission');
const { catalogCsrfToken, verifyCatalogCsrf } = require('../../middlewares/catalogCsrf');
const { uploadPoster } = require('../../middlewares/posterUpload');
const { PERMISSION } = require('../../constants');

router.use(['/movies', '/genres'], requirePermission(PERMISSION.MANAGE_MOVIES), catalogCsrfToken);

router.get('/movies', controller.listMovies);
router.get('/movies/new', controller.newMovie);
router.get('/movies/:id/edit', controller.editMovie);
router.post('/movies', uploadPoster, verifyCatalogCsrf, controller.createMovie);
router.post('/movies/:id/update', uploadPoster, verifyCatalogCsrf, controller.updateMovie);
router.post('/movies/:id/delete', verifyCatalogCsrf, controller.deleteMovie);

router.get('/genres', controller.listGenres);
router.post('/genres', verifyCatalogCsrf, controller.createGenre);
router.post('/genres/:id/update', verifyCatalogCsrf, controller.updateGenre);
router.post('/genres/:id/delete', verifyCatalogCsrf, controller.deleteGenre);

module.exports = router;
