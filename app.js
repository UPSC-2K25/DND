/**
 * UPSC CSE Prelims Current Affairs Mock Test Engine
 * Dynamic Monthly Split Loader + Dual-View Passage Mode
 */

// Global State
var state = {
  monthsIndex: [],        // Manifest of month files loaded from data/index.json
  loadedMonthData: {},    // Cache: { "2026-01": [ ...questions ] }
  selectedMonth: 'all',   // 'all' or specific month id
  rawQuestions: [],       // Combined questions for current filter
  activeQuestions: [],    // Filtered pool based on Subject / Year
  currentIndex: 0,
  userResponses: {},      // { [qIndex]: selectedOptionIndex }
  markedForReview: new Set(),
  visitedIndices: new Set(),
  mode: 'practice',       // 'practice' | 'exam'
  isReviewMode: false,    // true after exam is submitted
  timerSecondsRemaining: 0,
  timerInterval: null
};

// Cached DOM Elements
var el = {
  mainLayout: document.getElementById('main-layout'),
  passageContainer: document.getElementById('passage-container'),
  passageContent: document.getElementById('passage-content'),

  badgeQno: document.getElementById('badge-qno'),
  badgeSubject: document.getElementById('badge-subject'),
  badgeDate: document.getElementById('badge-date'),
  badgeYear: document.getElementById('badge-year'),
  modeStatusBadge: document.getElementById('mode-status-badge'),

  questionText: document.getElementById('question-text'),
  optionsContainer: document.getElementById('options-container'),
  paletteGrid: document.getElementById('palette-grid'),
  paletteStats: document.getElementById('palette-stats'),

  filterMonth: document.getElementById('filter-month'),
  filterSubject: document.getElementById('filter-subject'),
  filterYear: document.getElementById('filter-year'),
  btnRestart: document.getElementById('btn-restart'),
  modeRadios: document.querySelectorAll('input[name="test-mode"]'),

  btnPrev: document.getElementById('btn-prev'),
  btnNext: document.getElementById('btn-next'),
  btnClear: document.getElementById('btn-clear'),
  btnMark: document.getElementById('btn-mark'),
  btnSubmitExam: document.getElementById('btn-submit-exam'),

  timerBox: document.getElementById('timer-box'),
  timerDisplay: document.getElementById('timer-display'),

  scorecardModal: document.getElementById('scorecard-modal'),
  btnCloseScorecard: document.getElementById('btn-close-scorecard'),
  btnReviewAnswers: document.getElementById('btn-review-answers'),
  btnRetakeTest: document.getElementById('btn-retake-test'),
  resTotalMarks: document.getElementById('res-total-marks'),
  resAccuracy: document.getElementById('res-accuracy'),
  resRawScore: document.getElementById('res-raw-score'),
  resTotalQ: document.getElementById('res-total-q'),
  resAttempted: document.getElementById('res-attempted'),
  resCorrect: document.getElementById('res-correct'),
  resIncorrect: document.getElementById('res-incorrect'),
  resUnattempted: document.getElementById('res-unattempted')
};

// ==============================================================
// 1. MONTHLY JSON MANIFEST & DYNAMIC LOADER
// ==============================================================
async function initAppData() {
  try {
    var res = await fetch('data/index.json');
    if (res.ok) {
      state.monthsIndex = await res.json();
      populateMonthDropdown(state.monthsIndex);
      await loadMonthlyData(state.selectedMonth);
    } else {
      console.warn('data/index.json not found. Attempting direct fallback.');
      el.questionText.textContent = 'Failed to load data/index.json. Ensure the data directory exists.';
    }
  } catch (err) {
    console.error('Initialization error:', err);
    el.questionText.textContent = 'Error connecting to data repository. If viewing locally, use a local server or GitHub Pages.';
  }
}

function populateMonthDropdown(months) {
  el.filterMonth.innerHTML = '';

  var allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All Months (Cumulative)';
  el.filterMonth.appendChild(allOpt);

  months.forEach(function (m) {
    var opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    el.filterMonth.appendChild(opt);
  });
}

