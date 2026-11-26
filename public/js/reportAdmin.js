(() => {
  'use strict';

  const holder = document.querySelector('[data-report-charts]');
  if (!holder) return;

  // thư viện biểu đồ nằm trên CDN: không tải được thì báo và vẫn còn các bảng số liệu bên dưới
  if (typeof window.Chart !== 'function') {
    const fallback = holder.querySelector('[data-report-fallback]');
    if (fallback) fallback.hidden = false;
    return;
  }

  let data;
  try {
    data = JSON.parse(holder.dataset.report);
  } catch (err) {
    console.error('Dữ liệu thống kê không hợp lệ', err);
    return;
  }

  const COLORS = ['#e50914', '#1e293b', '#f59e0b', '#64748b', '#10b981'];
  const money = (value) => `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)}đ`;
  const compact = (value) => new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

  const daily = document.getElementById('rep-daily');
  if (daily) {
    new window.Chart(daily, {
      data: {
        labels: data.labels,
        datasets: [
          {
            type: 'bar', label: 'Doanh thu', data: data.revenue, yAxisID: 'money',
            backgroundColor: 'rgba(229, 9, 20, 0.8)', borderRadius: 3, order: 2,
          },
          {
            type: 'line', label: 'Số đơn', data: data.orders, yAxisID: 'orders',
            borderColor: '#1e293b', backgroundColor: '#1e293b', borderWidth: 2, tension: 0.25,
            pointRadius: data.labels.length > 45 ? 0 : 3, order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (ctx) => (ctx.dataset.yAxisID === 'money'
                ? `Doanh thu: ${money(ctx.parsed.y)}` : `Số đơn: ${ctx.parsed.y}`),
            },
          },
        },
        scales: {
          money: { position: 'left', beginAtZero: true, ticks: { callback: (value) => compact(value) } },
          orders: {
            position: 'right', beginAtZero: true, grid: { drawOnChartArea: false },
            ticks: { precision: 0 },
          },
          x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 15 } },
        },
      },
    });
  }

  function doughnut(id, series) {
    const canvas = document.getElementById(id);
    if (!canvas || !series.values.length) return;
    new window.Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: series.labels,
        datasets: [{ data: series.values, backgroundColor: COLORS, borderWidth: 2, borderColor: '#fff' }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${money(ctx.parsed)}` } },
        },
      },
    });
  }

  doughnut('rep-channels', data.channels);
  doughnut('rep-payments', data.payments);
})();