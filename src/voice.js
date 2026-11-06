// Nhập bằng giọng nói (chỉ Android): nói → chuyển thành chữ.
// Dùng plugin VoiceInput tự viết (android/.../VoiceInputPlugin.java), giống bàn phím MonKey:
// ưu tiên bộ nhận của Google, tiếng Việt, có gợi ý các từ tiếng Anh phổ thông để nhận đúng khi nói giọng Việt.
import { registerPlugin } from '@capacitor/core';

const VI = registerPlugin('VoiceInput');

// Lưới an toàn: khi máy vẫn ra kiểu "phiên âm" thì đổi lại thành từ tiếng Anh.
// Chỉ gồm cụm từ 2 âm tiết trở lên, không trùng từ tiếng Việt thường dùng.
const FIX = [
  ['on lai|on lainh|ôn lai', 'online'], ['óp lai|ốp lai|ọp lai|off lai', 'offline'],
  ['ê meo|i meo|i mêu|e meo', 'email'], ['oép sai|quét sai|web sai', 'website'],
  ['đét lai|đéc lai|đẹt lai', 'deadline'], ['phít bách|phít bắc|phi bách|phiếc bách', 'feedback'],
  ['úp đết|ấp đết|ắp đết|úp đây', 'update'], ['đao lốt|đao lót|đao lớt', 'download'], ['ắp lốt|úp lốt|áp lốt', 'upload'],
  ['ô kê|ô cê|ốc kê', 'OK'], ['sét ting|sết ting', 'setting'],
  ['ni mây sần|a ni mây sần|e ni mây sần', 'animation'], ['phây búc|phây bút|phê búc', 'Facebook'],
  ['du túp|diu túp|yêu túp', 'YouTube'], ['gu gồ|gu gồ', 'Google'], ['ai phôn', 'iPhone'],
  ['lép tóp|láp tóp|láp tốp|lap top', 'laptop'], ['quai phai|oai phai|wai phai', 'wifi'],
  ['pát quợt|pass quợt|pát guốt', 'password'], ['li xtim|lai sờ tim|lai xtrim', 'livestream'],
  ['sóp pinh|sốp ping|shop ping', 'shopping'], ['síp pơ|ship pơ|sip pơ', 'shipper'],
  ['quy ken|uých ken|uy ken', 'weekend'], ['phít nét|phít nết', 'fitness'], ['cam ping|cắm ping', 'camping'],
  ['hôm stay|hôm xtay', 'homestay'], ['con xớt|côn xớt', 'concert'], ['nét phlích|nét phích|nét flix', 'Netflix'],
  ['sen phi|xen phi|sen fi', 'selfie'], ['phô tô sóp|phốt sốp|phô tô sốp', 'Photoshop'], ['blen đơ|ben đơ', 'Blender'],
  ['ren đơ|ren đờ', 'render'], ['con xép|côn xép|con sẹp', 'concept'], ['quoóc sóp|uốc sóp|quốc sóp', 'workshop'],
  ['tren ning|tờ ren ning', 'training'], ['ích xeo|ếch xeo|ếch xen', 'Excel'], ['tíc tóc|tích tốc|tiktok', 'TikTok'],
  ['in sta gram|in xta gram', 'Instagram'], ['me sen giơ|mét xen giơ', 'Messenger'], ['xpốt ti phai|xpot ti phai', 'Spotify'],
  ['thanh kiu|thanh kiù|thank kiu', 'thank you'], ['sô ri|xo ri|so ri', 'sorry'], ['he lô|hê lô|hế lô', 'hello'],
].map(([from, to]) => [new RegExp(`(?<![\\p{L}])(?:${from})(?![\\p{L}])`, 'giu'), to]);
export const fixEnglish = s => FIX.reduce((t, [re, to]) => t.replace(re, to), s);

// Mở lớp "Đang nghe…": trả về chuỗi đã nói (rỗng nếu hủy / không nghe được gì)
export function listen() {
  return new Promise(async resolve => {
    let done = false, closing = false, partial = '', safety = 0;
    const segs = [];
    const subs = [];
    const ov = document.createElement('div');
    ov.className = 'voice';
    ov.innerHTML = `<div class="vbox">
      <button class="vmic" aria-label="Nghe tiếp"><span></span><span></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
      <div class="vstate">Đang mở micro…</div>
      <div class="vtext"></div>
      <div class="vbtns"><button class="vno">Hủy</button><button class="vok">Xong</button></div>
    </div>`;
    document.body.appendChild(ov);
    const $t = ov.querySelector('.vtext'), $s = ov.querySelector('.vstate');
    const all = () => fixEnglish([...segs, partial].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim());
    const show = () => { $t.textContent = all(); };

    const close = keep => {
      if (done) return;
      done = true;
      clearTimeout(safety);
      if (partial) segs.push(partial);
      VI.cancel().catch(() => {});
      subs.forEach(s => s.then(h => h.remove()).catch(() => {}));
      ov.classList.add('out');
      setTimeout(() => ov.remove(), 220);
      resolve(keep ? all() : '');
    };
    ov.querySelector('.vno').onclick = () => close(false);
    // Xong: chốt nốt câu đang nói rồi mới đóng (tối đa 1,5 giây)
    ov.querySelector('.vok').onclick = () => {
      if (closing) return;
      closing = true;
      $s.textContent = 'Đang xử lý…';
      VI.stop().catch(() => {});
      safety = setTimeout(() => close(true), 1500);
    };
    ov.querySelector('.vmic').onclick = () => { if (!ov.classList.contains('on') && !closing) VI.start().catch(() => {}); };

    subs.push(VI.addListener('partial', d => { if (!done && d?.text) { partial = d.text; show(); } }));
    subs.push(VI.addListener('final', d => {
      if (done) return;
      const t = d?.text || partial;
      partial = '';
      if (t) segs.push(t);
      show();
    }));
    subs.push(VI.addListener('state', d => {
      if (done) return;
      if (d?.state === 'listening') { ov.classList.add('on'); $s.textContent = 'Đang nghe… cứ nói thoải mái'; }
      else if (d?.state === 'stopped') {
        ov.classList.remove('on');
        if (closing) close(true);
        else $s.textContent = 'Đã tạm dừng nghe · chạm micro để nói tiếp';
      } else if (d?.state === 'error') {
        ov.classList.remove('on');
        if (closing) close(true);
        else $s.textContent = (d.message || 'Lỗi nhận giọng nói') + ' · chạm micro để thử lại';
      }
    }));

    try {
      if (!(await VI.available()).available) { $s.textContent = 'Điện thoại chưa có bộ nhận giọng nói (cần app Google)'; return; }
      if (!(await VI.ensurePermission()).granted) { $s.textContent = 'Cần cho phép dùng micro để nhập bằng giọng nói'; return; }
      await VI.start();
    } catch (e) { $s.textContent = 'Lỗi: ' + (e?.message || e); }
  });
}

// Chữ cái đầu viết hoa
export const cap1 = s => s ? s[0].toLocaleUpperCase('vi') + s.slice(1) : s;
