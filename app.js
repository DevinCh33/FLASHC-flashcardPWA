// ===== DATA =====
let questions = [];
let progress = {}; // { id: { level: 0|1|2, lastSeen: timestamp } }
let settings = { shuffle: true, showNum: true };
let studyDeck = [];
let studyIndex = 0;
let quizDeck = [];
let quizIndex = 0;
let quizScore = 0;
let quizAnswered = false;

// ===== INIT =====
async function init() {
  // Load questions: prefer custom imported, fall back to bundled
  const custom = localStorage.getItem('ceh-custom-questions');
  if (custom) {
    try {
      questions = JSON.parse(custom);
    } catch (e) {
      console.warn('Bad custom questions data, falling back to bundled');
      const resp = await fetch('data/all-questions.json');
      questions = await resp.json();
    }
  } else {
    const resp = await fetch('data/all-questions.json');
    questions = await resp.json();
  }

  // Load saved progress
  const saved = localStorage.getItem('ceh-progress');
  if (saved) progress = JSON.parse(saved);

  // Load settings
  const savedSettings = localStorage.getItem('ceh-settings');
  if (savedSettings) {
    settings = JSON.parse(savedSettings);
    document.getElementById('opt-shuffle').checked = settings.shuffle;
    document.getElementById('opt-show-num').checked = settings.showNum;
  }

  document.getElementById('total-q').textContent = questions.length;
  updateStats();

  // Run duplicate detection in background
  setTimeout(function() { findDuplicates(); }, 100);
}

// ===== GITHUB SYNC =====
// Configure your repo here
const GITHUB_REPO = 'DevinCh33/FLASHC-flashcardPWA';
const GITHUB_BRANCH = 'main';
const SYNC_FILE = 'data/all-questions.json';

function getSyncUrl() {
  return 'https://raw.githubusercontent.com/' + GITHUB_REPO + '/' + GITHUB_BRANCH + '/' + SYNC_FILE + '?t=' + Date.now();
}

async function syncFromGitHub() {
  const statusEl = document.getElementById('sync-status');
  if (statusEl) statusEl.textContent = 'Syncing...';

  try {
    const resp = await fetch(getSyncUrl());
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const remoteQuestions = await resp.json();

    if (!Array.isArray(remoteQuestions) || remoteQuestions.length === 0) {
      throw new Error('Empty or invalid question data');
    }

    // Merge: keep local questions, add new ones from remote
    const localIds = new Set(questions.map(q => normalizeForComparison(q.question)));
    let added = 0;
    let nextId = questions.length > 0 ? Math.max(...questions.map(q => q.id)) + 1 : 1;

    remoteQuestions.forEach(function(rq) {
      const norm = normalizeForComparison(rq.question);
      if (!localIds.has(norm)) {
        rq.id = nextId++;
        questions.push(rq);
        localIds.add(norm);
        added++;
      }
    });

    // Save merged set
    localStorage.setItem('ceh-custom-questions', JSON.stringify(questions));
    document.getElementById('total-q').textContent = questions.length;
    updateStats();
    setTimeout(function() { findDuplicates(); }, 50);

    if (statusEl) statusEl.textContent = 'Synced! +' + added + ' new (total: ' + questions.length + ')';
    if (added === 0 && statusEl) statusEl.textContent = 'Up to date (' + questions.length + ' questions)';

  } catch (err) {
    console.error('Sync failed:', err);
    if (statusEl) statusEl.textContent = 'Sync failed: ' + err.message;
  }
}

// ===== PERSISTENCE =====
function saveProgress() {
  localStorage.setItem('ceh-progress', JSON.stringify(progress));
}

function saveSetting(key, value) {
  settings[key] = value;
  localStorage.setItem('ceh-settings', JSON.stringify(settings));
}

function resetProgress() {
  if (confirm('Reset all progress? This cannot be undone.')) {
    progress = {};
    saveProgress();
    updateStats();
    showView('home');
  }
}

// ===== STATS =====
function getStats() {
  let mastered = 0, learning = 0, unseen = 0;
  questions.forEach(q => {
    const p = progress[q.id];
    if (!p) unseen++;
    else if (p.level >= 2) mastered++;
    else learning++;
  });
  return { mastered, learning, unseen, total: questions.length };
}

