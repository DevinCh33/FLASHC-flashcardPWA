// ===== QUESTION BANK =====
let bankFilter = 'all';
let duplicateMap = {}; // { questionId: [matchingIds...] }

function renderBank() {
  const list = document.getElementById('bankList');
  const search = document.getElementById('bankSearch').value.toLowerCase();
  list.innerHTML = '';

  let filtered = questions;

  // Apply status filter
  if (bankFilter === 'unseen') {
    filtered = filtered.filter(q => !progress[q.id]);
  } else if (bankFilter === 'learning') {
    filtered = filtered.filter(q => progress[q.id] && progress[q.id].level < 2);
  } else if (bankFilter === 'mastered') {
    filtered = filtered.filter(q => progress[q.id] && progress[q.id].level >= 2);
  } else if (bankFilter === 'duplicates') {
    filtered = filtered.filter(q => duplicateMap[q.id] && duplicateMap[q.id].length > 0);
  }

  // Apply search
  if (search) {
    filtered = filtered.filter(q => {
      const optText = Object.values(q.options).join(' ').toLowerCase();
      return q.question.toLowerCase().includes(search) || optText.includes(search);
    });
  }

  document.getElementById('bankCount').textContent = filtered.length + ' questions';

  const toRender = filtered.slice(0, 200);
  toRender.forEach(q => {
    const p = progress[q.id];
    let statusClass = '';
    let statusTag = 'unseen';
    if (p) {
      if (p.level >= 2) { statusClass = 'mastered'; statusTag = 'mastered'; }
      else { statusClass = 'learning'; statusTag = 'learning'; }
    }

    const isDup = duplicateMap[q.id] && duplicateMap[q.id].length > 0;

    const div = document.createElement('div');
    div.className = 'bank-item ' + statusClass + (isDup ? ' duplicate' : '');
    div.onclick = function() { openQuestionModal(q.id); };

    let tagsHtml = '<span class="bi-tag">' + statusTag + '</span>';
    if (isDup) {
      tagsHtml += '<span class="bi-tag dup-tag">dup of Q' + duplicateMap[q.id][0] + '</span>';
    }
    tagsHtml += '<span class="bi-tag">' + Object.keys(q.options).length + ' opts</span>';

    div.innerHTML =
      '<div class="bi-top"><span class="bi-id">Q' + q.id + '</span><span class="bi-answer">' + q.answer + '</span></div>' +
      '<div class="bi-q">' + escapeHtmlBank(q.question) + '</div>' +
      '<div class="bi-tags">' + tagsHtml + '</div>';

    list.appendChild(div);
  });

  if (filtered.length > 200) {
    const more = document.createElement('div');
    more.style.cssText = 'text-align:center;padding:16px;color:var(--text-dim);font-size:0.8rem;';
    more.textContent = '+ ' + (filtered.length - 200) + ' more — use search to narrow down';
    list.appendChild(more);
  }

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:40px 16px;color:var(--text-dim);font-size:0.9rem;';
    empty.textContent = bankFilter === 'duplicates' ? 'No duplicates found!' : 'No questions match.';
    list.appendChild(empty);
  }
}

function filterBank() { renderBank(); }

