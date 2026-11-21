'use strict';
const KEY = 'hourly.v1';
const WD = ['일', '월', '화', '수', '목', '금', '토'];
// 알림: 아이폰 캘린더의 '시간일기' 캘린더(iCloud)가 매일 이 시각 정각에 알림을 보낸다. 바꿀 때는 캘린더와 함께 고친다.
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const ACTIVITIES = ['업무', '회의', '이동', '식사', '휴식', '운동', '공부', '가족·육아', '대화·모임', '집안일', '휴대폰·영상', '기타'];
const EMOTIONS = ['평온', '기쁨', '감사', '몰입', '설렘', '뿌듯함', '지루함', '피곤', '불안', '초조', '압박감', '짜증', '화', '슬픔', '외로움', '허탈', '무기력', '죄책감'];
const URGES = ['담배', '술', '단 것·과식', '휴대폰·SNS', '쇼핑', '쉬고 싶음', '자고 싶음', '도망치고 싶음', '인정받고 싶음', '대화하고 싶음', '혼자 있고 싶음'];
const MOOD = ['아주 나쁨', '나쁨', '보통', '좋음', '아주 좋음'];
const ENERGY = ['바닥', '낮음', '보통', '높음', '넘침'];

const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayOf = d => toStr(d).slice(0, 10);
const slotOf = d => `${dayOf(d)} ${pad(d.getHours())}`;
const slotDay = s => s.slice(0, 10);
const slotHour = s => +s.slice(11, 13);
const makeSlot = (day, h) => `${day} ${pad(h)}`;
function parseDay(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function dateLabel(key) { const d = parseDay(key); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; }
function relDay(key) {
  const diff = Math.round((parseDay(dayOf(new Date())) - parseDay(key)) / 86400000);
  return diff === 0 ? '오늘' : diff === 1 ? '어제' : dateLabel(key);
}
const slotTitle = s => `${relDay(slotDay(s))} ${slotHour(s)}시`;
const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/* ---------- 저장 ---------- */
const SLOT_RE = /^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3])$/;
const AT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
// 저장된 값이나 백업 파일에서 들어온 기록은 형식을 검사하고 길이를 제한한다.
function normalizeEntry(e) {
  if (!e || typeof e !== 'object' || typeof e.slot !== 'string' || !SLOT_RE.test(e.slot)) return null;
  const str = (v, max) => (v == null ? '' : String(v)).slice(0, max);
  const list = v => (Array.isArray(v) ? v : []).filter(x => typeof x === 'string' && x.trim()).map(x => x.slice(0, 30)).slice(0, 20);
  const int = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
  return {
    slot: e.slot,
    at: typeof e.at === 'string' && AT_RE.test(e.at) ? e.at : e.slot + ':00',
    activity: str(e.activity, 30), doing: str(e.doing, 200),
    mood: int(e.mood, 1, 5), energy: int(e.energy, 1, 5),
    emotions: list(e.emotions), urges: list(e.urges), urge: int(e.urge, 0, 10),
    note: str(e.note, 4000),
  };
}
function load() {
  const base = { v: 1, entries: {}, reflect: {}, lastBackup: null };
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
  if (!s || typeof s !== 'object') return base;
  const entries = {};
  for (const e of Object.values(s.entries || {})) { const n = normalizeEntry(e); if (n) entries[n.slot] = n; }
  return { ...base, entries, reflect: (s.reflect && typeof s.reflect === 'object') ? s.reflect : {}, lastBackup: s.lastBackup || null };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch (e) { toast('저장하지 못했어요. 아이폰 저장 공간을 확인해 주세요'); return false; }
}
function askPersist() { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); }

let state = load();
let view = 'now';
let form = blankForm(slotOf(new Date()));
let dayCursor = dayOf(new Date());
let patternDays = 7;

