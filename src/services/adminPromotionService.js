const promotionModel = require('../models/promotionModel');

// form chỉ chọn ngày bắt đầu lúc 00:00:00, kết thúc lúc 23:59:59
function toRecord(values) {
  return {
    ...values,
    description: values.description || null,
    start_date: `${values.start_date} 00:00:00`,
    end_date: `${values.end_date} 23:59:59`,
  };
}

const list = (filters) => promotionModel.listPage(filters);
const create = (values) => promotionModel.create(toRecord(values));
const update = (id, values) => promotionModel.update(id, toRecord(values));
const remove = (id) => promotionModel.remove(id);

module.exports = { list, create, update, remove };