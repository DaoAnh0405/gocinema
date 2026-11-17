const priceDialog = document.querySelector('[data-price-dialog]');
const priceFilters = document.querySelector('[data-price-filters]');
priceFilters?.addEventListener('change', (event) => {
  if (event.target.matches('select')) priceFilters.requestSubmit();
});

if (priceDialog && typeof priceDialog.showModal === 'function') {
  priceDialog.removeAttribute('open');
  priceDialog.showModal();
  priceDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    window.location.assign(priceDialog.dataset.returnUrl);
  });
}

document.querySelectorAll('[data-price-form]').forEach((form) => {
  form.addEventListener('invalid', (event) => {
    const details = event.target.closest('details');
    if (details) details.open = true;
  }, true);
  form.addEventListener('submit', () => {
    form.classList.add('price-form--submitting');
    form.querySelector('button[type="submit"]').disabled = true;
  });
});

window.addEventListener('pageshow', () => {
  document.querySelectorAll('.price-form--submitting').forEach((form) => {
    form.classList.remove('price-form--submitting');
    form.querySelector('button[type="submit"]').disabled = false;
  });
});