// Fetch single or multiple monthly JSON files
async function loadMonthlyData(monthId) {
  var filesToFetch = [];

  if (monthId === 'all') {
    state.monthsIndex.forEach(function (m) {
      if (!state.loadedMonthData[m.id]) {
        filesToFetch.push(m);
      }
    });
  } else {
    var found = state.monthsIndex.find(function (m) { return m.id === monthId; });
    if (found && !state.loadedMonthData[found.id]) {
      filesToFetch.push(found);
    }
  }

  // Fetch missing months concurrently
  var promises = filesToFetch.map(async function (item) {
    try {
      var res = await fetch(item.file);
      if (res.ok) {
        var data = await res.json();
        state.loadedMonthData[item.id] = data;
      }
    } catch (e) {
      console.error('Failed to load file: ' + item.file, e);
    }
  });

  await Promise.all(promises);

  // Compile active raw pool based on month filter
  var combined = [];
  if (monthId === 'all') {
    state.monthsIndex.forEach(function (m) {
      if (state.loadedMonthData[m.id]) {
        combined = combined.concat(state.loadedMonthData[m.id]);
      }
    });
  } else if (state.loadedMonthData[monthId]) {
    combined = state.loadedMonthData[monthId].slice();
  }

  state.rawQuestions = combined;
  populateSubjectAndYearFilters(state.rawQuestions);
  applyFiltersAndResetSession();
}

function populateSubjectAndYearFilters(questions) {
  var subjects = new Set();
  var years = new Set();

  questions.forEach(function (q) {
    if (q.subject) subjects.add(q.subject);
    if (q.year) years.add(q.year);
  });

  el.filterSubject.innerHTML = '<option value="all">All Subjects</option>';
  Array.from(subjects).sort().forEach(function (sub) {
    var opt = document.createElement('option');
    opt.value = sub;
    opt.textContent = sub;
    el.filterSubject.appendChild(opt);
  });

  el.filterYear.innerHTML = '<option value="all">All Years</option>';
  Array.from(years).sort(function (a, b) { return b - a; }).forEach(function (yr) {
    var opt = document.createElement('option');
    opt.value = yr;
    opt.textContent = yr;
    el.filterYear.appendChild(opt);
  });
}

// ==============================================================
// 2. SESSION & PASSAGE VISIBILITY CONTROLLER
// ==============================================================
function applyFiltersAndResetSession() {
  var selSubject = el.filterSubject.value;
  var selYear = el.filterYear.value;

  state.activeQuestions = state.rawQuestions.filter(function (q) {
    var matchSub = (selSubject === 'all') || (q.subject === selSubject);
    var matchYr = (selYear === 'all') || (String(q.year) === String(selYear));
    return matchSub && matchYr;
  });

  state.currentIndex = 0;
  state.userResponses = {};
  state.markedForReview.clear();
  state.visitedIndices.clear();
  state.isReviewMode = false;

  var activeModeRadio = document.querySelector('input[name="test-mode"]:checked');
  state.mode = activeModeRadio ? activeModeRadio.value : 'practice';

  updateLayoutViewMode();
  setupTimer();
  renderPalette();
  loadQuestion(state.currentIndex);
}

// Controls whether passage is displayed or hidden
function updateLayoutViewMode() {
  var showPassage = (state.mode === 'practice') || state.isReviewMode;

  if (showPassage) {
    el.passageContainer.classList.remove('hidden');
    el.mainLayout.className = 'test-layout layout-dual';
    el.modeStatusBadge.textContent = state.isReviewMode ? 'REVIEW MODE (PASSAGES ON)' : 'PRACTICE MODE';
    el.modeStatusBadge.className = state.isReviewMode ? 'badge badge-accent' : 'badge';
  } else {
    // Exam mode (Mock test): Hide passage completely
    el.passageContainer.classList.add('hidden');
    el.mainLayout.className = 'test-layout layout-single';
    el.modeStatusBadge.textContent = 'MOCK EXAM (PASSAGE HIDDEN)';
    el.modeStatusBadge.className = 'badge badge-accent';
  }
}

