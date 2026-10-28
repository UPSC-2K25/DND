/**
 * UPSC CSE Prelims Current Affairs Mock Test Engine
 * Clean Mock & Review Modes with Strict Color Hierarchy
 */

var state = {
  monthsIndex: [],        // Manifest of month files loaded from data/index.json
  loadedMonthData: {},    // Cache of fetched json per month
  selectedMonth: 'all',
  rawQuestions: [],
  activeQuestions: [],
  currentIndex: 0,
  userResponses: {},      // { [qIndex]: selectedOptionIndex }
  isReviewMode: false,    // false = Mock Mode, true = Review Mode
  timerSecondsRemaining: 0,
  timerInterval: null
};

var el = {
  mainLayout: document.getElementById('main-layout'),
  passageContainer: document.getElementById('passage-container'),
  passageContent: document.getElementById('passage-content'),

  badgeQno: document.getElementById('badge-qno'),
  badgeSubject: document.getElementById('badge-subject'),
  badgeDate: document.getElementById('badge-date'),
  badgeYear: document.getElementById('badge-year'),
  modeBadge: document.getElementById('mode-badge'),

  questionText: document.getElementById('question-text'),
  optionsContainer: document.getElementById('options-container'),
  legendBox: document.getElementById('legend-box'),
  paletteGrid: document.getElementById('palette-grid'),
  paletteStats: document.getElementById('palette-stats'),

  filterMonth: document.getElementById('filter-month'),
  filterSubject: document.getElementById('filter-subject'),
  filterYear: document.getElementById('filter-year'),
  btnRestart: document.getElementById('btn-restart'),

  btnPrev: document.getElementById('btn-prev'),
  btnNext: document.getElementById('btn-next'),
  btnClear: document.getElementById('btn-clear'),
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
// 1. DATA INITIALIZATION & MONTHLY REGISTRY
// ==============================================================
async function initAppData() {
  try {
    var res = await fetch('data/index.json');
    if (res.ok) {
      state.monthsIndex = await res.json();
      populateMonthDropdown(state.monthsIndex);
      await loadMonthlyData(state.selectedMonth);
    } else {
      el.questionText.textContent = 'Could not find data/index.json. Please check your data folder.';
    }
  } catch (err) {
    el.questionText.textContent = 'Error connecting to data files. Ensure you are running on a server or GitHub Pages.';
  }
}

function populateMonthDropdown(months) {
  el.filterMonth.innerHTML = '';

  var allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All Batches';
  el.filterMonth.appendChild(allOpt);

  months.forEach(function (m) {
    var opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    el.filterMonth.appendChild(opt);
  });
}

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

  var promises = filesToFetch.map(async function (item) {
    try {
      var res = await fetch(item.file);
      if (res.ok) {
        state.loadedMonthData[item.id] = await res.json();
      }
    } catch (e) {
      console.error('Failed to load: ' + item.file, e);
    }
  });

  await Promise.all(promises);

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
  startMockTest();
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
// 2. MOCK TEST & REVIEW MODES
// ==============================================================
function startMockTest() {
  var selSubject = el.filterSubject.value;
  var selYear = el.filterYear.value;

  state.activeQuestions = state.rawQuestions.filter(function (q) {
    var matchSub = (selSubject === 'all') || (q.subject === selSubject);
    var matchYr = (selYear === 'all') || (String(q.year) === String(selYear));
    return matchSub && matchYr;
  });

  state.currentIndex = 0;
  state.userResponses = {};
  state.isReviewMode = false;

  // View: Mock Mode (Passage Hidden, Layout Single)
  el.passageContainer.classList.add('hidden');
  el.mainLayout.className = 'test-layout layout-single';
  el.modeBadge.textContent = 'MOCK MODE';
  el.modeBadge.className = 'badge badge-accent';
  el.btnSubmitExam.classList.remove('hidden');
  el.btnClear.classList.remove('hidden');

  setupTimer();
  renderLegend();
  renderPalette();
  loadQuestion(state.currentIndex);
}

function activateReviewMode() {
  state.isReviewMode = true;
  clearInterval(state.timerInterval);

  el.timerBox.classList.add('hidden');
  el.btnSubmitExam.classList.add('hidden');
  el.btnClear.classList.add('hidden');

  // View: Review Mode (Passage Visible on Left, Layout Dual)
  el.passageContainer.classList.remove('hidden');
  el.mainLayout.className = 'test-layout layout-dual';
  el.modeBadge.textContent = 'REVIEW MODE';
  el.modeBadge.className = 'badge badge-review';

  renderLegend();
  renderPalette();
  loadQuestion(0);
}

// ==============================================================
// 3. TIMER
// ==============================================================
function setupTimer() {
  clearInterval(state.timerInterval);
  el.timerBox.classList.remove('hidden');
  
  // 1.2 min (72s) per question as per GS standards
  state.timerSecondsRemaining = Math.max(state.activeQuestions.length * 72, 120);
  renderTimer();

  state.timerInterval = setInterval(function () {
    state.timerSecondsRemaining--;
    renderTimer();
    if (state.timerSecondsRemaining <= 0) {
      clearInterval(state.timerInterval);
      alert('Time is up! Your test is being submitted.');
      submitExam();
    }
  }, 1000);
}

function renderTimer() {
  var m = Math.floor(state.timerSecondsRemaining / 60);
  var s = state.timerSecondsRemaining % 60;
  el.timerDisplay.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ==============================================================
// 4. QUESTION & OPTIONS RENDERING
// ==============================================================
function loadQuestion(index) {
  if (state.activeQuestions.length === 0) {
    el.questionText.textContent = 'No questions found matching your filter selection.';
    el.passageContent.textContent = 'No passage.';
    el.optionsContainer.innerHTML = '';
    return;
  }

  state.currentIndex = index;
  var q = state.activeQuestions[index];

  el.badgeQno.textContent = 'Q ' + (index + 1) + ' of ' + state.activeQuestions.length;
  el.badgeSubject.textContent = q.subject || 'General Studies';
  el.badgeDate.textContent = q.date || 'Current Affairs';
  el.badgeYear.textContent = q.year || '2026';

  // Left Column Passage (only visible in review mode)
  if (state.isReviewMode) {
    el.passageContent.textContent = q.passage || 'No source passage provided for this item.';
  }

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

    // Review Mode: Highlight Correct / Incorrect
    if (state.isReviewMode) {
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
      state.userResponses[index] = optIdx;
      loadQuestion(index);
    });

    el.optionsContainer.appendChild(card);
  });

  el.btnPrev.disabled = (index === 0);
  el.btnNext.disabled = (index === state.activeQuestions.length - 1);

  renderPalette();
}

