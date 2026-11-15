(() => {
  const modal = document.getElementById('promotionModal');
  if (!modal) return;

  const form = document.getElementById('promotionForm');
  const method = document.getElementById('promotionMethod');
  const title = document.getElementById('promotionModalTitle');
  const type = document.getElementById('promotionType');
  const maximum = document.getElementById('maxDiscountField');

  const setMaximumVisibility = () => {
    maximum.hidden = type.value !== 'PERCENT';
  };
  type.addEventListener('change', setMaximumVisibility);
  setMaximumVisibility();

  document.querySelectorAll('[data-promotion-create]').forEach((button) => {
    button.addEventListener('click', () => {
      form.reset();
      form.action = '/admin/promotions';
      method.value = '';
      title.textContent = 'Tạo khuyến mãi mới';
      type.value = 'PERCENT';
      setMaximumVisibility();
    });
  });

  document.querySelectorAll('[data-promotion-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const data = button.dataset;
      form.action = `/admin/promotions/${encodeURIComponent(data.id)}`;
      method.value = 'PUT';
      title.textContent = 'Sửa mã khuyến mãi';
      form.elements.promo_code.value = data.code;
      form.elements.promotion_name.value = data.name;
      form.elements.description.value = decodeURIComponent(data.description);
      type.value = data.type;
      form.elements.discount_value.value = data.value;
      form.elements.max_discount.value = data.maxDiscount;
      form.elements.min_order_value.value = data.minimum;
      form.elements.start_date.value = data.start;
      form.elements.end_date.value = data.end;
      form.elements.quantity.value = data.quantity;
      setMaximumVisibility();
    });
  });

  document.querySelectorAll('[data-confirm]').forEach((formElement) => {
    formElement.addEventListener('submit', (event) => {
      if (!window.confirm(formElement.dataset.confirm)) event.preventDefault();
    });
  });

  if (document.querySelector('[data-promotion-modal-open]')) {
    bootstrap.Modal.getOrCreateInstance(modal).show();
  }
})();
