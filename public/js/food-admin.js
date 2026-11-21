const API_URL = '/api/foods';
let foodList = [];

function formatVND(price) {
  return Number(price).toLocaleString('vi-VN') + ' đ';
}

async function fetchFoods() {
  const search = document.getElementById('searchInput').value;
  const status = document.getElementById('filterStatus').value;
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (status) params.append('status', status);

  const res = await fetch(`${API_URL}?${params.toString()}`);
  foodList = await res.json();
  renderCards(foodList);
}

function renderCards(items) {
  const grid = document.getElementById('foodGrid');
  grid.innerHTML = '';

  if (!items || !items.length) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #6b7280;">Không có dữ liệu món ăn</div>';
    return;
  }

  items.forEach(item => {
    const isSelling = item.status === 'Đang bán';
    const badgeClass = isSelling ? 'badge-selling' : 'badge-stopped';
    const imgHtml = item.image_url ? `<img src="${item.image_url}" alt="${item.name}">` : '';

    const card = document.createElement('div');
    card.className = 'food-card';
    card.innerHTML = `
      <div class="card-top">
        <div class="card-thumb">${imgHtml}</div>
        <div class="card-info">
          <span class="badge ${badgeClass}">${item.status}</span>
          <div class="card-title" title="${item.name}">${item.name}</div>
          <div class="card-desc" title="${item.description || ''}">${item.description || ''}</div>
        </div>
      </div>

      <div class="card-bottom">
        <span class="card-price">${formatVND(item.price)}</span>
        <div class="card-actions">
          <button type="button" class="btn-edit" data-id="${item.id}">Chỉnh sửa</button>
          <button type="button" class="btn-delete" data-id="${item.id}" title="Xóa">🗑</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function openAddModal() {
  document.getElementById('addForm').reset();
  document.getElementById('addImagePreview').classList.add('hidden');
  document.getElementById('addImagePlaceholder').classList.remove('hidden');
  document.getElementById('addModal').classList.add('open');
}

function openEditModal(id) {
  const item = foodList.find(f => Number(f.id) === Number(id));
  if (!item) return;

  document.getElementById('editModalTitle').innerText = `Sửa món: ${item.name}`;
  document.getElementById('editId').value = item.id;
  document.getElementById('editName').value = item.name;
  document.getElementById('editDesc').value = item.description || '';
  document.getElementById('editPrice').value = item.price;
  document.getElementById('editStatus').value = item.status;

  document.getElementById('editModal').classList.add('open');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('open');
}

document.addEventListener('DOMContentLoaded', () => {
  fetchFoods();

  document.getElementById('searchInput').addEventListener('input', fetchFoods);
  document.getElementById('filterStatus').addEventListener('change', fetchFoods);

  document.getElementById('btnOpenAdd').addEventListener('click', openAddModal);
  document.getElementById('btnCloseAdd').addEventListener('click', () => closeModal('addModal'));
  document.getElementById('btnCloseEdit').addEventListener('click', () => closeModal('editModal'));

  document.getElementById('addImageInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = document.getElementById('addImagePreview');
      img.src = ev.target.result;
      img.classList.remove('hidden');
      document.getElementById('addImagePlaceholder').classList.add('hidden');
    };
    reader.readAsDataURL(file);
  });

  // Event delegation cho nút Chỉnh sửa & Xóa trên từng card
  document.getElementById('foodGrid').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.btn-edit');
    if (editBtn) {
      openEditModal(editBtn.dataset.id);
      return;
    }

    const deleteBtn = e.target.closest('.btn-delete');
    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      if (!confirm('Bạn có chắc chắn muốn xóa món này?')) return;
      const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
      if (res.ok) fetchFoods();
    }
  });

  document.getElementById('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const res = await fetch(API_URL, { method: 'POST', body: formData });
    if (res.ok) {
      closeModal('addModal');
      fetchFoods();
    } else {
      const err = await res.json();
      alert(err.message || 'Lỗi thêm món');
    }
  });

  document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const formData = new FormData(e.target);
    const res = await fetch(`${API_URL}/${id}`, { method: 'PUT', body: formData });
    if (res.ok) {
      closeModal('editModal');
      fetchFoods();
    } else {
      const err = await res.json();
      alert(err.message || 'Lỗi cập nhật món');
    }
  });
});