function setBankFilter(filter, btn) {
  bankFilter = filter;
  document.querySelectorAll('.bank-filter-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderBank();
}

function escapeHtmlBank(s) {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ===== QUESTION DETAIL MODAL =====
function openQuestionModal(id) {
  var q = questions.find(function(x) { return x.id === id; });
  if (!q) return;

  var answerLetters = q.answer.split('');
  var optionsHtml = '';
  Object.entries(q.options).forEach(function(entry) {
    var letter = entry[0], text = entry[1];
    var isCorrect = answerLetters.includes(letter);
    optionsHtml += '<div class="option-item ' + (isCorrect ? 'correct' : 'incorrect') + '">' +
      letter + '. ' + escapeHtmlBank(text) + (isCorrect ? ' ✓' : '') + '</div>';
  });

  var p = progress[id];
  var statusText = 'Unseen';
  if (p) statusText = p.level >= 2 ? 'Mastered' : 'Learning';

  var dups = duplicateMap[id];
  var dupHtml = '';
  if (dups && dups.length > 0) {
    dupHtml = '<div style="margin-top:12px;padding:10px;background:rgba(255,107,107,0.08);border-radius:8px;border:1px solid rgba(255,107,107,0.2);">' +
      '<div style="font-size:0.75rem;color:var(--red);margin-bottom:6px;">🔁 Similar/Duplicate Questions</div>';
    dups.forEach(function(dupId) {
      var dq = questions.find(function(x) { return x.id === dupId; });
      if (dq) {
        dupHtml += '<div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:4px;cursor:pointer;text-decoration:underline;" onclick="openQuestionModal(' + dupId + ')">' +
          'Q' + dupId + ': ' + escapeHtmlBank(dq.question.substring(0, 80)) + '...</div>';
      }
    });
    dupHtml += '</div>';
  }

  document.getElementById('modalContent').innerHTML =
    '<div style="font-size:0.7rem;color:var(--highlight);margin-bottom:8px;">Question ' + id + ' · ' + statusText + '</div>' +
    '<div style="font-size:0.92rem;line-height:1.6;margin-bottom:16px;">' + escapeHtmlBank(q.question) + '</div>' +
    '<div style="font-size:0.75rem;color:var(--green);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Answer: ' + q.answer + '</div>' +
    optionsHtml + dupHtml;

  document.getElementById('questionModal').classList.add('open');
}

function closeModal() {
  document.getElementById('questionModal').classList.remove('open');
}

// ===== DUPLICATE DETECTION =====
function findDuplicates() {
  duplicateMap = {};
  var n = questions.length;

  var normalized = questions.map(function(q) {
    return { id: q.id, text: normalizeForComparison(q.question), answer: q.answer };
  });

  for (var i = 0; i < n; i++) {
    for (var j = i + 1; j < n; j++) {
      var sim = similarity(normalized[i].text, normalized[j].text);
      if (sim >= 0.82) {
        if (!duplicateMap[normalized[i].id]) duplicateMap[normalized[i].id] = [];
        if (!duplicateMap[normalized[j].id]) duplicateMap[normalized[j].id] = [];
        if (duplicateMap[normalized[i].id].indexOf(normalized[j].id) === -1) {
          duplicateMap[normalized[i].id].push(normalized[j].id);
        }
        if (duplicateMap[normalized[j].id].indexOf(normalized[i].id) === -1) {
          duplicateMap[normalized[j].id].push(normalized[i].id);
        }
      }
    }
  }

  var dupCount = Object.keys(duplicateMap).filter(function(k) { return duplicateMap[k].length > 0; }).length;
  return dupCount;
}

function normalizeForComparison(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function similarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  var triA = makeTrigrams(a);
  var triB = makeTrigrams(b);
  if (triA.size === 0 && triB.size === 0) return 1;
  if (triA.size === 0 || triB.size === 0) return 0;
  var intersection = 0;
  triA.forEach(function(t) { if (triB.has(t)) intersection++; });
  return (2 * intersection) / (triA.size + triB.size);
}

function makeTrigrams(str) {
  var set = new Set();
  for (var i = 0; i <= str.length - 3; i++) {
    set.add(str.substring(i, i + 3));
  }
  return set;
}

function removeDuplicates() {
  if (Object.keys(duplicateMap).length === 0) {
    alert('Run duplicate detection first by clicking the Duplicates filter in the Bank view.');
    return;
  }

  var seen = {};
  var kept = [];
  var removed = 0;

  questions.forEach(function(q) {
    var norm = normalizeForComparison(q.question);
    if (!seen[norm]) {
      seen[norm] = true;
      kept.push(q);
    } else {
      removed++;
    }
  });

  if (removed === 0) {
    alert('No exact duplicates to remove. Similar questions (not exact) are kept.');
    return;
  }

  if (confirm('Remove ' + removed + ' exact duplicate questions? This keeps the first occurrence of each.')) {
    // Re-number IDs
    kept.forEach(function(q, i) { q.id = i + 1; });
    questions = kept;
    localStorage.setItem('ceh-custom-questions', JSON.stringify(questions));
    progress = {};
    saveProgress();
    duplicateMap = {};
    findDuplicates();
    renderBank();
    updateStats();
    alert('Removed ' + removed + ' duplicates. ' + questions.length + ' questions remain.');
  }
}