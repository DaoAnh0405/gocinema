document.querySelectorAll('[data-sidebar-toggle]').forEach((el) => {
  el.addEventListener('click', () => {
    document.querySelector('.gc-shell').classList.toggle('gc-shell--open');
  });
});