function updateStats() {
  const s = getStats();

  document.getElementById('h-mastered').textContent = s.mastered;
  document.getElementById('h-learning').textContent = s.learning;
  document.getElementById('h-unseen').textContent = s.unseen;

  document.getElementById('s-mastered').textContent = s.mastered;
  document.getElementById('s-learning').textContent = s.learning;
  document.getElementById('s-unseen').textContent = s.unseen;

  const pct = s.total > 0 ? Math.round((s.mastered / s.total) * 100) : 0;
  document.getElementById('pct').textContent = pct + '%';

  // Update progress ring
  const ring = document.getElementById('progress-ring');
  const circumference = 2 * Math.PI * 70;
  const offset = circumference - (pct / 100) * circumference;
  ring.style.strokeDashoffset = offset;
}

// ===== NAVIGATION =====
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId + '-view').classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === viewId);
  });

  if (viewId === 'home') updateStats();
  if (viewId === 'bank') renderBank();
}

// ===== STUDY MODE =====
function startStudy(mode) {
  let deck;
  if (mode === 'weak') {
    deck = questions.filter(q => {
      const p = progress[q.id];
      return !p || p.level < 2;
    });
    if (deck.length === 0) {
      alert('All cards mastered! Nice work. Try "Study All" to review.');
      return;
    }
  } else {
    deck = [...questions];
  }

  if (settings.shuffle) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  studyDeck = deck;
  studyIndex = 0;
  showView('study');
  showStudyCard();
}

function showStudyCard() {
  if (studyIndex >= studyDeck.length) {
    showView('home');
    return;
  }

  const q = studyDeck[studyIndex];
  const card = document.getElementById('flashcard');
  card.classList.remove('flipped');

  document.getElementById('card-badge').textContent = `Question ${q.id}`;
  document.getElementById('card-question').textContent = q.question;

  // Build back side
  const optionsDiv = document.getElementById('card-options');
  optionsDiv.innerHTML = '';

  const answerLetters = q.answer.split('');
  const isMulti = answerLetters.length > 1;

  if (isMulti) {
    const note = document.createElement('div');
    note.className = 'multi-answer-note';
    note.textContent = `Multiple answers: ${answerLetters.join(', ')}`;
    optionsDiv.appendChild(note);
  }

  Object.entries(q.options).forEach(([letter, text]) => {
    const div = document.createElement('div');
    div.className = 'option-item';
    if (answerLetters.includes(letter)) {
      div.classList.add('correct');
      div.textContent = `${letter}. ${text} ✓`;
    } else {
      div.classList.add('incorrect');
      div.textContent = `${letter}. ${text}`;
    }
    optionsDiv.appendChild(div);
  });

  document.getElementById('answer-actions').style.visibility = 'hidden';
  document.getElementById('study-count').textContent = `${studyIndex + 1}/${studyDeck.length}`;
  document.getElementById('study-progress').style.width = `${((studyIndex + 1) / studyDeck.length) * 100}%`;
}

function flipCard() {
  const card = document.getElementById('flashcard');
  if (!card.classList.contains('flipped')) {
    card.classList.add('flipped');
    document.getElementById('answer-actions').style.visibility = 'visible';
  }
}

function rateCard(level) {
  const q = studyDeck[studyIndex];
  progress[q.id] = { level, lastSeen: Date.now() };
  saveProgress();
  studyIndex++;
  showStudyCard();
}

