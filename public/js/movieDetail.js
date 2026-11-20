(function () {
  'use strict';

  const modal = document.getElementById('trailerModal');
  const stage = document.getElementById('trailerStage');
  if (!modal || !stage) return;

  modal.addEventListener('show.bs.modal', (event) => {
    const btn = event.relatedTarget;
    if (!btn) return;
    stage.replaceChildren();

    if (btn.dataset.kind === 'youtube') {
      const frame = document.createElement('iframe');
      frame.src = btn.dataset.src;
      frame.title = 'Trailer';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';   // YouTube cần referrer, helmet mặc định tắt nó
      stage.appendChild(frame);
    } else {
      const video = document.createElement('video');
      video.src = btn.dataset.src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      stage.appendChild(video);
    }
  });

  // Đóng modal thì gỡ khung phát, video ngừng ngay
  modal.addEventListener('hidden.bs.modal', () => stage.replaceChildren());
})();