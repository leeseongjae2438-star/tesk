// -------------------------------------------------------------
// State Management & Global Variables
// -------------------------------------------------------------
let alarms = [];
let audioCtx = null;
let alarmInterval = null;
let activeAlarmSource = null; // 오디오 재생 루프 관리를 위한 변수
let isAlarmRinging = false;
let lastTriggeredTime = ""; // 중복 트리거 방지 (동일 분 내에 한 번만 트리거)

// -------------------------------------------------------------
// DOM Elements
// -------------------------------------------------------------
const liveTimeEl = document.getElementById('live-time');
const liveDateEl = document.getElementById('live-date');
const alarmForm = document.getElementById('alarm-form');
const alarmTimeInput = document.getElementById('alarm-time');
const alarmLabelInput = document.getElementById('alarm-label');
const alarmListContainer = document.getElementById('alarm-list-container');
const alarmCountBadge = document.getElementById('alarm-count');

// Modal Elements
const alarmOverlay = document.getElementById('alarm-trigger-overlay');
const triggeredTimeEl = document.getElementById('triggered-time');
const triggeredLabelEl = document.getElementById('triggered-label');
const btnDismiss = document.getElementById('btn-dismiss-alarm');

// -------------------------------------------------------------
// Init & Event Listeners
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  loadAlarms();
  startClock();
  
  // 첫 사용자 인터랙션 시 AudioContext 사전 초기화 (브라우저 자동재생 차단 우회)
  document.body.addEventListener('click', initAudioContext, { once: true });
  
  // 윈도우 시스템 알림 권한 요청
  requestNotificationPermission();
});

alarmForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addAlarm();
});

btnDismiss.addEventListener('click', dismissAlarm);

// -------------------------------------------------------------
// Clock Functionality
// -------------------------------------------------------------
function startClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  const now = new Date();
  
  // 시간 포맷팅 (HH:MM:SS)
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  liveTimeEl.textContent = `${hours}:${minutes}:${seconds}`;

  // 날짜 포맷팅 (YYYY년 MM월 DD일 요일)
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  const weekDays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const dayName = weekDays[now.getDay()];
  liveDateEl.textContent = `${year}년 ${month}월 ${date}일 ${dayName}`;

  // 매 초마다 알람 매칭 여부 체크
  checkAlarms(hours, minutes);
}

// -------------------------------------------------------------
// Alarm Storage & Render
// -------------------------------------------------------------
function loadAlarms() {
  const saved = localStorage.getItem('neo_alarms');
  if (saved) {
    try {
      alarms = JSON.parse(saved);
    } catch (e) {
      alarms = [];
    }
  }
  renderAlarms();
}

function saveAlarms() {
  localStorage.setItem('neo_alarms', JSON.stringify(alarms));
  renderAlarms();
}

function renderAlarms() {
  alarmListContainer.innerHTML = '';
  const activeAlarmsCount = alarms.filter(a => a.active).length;
  alarmCountBadge.textContent = `${activeAlarmsCount}개 설정됨`;

  if (alarms.length === 0) {
    alarmListContainer.innerHTML = `
      <div class="empty-state">
        <span class="material-icons-round">notifications_off</span>
        <p>등록된 알람이 없습니다.<br>새 알람을 추가해 보세요.</p>
      </div>
    `;
    return;
  }

  // 시간 순으로 정렬하여 렌더링
  const sortedAlarms = [...alarms].sort((a, b) => a.time.localeCompare(b.time));

  sortedAlarms.forEach(alarm => {
    const item = document.createElement('div');
    item.className = `alarm-item ${alarm.active ? '' : 'inactive'}`;
    item.id = `alarm-${alarm.id}`;

    // 12시간제 변환 표시용 텍스트 가공
    const [h, m] = alarm.time.split(':');
    const ampm = parseInt(h) >= 12 ? 'PM' : 'AM';
    const displayHour = parseInt(h) % 12 || 12;
    const timeDisplay = `${ampm} ${String(displayHour).padStart(2, '0')}:${m}`;

    item.innerHTML = `
      <div class="alarm-info">
        <span class="alarm-item-time">${timeDisplay}</span>
        <span class="alarm-item-label">${alarm.label || '지정된 이름 없음'}</span>
      </div>
      <div class="alarm-actions">
        <label class="switch">
          <input type="checkbox" ${alarm.active ? 'checked' : ''} onchange="toggleAlarm('${alarm.id}')">
          <span class="slider"></span>
        </label>
        <button class="btn-delete" onclick="deleteAlarm('${alarm.id}')" title="삭제">
          <span class="material-icons-round">delete_outline</span>
        </button>
      </div>
    `;
    alarmListContainer.appendChild(item);
  });
}

