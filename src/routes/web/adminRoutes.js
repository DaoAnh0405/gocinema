const router = require("express").Router();
const { requireLogin, requireRole } = require("../../middlewares/auth");
const { adminLayout } = require("../../middlewares/layout");
const { ROLE, PERMISSION } = require("../../constants");
const { requirePermission } = require("../../middlewares/permission");
const prices = require("../../controllers/ticketPriceController");
const { idRule, priceRules } = require("../../validators/ticketPriceValidator");
const cinemas = require("../../controllers/cinemaController");
const cinemaRules = require("../../validators/cinemaValidator");

router.use(requireLogin, requireRole(ROLE.ADMIN), adminLayout);

router.get("/", (req, res) =>
  res.render("pages/admin/dashboard", { title: "Tổng quan" }),
);

router.use(require("./adminCatalogRoutes"));
router.use("/showtimes", require("./adminShowtimeRoutes"));



module.exports = router;