// Clear Response
el.btnClear.addEventListener('click', function () {
  if (state.isReviewMode) return;
  delete state.userResponses[state.currentIndex];
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
// 5. LEGEND & PALETTE COLOR LOGIC
// ==============================================================
function renderLegend() {
  el.legendBox.innerHTML = '';

  if (!state.isReviewMode) {
    // Mock Mode Legend: Green for Attempted, White for Unattempted
    el.legendBox.innerHTML = 
      '<div class="legend-item"><span class="bullet bullet-green"></span> Attempted</div>' +
      '<div class="legend-item"><span class="bullet bullet-white"></span> Unattempted</div>';
  } else {
    // Review Mode Legend: Green for Correct, Red for Wrong, White for Unattempted
    el.legendBox.innerHTML = 
      '<div class="legend-item"><span class="bullet bullet-green"></span> Correct</div>' +
      '<div class="legend-item"><span class="bullet bullet-red"></span> Wrong</div>' +
      '<div class="legend-item" style="grid-column: span 2;"><span class="bullet bullet-white"></span> Unattempted (No color)</div>';
  }
}

function renderPalette() {
  el.paletteGrid.innerHTML = '';
  el.paletteStats.textContent = 'Total: ' + state.activeQuestions.length;

  state.activeQuestions.forEach(function (q, idx) {
    var btn = document.createElement('button');
    btn.className = 'q-btn';
    btn.textContent = idx + 1;

    if (idx === state.currentIndex) {
      btn.classList.add('current');
    }

    var userChoice = state.userResponses[idx];

    if (!state.isReviewMode) {
      // --- MOCK MODE ---
      // Green for attempted, no color (white) for unattempted
      if (userChoice !== undefined) {
        btn.classList.add('state-green');
      } else {
        btn.classList.add('state-unattempted');
      }
    } else {
      // --- REVIEW MODE ---
      // Green for correct, Red for wrong, no color for unattempted
      if (userChoice === undefined) {
        btn.classList.add('state-unattempted');
      } else if (userChoice === q.answer) {
        btn.classList.add('state-green');
      } else {
        btn.classList.add('state-red');
      }
    }

    btn.addEventListener('click', function () {
      loadQuestion(idx);
    });

    el.paletteGrid.appendChild(btn);
  });
}

// ==============================================================
// 6. SUBMISSION & UPSC SCORING
// ==============================================================
el.btnSubmitExam.addEventListener('click', function () {
  var attempted = Object.keys(state.userResponses).length;
  var total = state.activeQuestions.length;
  var msg = 'You have attempted ' + attempted + ' of ' + total + ' questions. Are you sure you want to submit?';
  if (confirm(msg)) {
    submitExam();
  }
});

function submitExam() {
  clearInterval(state.timerInterval);

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

  // Official UPSC GS: +2.00 for correct, -0.66 for incorrect
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

el.btnCloseScorecard.addEventListener('click', function () {
  el.scorecardModal.classList.add('hidden');
});

el.btnReviewAnswers.addEventListener('click', function () {
  el.scorecardModal.classList.add('hidden');
  activateReviewMode();
});

el.btnRetakeTest.addEventListener('click', function () {
  el.scorecardModal.classList.add('hidden');
  startMockTest();
});

// Filters
el.filterMonth.addEventListener('change', function () {
  state.selectedMonth = el.filterMonth.value;
  loadMonthlyData(state.selectedMonth);
});

el.btnRestart.addEventListener('click', startMockTest);

// Initialize on DOM ready
window.addEventListener('DOMContentLoaded', function () {
  initAppData();
});