// ===== QUIZ MODE =====
function startQuiz() {
  const shuffled = [...questions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Filter to single-answer questions for quiz mode (cleaner UX)
  const singleAnswer = shuffled.filter(q => q.answer.length === 1);
  quizDeck = singleAnswer.slice(0, 10);

  if (quizDeck.length < 10) {
    // If not enough single-answer, allow multi
    const remaining = shuffled.filter(q => q.answer.length > 1);
    quizDeck = quizDeck.concat(remaining.slice(0, 10 - quizDeck.length));
  }

  quizIndex = 0;
  quizScore = 0;
  quizAnswered = false;

  document.getElementById('quiz-results').style.display = 'none';

  showView('quiz');
  showQuizQuestion();
}

function showQuizQuestion() {
  if (quizIndex >= quizDeck.length) {
    showQuizResults();
    return;
  }

  quizAnswered = false;
  const q = quizDeck[quizIndex];
  const isMulti = q.answer.length > 1;

  document.getElementById('quiz-badge').textContent = `Question ${quizIndex + 1}`;
  document.getElementById('quiz-question').textContent = q.question;
  document.getElementById('quiz-count').textContent = `${quizIndex + 1}/${quizDeck.length}`;
  document.getElementById('quiz-progress').style.width = `${((quizIndex + 1) / quizDeck.length) * 100}%`;
  document.getElementById('quiz-next-area').style.display = 'none';

  const multiNote = document.getElementById('quiz-multi-note');
  if (isMulti) {
    multiNote.innerHTML = `<div class="multi-answer-note" style="padding: 0 0 8px;">Select answer: ${q.answer.length} correct choices (${q.answer})</div>`;
  } else {
    multiNote.innerHTML = '';
  }

  const optionsDiv = document.getElementById('quiz-options');
  optionsDiv.innerHTML = '';

  Object.entries(q.options).forEach(([letter, text]) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.innerHTML = `<span class="opt-letter">${letter}</span><span>${text}</span>`;
    btn.onclick = () => selectQuizOption(btn, letter);
    optionsDiv.appendChild(btn);
  });
}

function selectQuizOption(btn, selected) {
  if (quizAnswered) return;
  quizAnswered = true;

  const q = quizDeck[quizIndex];
  const answerLetters = q.answer.split('');
  const isCorrect = answerLetters.length === 1 && answerLetters[0] === selected;

  // Disable all
  document.querySelectorAll('.quiz-option').forEach((opt, idx) => {
    const letter = Object.keys(q.options)[idx];
    opt.classList.add('disabled');
    if (answerLetters.includes(letter)) {
      opt.classList.add('correct-answer');
    }
    if (letter === selected && !answerLetters.includes(selected)) {
      opt.classList.add('wrong-answer');
    }
  });

  if (isCorrect) {
    quizScore++;
    progress[q.id] = { level: 2, lastSeen: Date.now() };
  } else {
    progress[q.id] = { level: 0, lastSeen: Date.now() };
  }
  saveProgress();

  document.getElementById('quiz-next-area').style.display = 'block';
}

function nextQuizQuestion() {
  quizIndex++;
  showQuizQuestion();
}

function showQuizResults() {
  document.querySelector('#quiz-view > div:nth-child(2)').style.display = 'none';
  document.getElementById('quiz-next-area').style.display = 'none';

  const results = document.getElementById('quiz-results');
  results.style.display = 'block';

  const pct = Math.round((quizScore / quizDeck.length) * 100);
  document.getElementById('quiz-score').textContent = `${quizScore}/${quizDeck.length} Correct (${pct}%)`;

  let msg = '';
  if (pct >= 90) msg = 'Excellent! You\'re exam ready! 🔥';
  else if (pct >= 70) msg = 'Good job! Keep reviewing the weak areas.';
  else if (pct >= 50) msg = 'Getting there. Focus on the cards you got wrong.';
  else msg = 'Keep studying! Use the flashcard mode to build knowledge.';

  document.getElementById('quiz-score-sub').textContent = msg;
  updateStats();
}

// Reset quiz view state when showing quiz
const origShowView = showView;
showView = function(viewId) {
  if (viewId === 'quiz') {
    const contentDiv = document.querySelector('#quiz-view > div:nth-child(2)');
    if (contentDiv) contentDiv.style.display = '';
  }
  origShowView(viewId);
};

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
  const studyActive = document.getElementById('study-view').classList.contains('active');
  if (!studyActive) return;

  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    flipCard();
  } else if (e.key === '1') rateCard(0);
  else if (e.key === '2') rateCard(1);
  else if (e.key === '3') rateCard(2);
});

// ===== SERVICE WORKER =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ===== START =====
init();