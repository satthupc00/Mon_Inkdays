// Nhập bằng giọng nói (chỉ Android): nói → chuyển thành chữ → chèn vào cuối ngày hôm nay.
// Dùng bộ nhận giọng nói có sẵn của điện thoại (Google), tiếng Việt.
import { registerPlugin } from '@capacitor/core';

const SR = registerPlugin('SpeechRecognition');

// Mở lớp "Đang nghe…": trả về chuỗi đã nói (rỗng nếu hủy / không nghe được gì)
export function listen({ onStatus } = {}) {
  return new Promise(async resolve => {
    let done = false, latest = '', restartT = 0, idleT = 0;
    const segs = [];
    const ov = document.createElement('div');
    ov.className = 'voice';
    ov.innerHTML = `<div class="vbox">
      <div class="vmic"><span></span><span></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></div>
      <div class="vstate">Đang nghe… cứ nói thoải mái</div>
      <div class="vtext"></div>
      <div class="vbtns"><button class="vno">Hủy</button><button class="vok">Xong</button></div>
    </div>`;
    document.body.appendChild(ov);
    const $t = ov.querySelector('.vtext'), $s = ov.querySelector('.vstate');
    const show = () => { $t.textContent = [...segs, latest].filter(Boolean).join(' '); };
    const setState = t => { $s.textContent = t; onStatus?.(t); };

    const finish = async keep => {
      if (done) return;
      done = true;
      clearTimeout(restartT); clearTimeout(idleT);
      try { await SR.stop(); } catch { /* đã dừng */ }
      try { await SR.removeAllListeners(); } catch { /* bỏ qua */ }
      if (latest) segs.push(latest);
      ov.classList.add('out');
      setTimeout(() => ov.remove(), 220);
      resolve(keep ? segs.join(' ').replace(/\s+/g, ' ').trim() : '');
    };
    ov.querySelector('.vno').onclick = () => finish(false);
    ov.querySelector('.vok').onclick = () => finish(true);

    // Điện thoại tự ngắt sau vài giây im lặng → tự nghe tiếp để người dùng ngừng nghỉ thoải mái
    const start = async () => {
      if (done) return;
      clearTimeout(idleT);
      try {
        await SR.start({ language: 'vi-VN', maxResults: 1, partialResults: true, popup: false });
        ov.classList.add('on');
        setState('Đang nghe… cứ nói thoải mái');
      } catch (e) {
        const m = String(e?.message || e);
        // Lỗi "không nghe thấy gì" / bận: thử lại sau chút
        if (/No match|No speech|busy|Client/i.test(m)) { restartT = setTimeout(start, 400); return; }
        setState('Lỗi nhận giọng nói: ' + m);
        return;
      }
      // Lỗi không phát sự kiện "stopped" → tự kiểm tra lại sau 9 giây
      idleT = setTimeout(next, 9000);
    };
    const next = () => {
      if (done) return;
      clearTimeout(restartT);
      // chờ kết quả cuối của câu vừa nói rồi mới nghe câu tiếp
      restartT = setTimeout(() => { if (latest) { segs.push(latest); latest = ''; show(); } start(); }, 700);
    };

    try {
      if (!(await SR.available()).available) { setState('Điện thoại chưa có bộ nhận giọng nói (cần app Google)'); return; }
      let p = await SR.checkPermissions();
      if (p.speechRecognition !== 'granted') p = await SR.requestPermissions();
      if (p.speechRecognition !== 'granted') { setState('Cần cho phép dùng micro để nhập bằng giọng nói'); return; }
      await SR.addListener('partialResults', d => { if (!done && d?.matches?.[0]) { latest = d.matches[0]; show(); } });
      await SR.addListener('listeningState', d => {
        if (done) return;
        if (d?.status === 'stopped') { ov.classList.remove('on'); setState('Đang xử lý…'); clearTimeout(idleT); next(); }
        else if (d?.status === 'started') { ov.classList.add('on'); clearTimeout(idleT); idleT = setTimeout(next, 45000); }
      });
      await start();
    } catch (e) { setState('Lỗi: ' + (e?.message || e)); }
  });
}

// Chữ cái đầu viết hoa
export const cap1 = s => s ? s[0].toLocaleUpperCase('vi') + s.slice(1) : s;