// ==============================================================
// 3. EXAM TIMER
// ==============================================================
function setupTimer() {
  clearInterval(state.timerInterval);

  if (state.mode === 'exam' && !state.isReviewMode) {
    el.timerBox.classList.remove('hidden');
    el.btnSubmitExam.classList.remove('hidden');
    // UPSC GS standard: 1.2 minutes per question
    state.timerSecondsRemaining = Math.max(state.activeQuestions.length * 72, 120);
    renderTimer();

    state.timerInterval = setInterval(function () {
      state.timerSecondsRemaining--;
      renderTimer();
      if (state.timerSecondsRemaining <= 0) {
        clearInterval(state.timerInterval);
        alert('Time is up! Your answers are being submitted.');
        submitExam();
      }
    }, 1000);
  } else {
    el.timerBox.classList.add('hidden');
    el.btnSubmitExam.classList.add('hidden');
  }
}

function renderTimer() {
  var m = Math.floor(state.timerSecondsRemaining / 60);
  var s = state.timerSecondsRemaining % 60;
  el.timerDisplay.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ==============================================================
// 4. QUESTION & PASSAGE RENDERING
// ==============================================================
function loadQuestion(index) {
  if (state.activeQuestions.length === 0) {
    el.questionText.textContent = 'No questions match the selected filters. Please adjust month, subject, or year.';
    el.passageContent.textContent = 'No passage available.';
    el.optionsContainer.innerHTML = '';
    return;
  }

  state.currentIndex = index;
  state.visitedIndices.add(index);

  var q = state.activeQuestions[index];

  // Set Metadata Badges
  el.badgeQno.textContent = 'Q ' + (index + 1) + ' of ' + state.activeQuestions.length;
  el.badgeSubject.textContent = q.subject || 'General Studies';
  el.badgeDate.textContent = q.date || 'Current Affairs';
  el.badgeYear.textContent = q.year || '2026';

  // Left Column: Inject Passage
  if (q.passage && q.passage.trim() !== '') {
    el.passageContent.textContent = q.passage;
  } else {
    el.passageContent.textContent = 'No source passage attached for this item.';
  }

  // Question Stem
  el.questionText.textContent = q.question;
  el.optionsContainer.innerHTML = '';

  var selectedAnswer = state.userResponses[index];
  var prefixes = ['(a)', '(b)', '(c)', '(d)', '(e)', '(f)'];

  q.options.forEach(function (optText, optIdx) {
    var card = document.createElement('div');
    card.className = 'option-card';

    if (selectedAnswer === optIdx) {
      card.classList.add('selected');
    }

    // Correct / Incorrect evaluation (In practice mode or review mode)
    var isEvalMode = (state.mode === 'practice' && selectedAnswer !== undefined) || state.isReviewMode;
    if (isEvalMode) {
      if (optIdx === q.answer) {
        card.classList.add('correct');
      } else if (optIdx === selectedAnswer) {
        card.classList.add('incorrect');
      }
    }

    var prefixSpan = document.createElement('span');
    prefixSpan.className = 'opt-prefix';
    prefixSpan.textContent = prefixes[optIdx] || '(' + (optIdx + 1) + ')';

    var textSpan = document.createElement('span');
    textSpan.textContent = optText;

    card.appendChild(prefixSpan);
    card.appendChild(textSpan);

    card.addEventListener('click', function () {
      if (state.isReviewMode) return; // Locked during review
      handleOptionSelect(index, optIdx);
    });

    el.optionsContainer.appendChild(card);
  });

  el.btnPrev.disabled = (index === 0);
  el.btnNext.disabled = (index === state.activeQuestions.length - 1);
  el.btnMark.textContent = state.markedForReview.has(index) ? 'Unmark Review' : 'Mark for Review';

  renderPalette();
}

function handleOptionSelect(qIndex, optIndex) {
  state.userResponses[qIndex] = optIndex;
  loadQuestion(qIndex);
}

// Clear response
el.btnClear.addEventListener('click', function () {
  if (state.isReviewMode) return;
  delete state.userResponses[state.currentIndex];
  loadQuestion(state.currentIndex);
});

// Mark for Review
el.btnMark.addEventListener('click', function () {
  if (state.markedForReview.has(state.currentIndex)) {
    state.markedForReview.delete(state.currentIndex);
  } else {
    state.markedForReview.add(state.currentIndex);
  }
  loadQuestion(state.currentIndex);
});

// Prev / Next
el.btnPrev.addEventListener('click', function () {
  if (state.currentIndex > 0) loadQuestion(state.currentIndex - 1);
});
el.btnNext.addEventListener('click', function () {
  if (state.currentIndex < state.activeQuestions.length - 1) loadQuestion(state.currentIndex + 1);
});

// ==============================================================
// 5. QUESTION PALETTE
// ==============================================================
function renderPalette() {
  el.paletteGrid.innerHTML = '';
  el.paletteStats.textContent = 'Total: ' + state.activeQuestions.length;

  state.activeQuestions.forEach(function (_, idx) {
    var btn = document.createElement('button');
    btn.className = 'q-btn';
    btn.textContent = idx + 1;

    if (idx === state.currentIndex) {
      btn.classList.add('current');
    }

    var hasAnswer = (state.userResponses[idx] !== undefined);
    var isMarked = state.markedForReview.has(idx);
    var isVisited = state.visitedIndices.has(idx);

    if (isMarked) {
      btn.classList.add('state-marked');
    } else if (hasAnswer) {
      btn.classList.add('state-answered');
    } else if (isVisited) {
      btn.classList.add('state-visited');
    }

    btn.addEventListener('click', function () {
      loadQuestion(idx);
    });
    el.paletteGrid.appendChild(btn);
  });
}

// ==============================================================
// 6. UPSC CSE SCORING & EXAM SUBMISSION
// ==============================================================
el.btnSubmitExam.addEventListener('click', function () {
  var answeredCount = Object.keys(state.userResponses).length;
  var total = state.activeQuestions.length;
  var msg = 'You have answered ' + answeredCount + ' of ' + total + ' questions. Are you sure you want to finish the mock test?';
  if (confirm(msg)) {
    submitExam();
  }
});

function submitExam() {
  clearInterval(state.timerInterval);
  el.timerBox.classList.add('hidden');
  el.btnSubmitExam.classList.add('hidden');

  var correct = 0;
  var incorrect = 0;
  var unattempted = 0;

  state.activeQuestions.forEach(function (q, idx) {
    var userChoice = state.userResponses[idx];
    if (userChoice === undefined) {
      unattempted++;
    } else if (userChoice === q.answer) {
      correct++;
    } else {
      incorrect++;
    }
  });

  // Official UPSC GS Formula: +2 per correct, -0.66 per incorrect
  var rawScore = (correct * 2.0) - (incorrect * 0.66);
  var attempted = correct + incorrect;
  var accuracy = attempted > 0 ? ((correct / attempted) * 100).toFixed(1) : '0';

  var scaledScore = state.activeQuestions.length > 0
    ? ((rawScore / (state.activeQuestions.length * 2)) * 200).toFixed(2)
    : '0.00';

  el.resTotalMarks.textContent = scaledScore;
  el.resRawScore.textContent = rawScore.toFixed(2);
  el.resAccuracy.textContent = accuracy + '%';
  el.resTotalQ.textContent = state.activeQuestions.length;
  el.resAttempted.textContent = attempted;
  el.resCorrect.textContent = correct;
  el.resIncorrect.textContent = incorrect;
  el.resUnattempted.textContent = unattempted;

  el.scorecardModal.classList.remove('hidden');
}

// Scorecard Modal actions
el.btnCloseScorecard.addEventListener('click', function () {
  el.scorecardModal.classList.add('hidden');
});

el.btnReviewAnswers.addEventListener('click', function () {
  el.scorecardModal.classList.add('hidden');
  // Enable Review Mode: activates passage pane and marks answers
  state.isReviewMode = true;
  updateLayoutViewMode();
  loadQuestion(0);
});

el.btnRetakeTest.addEventListener('click', function () {
  el.scorecardModal.classList.add('hidden');
  applyFiltersAndResetSession();
});

// Filter & Mode Change Listeners
el.filterMonth.addEventListener('change', function () {
  state.selectedMonth = el.filterMonth.value;
  loadMonthlyData(state.selectedMonth);
});

el.btnRestart.addEventListener('click', applyFiltersAndResetSession);

el.modeRadios.forEach(function (r) {
  r.addEventListener('change', applyFiltersAndResetSession);
});

// Initialization
window.addEventListener('DOMContentLoaded', function () {
  initAppData();
});