function blankForm(slot) {
  const e = state.entries[slot];
  if (e) return { ...e, emotions: e.emotions.slice(), urges: e.urges.slice(), existing: true };
  return { slot, activity: '', doing: '', mood: null, energy: null, emotions: [], urges: [], urge: null, note: '', existing: false };
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- 기록 화면 ---------- */
function daySlots(day) {
  const hours = new Set(HOURS);
  for (const s of Object.keys(state.entries)) if (slotDay(s) === day) hours.add(slotHour(s));
  return [...hours].sort((a, b) => a - b).map(h => makeSlot(day, h));
}
function slotState(s, nowSlot) {
  if (state.entries[s]) return 'done';
  if (s > nowSlot) return 'future';
  if (s < nowSlot) return 'missed';
  return 'now';
}
function chipsHTML(opts, cur, act, extraClass) {
  const all = opts.slice();
  for (const c of cur) if (!all.includes(c)) all.push(c);
  return `<div class="chips ${extraClass || ''}">${all.map(o => `<button class="chip" data-act="${act}" data-v="${esc(o)}" aria-pressed="${cur.includes(o)}">${esc(o)}</button>`).join('')}</div>`;
}
function scaleHTML(labels, cur, act) {
  return `<div class="scale">${labels.map((l, i) => `<button data-act="${act}" data-v="${i + 1}" aria-pressed="${cur === i + 1}"><b>${i + 1}</b>${l}</button>`).join('')}</div>`;
}

function renderNow() {
  const f = form;
  const nowSlot = slotOf(new Date());
  const today = dayOf(new Date());
  const slots = daySlots(slotDay(f.slot));
  const doneToday = HOURS.filter(h => state.entries[makeSlot(today, h)]).length;
  $('#view-now').innerHTML = `
    <div class="slothead"><b>${esc(slotTitle(f.slot))}</b><span class="muted small">${f.existing ? '이 시간 기록 수정' : '지금 뭘 하고 있나요?'}</span></div>
    <div class="slotbar" id="slotbar">${slots.map(s => {
      const st = slotState(s, nowSlot);
      const mark = st === 'done' ? '✓' : st === 'missed' ? '빈칸' : st === 'now' ? '지금' : '';
      return `<button class="slot ${st}" data-act="slot" data-v="${s}" aria-pressed="${s === f.slot}" ${st === 'future' ? 'disabled' : ''}>${slotHour(s)}시<i>${mark}</i></button>`;
    }).join('')}</div>
    <p class="muted small" style="margin:0 2px 12px">${slotDay(f.slot) === today ? `오늘 ${doneToday}/${HOURS.length}칸 기록 · 비어 있는 칸을 누르면 나중에 채울 수 있어요` : `${esc(dateLabel(slotDay(f.slot)))} 기록을 채우는 중 · <button class="link" data-act="slot" data-v="${nowSlot}">지금으로</button>`}</p>

    <div class="card" id="fact-card">
      <div class="q"><span>지금 하는 일 <small class="muted">· 사실만</small></span></div>
      ${chipsHTML(ACTIVITIES, f.activity ? [f.activity] : [], 'activity')}
      <input type="text" id="doing" style="margin-top:10px" maxlength="200" placeholder="구체적으로 (예: 주간보고 작성, 지하철로 퇴근)" value="${esc(f.doing)}">
    </div>
    <div class="card">
      <div class="q"><span>기분</span></div>
      ${scaleHTML(MOOD, f.mood, 'mood')}
      <div class="q" style="margin-top:14px"><span>에너지</span></div>
      ${scaleHTML(ENERGY, f.energy, 'energy')}
    </div>
    <div class="card">
      <div class="q"><span>지금 느끼는 감정</span><small class="muted">여러 개 선택</small></div>
      ${chipsHTML(EMOTIONS, f.emotions, 'emotion')}
    </div>
    <div class="card">
      <div class="q"><span>올라온 욕구·충동</span><small class="muted">알아차린 것만</small></div>
      ${chipsHTML(URGES, f.urges, 'urge-pick', 'urges')}
      ${f.urges.length ? `<div class="q" style="margin:14px 0 0"><span>가장 강한 욕구의 세기</span><b style="color:var(--urge)">${f.urge == null ? '' : f.urge}</b></div>
        <div class="crave">${Array.from({ length: 11 }, (_, i) => `<button data-act="urge-level" data-v="${i}" aria-pressed="${f.urge === i}" aria-label="세기 ${i}">${i}</button>`).join('')}</div>` : ''}
    </div>
    <div class="card">
      <label class="q" for="note"><span>알아차림 메모</span><small class="muted">선택</small></label>
      <textarea id="note" rows="3" maxlength="4000" placeholder="몸과 마음에서 알아차린 것 (예: 회의가 끝나니 어깨가 굳어 있었고 담배 생각이 났다)">${esc(f.note)}</textarea>
    </div>
    <button class="primary" data-act="save">${f.existing ? '수정 저장' : '기록하기'}</button>
    ${f.existing ? '<button class="danger" data-act="delete">이 시간 기록 지우기</button>' : ''}
  `;
  const cur = $('#slotbar [aria-pressed="true"]');
  if (cur) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function readText() {
  const d = $('#doing'), n = $('#note');
  if (d) form.doing = d.value;
  if (n) form.note = n.value;
}
function saveEntry() {
  readText();
  if (!form.activity && !form.doing.trim()) {
    toast('지금 하는 일을 골라 주세요');
    $('#fact-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const e = normalizeEntry({ ...form, at: toStr(new Date()), doing: form.doing.trim(), note: form.note.trim(), urge: form.urges.length ? form.urge : null });
  if (!e) return;
  const wasExisting = form.existing;
  state.entries[e.slot] = e;
  if (!save()) return;
  askPersist();
  toast(`${slotTitle(e.slot)} ${wasExisting ? '수정했어요' : '기록했어요'}`);
  form = blankForm(e.slot);
  renderNow();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- 하루 화면 ---------- */
function topCounts(list, n) {
  const m = new Map();
  for (const x of list) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
function moodColor(v) { return v ? `var(--m${v})` : 'var(--line)'; }

function renderDay() {
  const today = dayOf(new Date());
  const nowSlot = slotOf(new Date());
  const day = dayCursor;
  const slots = daySlots(day);
  const ents = slots.map(s => state.entries[s]).filter(Boolean);
  const moods = ents.map(e => e.mood).filter(v => v != null);
  const energies = ents.map(e => e.energy).filter(v => v != null);
  const emo = topCounts(ents.flatMap(e => e.emotions), 4);
  const urg = topCounts(ents.flatMap(e => e.urges), 4);
  const rf = state.reflect[day] || {};
  const fmt = v => v == null ? '–' : v.toFixed(1);
  $('#view-day').innerHTML = `<h1>하루</h1>
    <div class="daynav">
      <button data-act="day-prev" aria-label="전날">‹</button>
      <b>${esc(relDay(day) === '오늘' || relDay(day) === '어제' ? relDay(day) + ' · ' + dateLabel(day) : dateLabel(day))}</b>
      <button data-act="day-next" aria-label="다음날" ${day >= today ? 'disabled style="opacity:.35"' : ''}>›</button>
    </div>
    <div class="card">
      <div class="stats">
        <div><b>${ents.length}</b><span>기록한 시간</span></div>
        <div><b>${fmt(avg(moods))}</b><span>평균 기분 (1~5)</span></div>
        <div><b>${fmt(avg(energies))}</b><span>평균 에너지 (1~5)</span></div>
      </div>
      ${emo.length || urg.length ? `<p class="small" style="margin:12px 2px 0">${emo.length ? `<span class="muted">자주 느낀 감정</span> ${emo.map(([k, c]) => `${esc(k)} ${c}`).join(' · ')}` : ''}${emo.length && urg.length ? '<br>' : ''}${urg.length ? `<span class="muted">올라온 욕구</span> <span style="color:var(--urge)">${urg.map(([k, c]) => `${esc(k)} ${c}`).join(' · ')}</span>` : ''}</p>` : ''}
    </div>
    <div class="card tl">${slots.map(s => {
      const e = state.entries[s];
      const future = s > nowSlot;
      if (!e) return `<button class="tl-row" data-act="open-slot" data-v="${s}" ${future ? 'disabled' : ''}><span class="tl-h">${slotHour(s)}시</span><span class="tl-empty">${future ? '' : '기록 없음 · 눌러서 채우기'}</span></button>`;
      const meta = [e.mood ? `기분 ${MOOD[e.mood - 1]}` : '', e.energy ? `에너지 ${ENERGY[e.energy - 1]}` : '', e.emotions.join(', ')].filter(Boolean).join(' · ');
      return `<button class="tl-row" data-act="open-slot" data-v="${s}">
        <span class="tl-h">${slotHour(s)}시</span>
        <span class="tl-body">
          <span class="tl-doing"><span class="dot" style="background:${moodColor(e.mood)}"></span>${esc([e.activity, e.doing].filter(Boolean).join(' · '))}</span>
          ${meta ? `<span class="tl-meta">${esc(meta)}</span>` : ''}
          ${e.urges.length ? `<span class="tl-urge">욕구: ${esc(e.urges.join(', '))}${e.urge != null ? ` (세기 ${e.urge})` : ''}</span>` : ''}
          ${e.note ? `<span class="tl-note">${esc(e.note)}</span>` : ''}
        </span></button>`;
    }).join('')}</div>
    <div class="card">
      <div class="q"><span>하루 돌아보기</span></div>
      <label class="muted small" for="rf-text">오늘 알아차린 것, 되풀이된 패턴</label>
      <textarea id="rf-text" rows="3" maxlength="4000" style="margin:6px 0 12px" placeholder="예: 오후 회의가 끝날 때마다 담배 생각이 났다">${esc(rf.text || '')}</textarea>
      <label class="muted small" for="rf-tom">내일 해 볼 한 가지</label>
      <textarea id="rf-tom" rows="2" maxlength="2000" style="margin-top:6px" placeholder="예: 회의 끝나면 5분 걷기">${esc(rf.tomorrow || '')}</textarea>
      <button class="secondary" data-act="save-reflect">돌아보기 저장</button>
    </div>`;
}

/* ---------- 패턴 화면 ---------- */
function hourChart(values, max, cls, label) {
  const W = 328, H = 118, top = 8, bottom = 18, ch = H - top - bottom, gw = W / HOURS.length;
  let out = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(label)}">`;
  out += `<line x1="0" x2="${W}" y1="${top + ch}" y2="${top + ch}" class="grid"/><line x1="0" x2="${W}" y1="${top}" y2="${top}" class="grid"/>`;
  out += `<text x="${W - 1}" y="${top + 10}" class="ax" text-anchor="end">${max}</text>`;
  HOURS.forEach((h, i) => {
    const v = values[h];
    if (v != null) {
      const hh = Math.max(2, (v / max) * ch);
      out += `<rect x="${(i * gw + 3).toFixed(1)}" y="${(top + ch - hh).toFixed(1)}" width="${(gw - 6).toFixed(1)}" height="${hh.toFixed(1)}" rx="2" class="${cls}"><title>${h}시 ${v.toFixed(1)}</title></rect>`;
    }
    if (h % 3 === 0) out += `<text x="${(i * gw + gw / 2).toFixed(1)}" y="${H - 3}" class="ax" text-anchor="middle">${h}시</text>`;
  });
  return out + '</svg>';
}
function barsHTML(rows, max, cls, fmt) {
  return `<div class="bars">${rows.map(([k, v]) => `<div class="bar ${cls || ''}"><span>${esc(k)}</span><span><i style="width:${Math.max(4, (v / max) * 100).toFixed(0)}%"></i></span><span>${fmt ? fmt(v) : v}</span></div>`).join('')}</div>`;
}

function renderPattern() {
  const since = dayOf(addDays(new Date(), -(patternDays - 1)));
  const ents = Object.values(state.entries).filter(e => slotDay(e.slot) >= since);
  const head = `<h1>패턴</h1><div class="seg" role="group" aria-label="기간" style="margin-bottom:12px">${[7, 30].map(n => `<button data-act="period" data-v="${n}" aria-pressed="${patternDays === n}">최근 ${n}일</button>`).join('')}</div>`;
  if (!ents.length) {
    $('#view-pattern').innerHTML = head + '<div class="card empty"><p><b>아직 기록이 없어요</b></p><p class="muted">며칠 기록이 쌓이면 시간대·활동별로 기분과 욕구가 어떻게 움직이는지 보여 드려요.</p></div>';
    return;
  }
  const byHour = (pick) => {
    const out = {};
    for (const h of HOURS) {
      const xs = ents.filter(e => slotHour(e.slot) === h).map(pick).filter(v => v != null);
      out[h] = xs.length ? avg(xs) : null;
    }
    return out;
  };
  const moodHour = byHour(e => e.mood);
  const urgeHour = byHour(e => e.urges.length ? (e.urge != null ? e.urge : null) : 0);
  const emo = topCounts(ents.flatMap(e => e.emotions), 8);
  const urgeNames = topCounts(ents.flatMap(e => e.urges), 5);
  const insights = urgeNames.map(([u, c]) => {
    const hits = ents.filter(e => e.urges.includes(u));
    // 1등이 뚜렷할 때만 '주로/가장 많음'이라고 쓰고, 동률이면 나온 것을 나열한다.
    const acts = topCounts(hits.map(e => e.activity).filter(Boolean), 9);
    const hours = topCounts(hits.map(e => slotHour(e.slot)), 24);
    const actText = !acts.length ? '' : (acts[0][1] > 1 && (acts.length === 1 || acts[0][1] > acts[1][1])) ? `주로 '${esc(acts[0][0])}' 중`
      : `'${acts.filter(a => a[1] === acts[0][1]).slice(0, 3).map(a => esc(a[0])).join("'·'")}' 중`;
    const hourText = !hours.length ? '' : (hours[0][1] > 1 && (hours.length === 1 || hours[0][1] > hours[1][1])) ? `${hours[0][0]}시 무렵 가장 많음`
      : `${hours.filter(h => h[1] === hours[0][1]).map(h => h[0]).sort((a, b) => a - b).slice(0, 5).join('·')}시`;
    const co = topCounts(hits.flatMap(e => e.emotions), 2).map(x => x[0]);
    const lv = avg(hits.map(e => e.urge).filter(v => v != null));
    return `<div class="insight"><b>${esc(u)}</b> ${c}번${lv != null ? ` · 평균 세기 ${lv.toFixed(1)}` : ''}<br><span class="muted small">${[
      actText, hourText, co.length ? `같이 느낀 감정: ${co.map(esc).join(', ')}` : '',
    ].filter(Boolean).join(' · ')}</span></div>`;
  }).join('');
  const actRows = topCounts(ents.map(e => e.activity).filter(Boolean), 8).map(([a]) => {
    const ms = ents.filter(e => e.activity === a && e.mood != null).map(e => e.mood);
    return [a, ms.length ? avg(ms) : 0];
  }).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
  $('#view-pattern').innerHTML = head + `
    <div class="card"><div class="q"><span>시간대별 평균 기분</span><small class="muted">1~5</small></div>${hourChart(moodHour, 5, 'b-mood', '시간대별 평균 기분')}</div>
    <div class="card"><div class="q"><span>시간대별 욕구 세기</span><small class="muted">0~10, 욕구 없던 시간은 0</small></div>${hourChart(urgeHour, 10, 'b-urge', '시간대별 평균 욕구 세기')}</div>
    ${insights ? `<div class="card"><div class="q"><span>욕구가 올라온 순간</span></div>${insights}</div>` : ''}
    ${emo.length ? `<div class="card"><div class="q"><span>자주 느낀 감정</span><small class="muted">횟수</small></div>${barsHTML(emo, emo[0][1])}</div>` : ''}
    ${actRows.length ? `<div class="card"><div class="q"><span>활동별 평균 기분</span><small class="muted">1~5</small></div>${barsHTML(actRows, 5, '', v => v.toFixed(1))}</div>` : ''}
    <p class="muted small" style="text-align:center">최근 ${patternDays}일 · 기록 ${ents.length}개 기준</p>`;
}

/* ---------- 설정 화면 ---------- */
function ago(iso) { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? '오늘' : d + '일 전'; }
function renderMore() {
  const n = Object.keys(state.entries).length;
  const days = new Set(Object.keys(state.entries).map(slotDay)).size;
  $('#view-more').innerHTML = `<h1>설정</h1>
    <div class="card">
      <b>알림</b>
      <p class="muted small">매일 <b>${HOURS[0]}시부터 ${HOURS[HOURS.length - 1]}시까지 정각마다</b> 아이폰 캘린더의 <b>시간일기</b> 캘린더가 알림을 보내요. 알림이 오면 이 앱을 열어 기록하면 돼요.</p>
      <p class="muted small">알림 시간을 바꾸고 싶으면 Claude에게 말해 주세요. 캘린더와 앱을 함께 고쳐요.</p>
    </div>
    <div class="card">
      <b>백업</b>
      <p class="muted small">기록은 이 아이폰의 홈 화면 앱 안에만 저장돼요. 홈 화면 아이콘을 지우면 기록도 함께 지워지니 가끔 백업해 두세요. ${state.lastBackup ? `마지막 백업은 <b>${ago(state.lastBackup)}</b>이에요.` : '아직 백업한 적이 없어요.'}</p>
      <button class="secondary" data-act="exp-json">전체 백업 파일 받기</button>
      <button class="secondary" data-act="exp-csv">엑셀용 CSV 받기</button>
      <label class="secondary">백업 파일로 되살리기<input type="file" id="imp-json" class="vh" accept=".json,application/json"></label>
    </div>
    <div class="card">
      <b>저장 상태</b>
      <p class="muted small">기록 ${n}개 · ${days}일</p>
      <button class="danger" data-act="wipe">모든 기록 지우기</button>
    </div>`;
}

const csvCell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
function toCSV() {
  const head = ['날짜', '시각', '활동', '하는 일', '기분(1-5)', '에너지(1-5)', '감정', '욕구', '욕구 세기', '알아차림', '기록한 때'];
  const rows = Object.values(state.entries).sort((a, b) => a.slot.localeCompare(b.slot)).map(e => [
    slotDay(e.slot), `${slotHour(e.slot)}시`, e.activity, e.doing, e.mood, e.energy, e.emotions.join(', '), e.urges.join(', '), e.urge, e.note, e.at,
  ]);
  return '﻿' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
async function offerFile(name, text, mime) {
  const file = new File([text], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; }
    catch (e) { if (e && e.name === 'AbortError') return false; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return true;
}
async function restoreJSON(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || data.app !== 'hourly' || !Array.isArray(data.entries)) throw new Error('bad');
    let added = 0;
    for (const raw of data.entries) {
      const e = normalizeEntry(raw);
      if (e && !state.entries[e.slot]) { state.entries[e.slot] = e; added++; }
    }
    if (data.reflect && typeof data.reflect === 'object') {
      for (const [k, v] of Object.entries(data.reflect)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v && typeof v === 'object' && !state.reflect[k]) {
          state.reflect[k] = { text: String(v.text || '').slice(0, 4000), tomorrow: String(v.tomorrow || '').slice(0, 2000) };
        }
      }
    }
    save();
    toast(`${added}개 기록을 되살렸어요`);
    render();
  } catch (e) {
    toast('시간일기 백업 파일이 아니에요');
  }
}

/* ---------- 화면 전환 ---------- */
function go(v) {
  view = v;
  for (const id of ['now', 'day', 'pattern', 'more']) $('#view-' + id).hidden = id !== v;
  document.querySelectorAll('.tabs button').forEach(b => {
    if (b.dataset.v === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  render();
  window.scrollTo(0, 0);
}
function render() {
  if (view === 'now') renderNow();
  if (view === 'day') renderDay();
  if (view === 'pattern') renderPattern();
  if (view === 'more') renderMore();
}
// 아직 아무것도 입력하지 않은 새 기록 화면인지
const isUntouched = () => !form.existing && !form.activity && !form.doing && !form.note && !form.emotions.length && !form.urges.length && form.mood == null && form.energy == null;
const toggle = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : arr.concat(v);

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act, v = b.dataset.v;
  if (view === 'now') readText();
  switch (act) {
    case 'tab':
      if (v === 'now' && view !== 'now' && isUntouched()) form = blankForm(slotOf(new Date()));
      go(v); break;
    case 'slot': form = blankForm(v); renderNow(); break;
    case 'activity': form.activity = form.activity === v ? '' : v; renderNow(); break;
    case 'mood': form.mood = form.mood === +v ? null : +v; renderNow(); break;
    case 'energy': form.energy = form.energy === +v ? null : +v; renderNow(); break;
    case 'emotion': form.emotions = toggle(form.emotions, v); renderNow(); break;
    case 'urge-pick': form.urges = toggle(form.urges, v); renderNow(); break;
    case 'urge-level': form.urge = +v; renderNow(); break;
    case 'save': saveEntry(); break;
    case 'delete':
      if (confirm(`${slotTitle(form.slot)} 기록을 지울까요?`)) {
        delete state.entries[form.slot]; save(); toast('지웠어요'); form = blankForm(form.slot); renderNow();
      }
      break;
    case 'open-slot': form = blankForm(v); go('now'); break;
    case 'day-prev': dayCursor = dayOf(addDays(parseDay(dayCursor), -1)); renderDay(); break;
    case 'day-next': if (dayCursor < dayOf(new Date())) { dayCursor = dayOf(addDays(parseDay(dayCursor), 1)); renderDay(); } break;
    case 'save-reflect': {
      const text = ($('#rf-text').value || '').trim(), tomorrow = ($('#rf-tom').value || '').trim();
      if (text || tomorrow) state.reflect[dayCursor] = { text, tomorrow }; else delete state.reflect[dayCursor];
      if (save()) toast('돌아보기를 저장했어요');
      break;
    }
    case 'period': patternDays = +v; renderPattern(); break;
    case 'exp-json': {
      const data = { app: 'hourly', v: 1, exportedAt: new Date().toISOString(), entries: Object.values(state.entries), reflect: state.reflect };
      offerFile(`hourly-backup-${dayOf(new Date())}.json`, JSON.stringify(data, null, 1), 'application/json').then(ok => {
        if (ok) { state.lastBackup = new Date().toISOString(); save(); renderMore(); }
      });
      break;
    }
    case 'exp-csv':
      if (!Object.keys(state.entries).length) { toast('기록이 없어요'); break; }
      offerFile(`hourly-${dayOf(new Date())}.csv`, toCSV(), 'text/csv');
      break;
    case 'wipe':
      if (confirm('모든 기록을 지울까요? 되돌릴 수 없어요.') && confirm('정말 지울까요? 백업이 없으면 기록이 사라져요.')) {
        state.entries = {}; state.reflect = {}; save(); toast('모든 기록을 지웠어요'); form = blankForm(slotOf(new Date())); render();
      }
      break;
  }
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.id === 'imp-json' && t.files && t.files[0]) restoreJSON(t.files[0]);
});
// 앱을 다시 열었을 때 시간이 바뀌었으면, 비어 있는 새 기록 화면을 지금 시각으로 옮긴다.
document.addEventListener('visibilitychange', () => {
  if (document.hidden || view !== 'now') return;
  readText();
  const nowSlot = slotOf(new Date());
  if (isUntouched() && form.slot !== nowSlot) form = blankForm(nowSlot);
  renderNow();
});

render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