function addAlarm() {
  const time = alarmTimeInput.value;
  const label = alarmLabelInput.value.trim();

  if (!time) return;

  const newAlarm = {
    id: Date.now().toString(),
    time: time,
    label: label,
    active: true
  };

  alarms.push(newAlarm);
  saveAlarms();

  // 폼 리셋
  alarmTimeInput.value = '';
  alarmLabelInput.value = '';
}

window.toggleAlarm = function(id) {
  const alarm = alarms.find(a => a.id === id);
  if (alarm) {
    alarm.active = !alarm.active;
    saveAlarms();
  }
}

window.deleteAlarm = function(id) {
  alarms = alarms.filter(a => a.id !== id);
  saveAlarms();
}

// -------------------------------------------------------------
// Alarm Trigger Matching
// -------------------------------------------------------------
function checkAlarms(currentHour, currentMinute) {
  const currentTimeString = `${currentHour}:${currentMinute}`;

  // 이미 울리고 있거나, 동일한 분에 이미 울렸던 적이 있다면 중복 체크 방지
  if (isAlarmRinging || lastTriggeredTime === currentTimeString) {
    return;
  }

  // 매칭되는 활성 상태 알람 검색
  const matchingAlarm = alarms.find(alarm => alarm.active && alarm.time === currentTimeString);

  if (matchingAlarm) {
    triggerAlarm(matchingAlarm);
  }
}

function triggerAlarm(alarm) {
  isAlarmRinging = true;
  lastTriggeredTime = alarm.time;

  // 오버레이 UI 갱신 및 노출
  triggeredTimeEl.textContent = alarm.time;
  triggeredLabelEl.textContent = alarm.label || "알람";
  alarmOverlay.classList.add('active');

  // 벨소리 연주 시작
  playAlarmSound();

  // 시스템 알림 노출
  showNotification(alarm);
}

function dismissAlarm() {
  isAlarmRinging = false;
  alarmOverlay.classList.remove('active');
  stopAlarmSound();
}

// -------------------------------------------------------------
// Audio Synthesis (Web Audio API)
// -------------------------------------------------------------
function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// 맑고 세련된 느낌의 신시사이저 아르페지오 멜로디 루프 재생
function playAlarmSound() {
  initAudioContext();
  
  // 멜로디 음계 주파수 테이블 (C5, E5, G5, C6)
  const melody = [523.25, 659.25, 783.99, 1046.50];
  let noteIndex = 0;

  function playNextNote() {
    if (!isAlarmRinging) return;

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // 부드러운 음색을 위해 삼각파(Triangle) 사용
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(melody[noteIndex], audioCtx.currentTime);

    // 볼륨 엔벨로프 설정 (틱 노이즈 방지 및 벨소리 디케이 효과)
    const now = audioCtx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05); // Attack
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4); // Release

    osc.start(now);
    osc.stop(now + 0.55);

    // 인덱스 회전
    noteIndex = (noteIndex + 1) % melody.length;

    // 0.25초 간격으로 다음 음 재생
    alarmInterval = setTimeout(playNextNote, 250);
  }

  playNextNote();
}

function stopAlarmSound() {
  if (alarmInterval) {
    clearTimeout(alarmInterval);
    alarmInterval = null;
  }
}

// -------------------------------------------------------------
// System Notification (Windows Toast Notification)
// -------------------------------------------------------------
function requestNotificationPermission() {
  if ('Notification' in window) {
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }
}

function showNotification(alarm) {
  if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification('NEO ALARM', {
      body: `설정한 알람 시간입니다: ${alarm.time}${alarm.label ? ' (' + alarm.label + ')' : ''}`,
      tag: 'neo-alarm-trigger',
      requireInteraction: true // 사용자가 닫을 때까지 알림이 화면에 계속 유지되도록 설정
    });

    notification.onclick = () => {
      window.focus();
      dismissAlarm();
    };
  }
}
