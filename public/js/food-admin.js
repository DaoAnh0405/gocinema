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

  if (!items.length) {
    grid.innerHTML = '<div class="col-span-full text-center py-10 text-gray-500">Không có dữ liệu món ăn</div>';
    return;
  }

  items.forEach(item => {
    const isSelling = item.status === 'Đang bán';
    const badgeColor = isSelling ? 'bg-[#65D46E]' : 'bg-[#5A5A5A]';
    const imgHtml = item.image_url
      ? `<img src="${item.image_url}" alt="${item.name}" class="w-full h-full object-cover">`
      : `<div class="w-full h-full bg-white"></div>`;

    const card = document.createElement('div');
    card.className = 'food-card bg-[#DCDCDC] rounded-xl p-4 flex flex-col justify-between shadow-xs';
    card.innerHTML = `
      <div class="flex gap-3.5 items-start">
        <div class="w-16 h-20 bg-white rounded-lg shrink-0 overflow-hidden">
          ${imgHtml}
        </div>
        <div class="flex-1 min-w-0">
          <span class="inline-block ${badgeColor} text-white text-[11px] font-medium px-2.5 py-0.5 rounded-full mb-1.5">
            ${item.status}
          </span>
          <h4 class="font-medium text-gray-900 text-sm truncate" title="${item.name}">${item.name}</h4>
          <p class="text-xs text-gray-600 truncate mt-0.5" title="${item.description || ''}">${item.description || ''}</p>
        </div>
      </div>

      <div class="flex justify-between items-center mt-4 pt-2">
        <span class="text-[#D90404] font-semibold text-sm">${formatVND(item.price)}</span>
        <div class="flex items-center gap-2">
          <button onclick="openEditModal(${item.id})" class="bg-[#555555] hover:bg-gray-700 text-white text-xs px-3 py-1 rounded transition">
            Chỉnh sửa
          </button>
          <button onclick="deleteFood(${item.id})" title="Xóa" class="text-[#D90404] hover:text-red-700 p-1 transition">
            <i class="fa-regular fa-trash-can text-sm"></i>
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function previewImage(event, previewId, placeholderId) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById(previewId);
    img.src = e.target.result;
    img.classList.remove('hidden');
    document.getElementById(placeholderId).classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

function openAddModal() {
  document.getElementById('addForm').reset();
  document.getElementById('addImagePreview').classList.add('hidden');
  document.getElementById('addImagePlaceholder').classList.remove('hidden');
  document.getElementById('addModal').classList.replace('hidden', 'flex');
}

function openEditModal(id) {
  const item = foodList.find(f => f.id === id);
  if (!item) return;

  document.getElementById('editModalTitle').innerText = `Sửa món: ${item.name}`;
  document.getElementById('editId').value = item.id;
  document.getElementById('editName').value = item.name;
  document.getElementById('editDesc').value = item.description || '';
  document.getElementById('editPrice').value = item.price;
  document.getElementById('editStatus').value = item.status;

  document.getElementById('editModal').classList.replace('hidden', 'flex');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.replace('flex', 'hidden');
}

async function handleAddSubmit(e) {
  e.preventDefault();
  const formData = new FormData(document.getElementById('addForm'));
  const res = await fetch(API_URL, { method: 'POST', body: formData });
  if (res.ok) {
    closeModal('addModal');
    fetchFoods();
  } else {
    const err = await res.json();
    alert(err.message || 'Lỗi thêm món');
  }
}

async function handleEditSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editId').value;
  const formData = new FormData(document.getElementById('editForm'));
  const res = await fetch(`${API_URL}/${id}`, { method: 'PUT', body: formData });
  if (res.ok) {
    closeModal('editModal');
    fetchFoods();
  } else {
    const err = await res.json();
    alert(err.message || 'Lỗi cập nhật món');
  }
}

async function deleteFood(id) {
  if (!confirm('Bạn có chắc muốn xóa món này?')) return;
  const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
  if (res.ok) fetchFoods();
}

document.addEventListener('DOMContentLoaded', fetchFoods);