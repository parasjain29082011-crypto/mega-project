// Ancient Trace — app.js

document.addEventListener('DOMContentLoaded', () => {

  // ── Firebase ───────────────────────────────────────────────────────────────
  const auth = firebase.auth();
  const db   = firebase.database();
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  let currentUser = null;

  // ── PWA Install ────────────────────────────────────────────────────────────
  let deferredPrompt;
  const installBtn = document.getElementById('install-btn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'flex';
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.style.display = 'none';
  });
  window.addEventListener('appinstalled', () => {
    installBtn.style.display = 'none';
    deferredPrompt = null;
  });

  // ── Theme ─────────────────────────────────────────────────────────────────
  const themeBtn   = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('ancient-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  themeBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

  themeBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next    = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ancient-theme', next);
    themeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
  });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const loginBtn   = document.getElementById('login-btn');
  const logoutBtn  = document.getElementById('logout-btn');
  const userInfo   = document.getElementById('user-info');
  const userPhoto  = document.getElementById('user-photo');
  const userNameEl = document.getElementById('user-name');

  auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
      loginBtn.style.display  = 'none';
      userInfo.style.display  = 'flex';
      userPhoto.src           = user.photoURL || '';
      userNameEl.textContent  = user.displayName ? user.displayName.split(' ')[0] : 'Traveller';
    } else {
      loginBtn.style.display  = 'flex';
      userInfo.style.display  = 'none';
    }
  });

  loginBtn.addEventListener('click', () => {
    auth.signInWithPopup(provider).catch(err => alert('Sign in failed: ' + err.message));
  });
  logoutBtn.addEventListener('click', () => auth.signOut());

  // ── Past Searches Sidebar ─────────────────────────────────────────────────
  const pastSidebar     = document.getElementById('past-sidebar');
  const closeSidebarBtn = document.getElementById('close-sidebar');
  const searchesList    = document.getElementById('searches-list');
  const historyBtn      = document.getElementById('history-btn');

  historyBtn.addEventListener('click', () => {
    pastSidebar.classList.add('open');
    if (currentUser) loadPastSearches();
    else searchesList.innerHTML = '<p class="no-searches">Sign in to view history</p>';
  });
  closeSidebarBtn.addEventListener('click', () => pastSidebar.classList.remove('open'));

  async function saveSearch(location, content, sourcesData, imagesData, type) {
    if (!currentUser) return;
    await db.ref('users/' + currentUser.uid + '/searches/' + Date.now()).set({
      location: location,
      content: content,
      sourcesDataStr: JSON.stringify(sourcesData || null),
      imagesDataStr:  JSON.stringify(imagesData  || []),
      type: type || 'search',
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  }

  async function loadPastSearches() {
    searchesList.innerHTML = '<p class="no-searches">Loading…</p>';
    try {
      const snap = await db.ref('users/' + currentUser.uid + '/searches').once('value');
      searchesList.innerHTML = '';
      if (!snap.exists()) {
        searchesList.innerHTML = '<p class="no-searches">No past searches yet</p>';
        return;
      }
      const arr = Object.entries(snap.val())
        .map(function(entry) { return Object.assign({ id: entry[0] }, entry[1]); })
        .sort(function(a, b) { return b.timestamp - a.timestamp; });

      arr.forEach(function(s) {
        const icon = s.type === 'bookmark' ? '🗿' : '📜';
        const date = new Date(s.timestamp).toLocaleDateString();
        const div  = document.createElement('div');
        div.className = 'past-item';
        div.innerHTML =
          '<div class="past-item-info">' +
            '<div class="past-location">' + icon + ' ' + escHtml(s.location) + '</div>' +
            '<div class="past-date">' + date + '</div>' +
          '</div>' +
          '<div class="past-actions">' +
            '<button class="past-btn reload-btn" title="Reload">↩</button>' +
            '<button class="past-btn del-btn" title="Delete">✕</button>' +
          '</div>';

        div.querySelector('.reload-btn').addEventListener('click', function() {
          const parsedSources = JSON.parse(s.sourcesDataStr || 'null');
          const parsedImages  = JSON.parse(s.imagesDataStr  || '[]');
          searchInput.value       = s.location;
          window._lastResult      = s.content;
          window._lastLocation    = s.location;
          window._lastSourcesData = parsedSources;
          window._lastImagesData  = parsedImages;
          resultsSection.style.display = 'block';
          bookmarkBar.style.display    = 'flex';
          displayResults(s.content, parsedSources, parsedImages);
          showTab('explore');
          pastSidebar.classList.remove('open');
          oracleLocBadge.style.display = 'flex';
          oracleLocName.textContent    = s.location;
          showSuggestions(s.location);
          oracleMessages.innerHTML = '';
          appendOracleMsg('Ask me anything about <strong>' + escHtml(s.location) + '</strong>.', 'assistant');
        });

        div.querySelector('.del-btn').addEventListener('click', async function() {
          await db.ref('users/' + currentUser.uid + '/searches/' + s.id).remove();
          loadPastSearches();
        });

        searchesList.appendChild(div);
      });
    } catch(e) {
      searchesList.innerHTML = '<p class="no-searches">Error loading history</p>';
    }
  }

  // ── Bookmark ──────────────────────────────────────────────────────────────
  const bookmarkBtn    = document.getElementById('bookmark-btn');
  const bookmarkStatus = document.getElementById('bookmark-status');

  bookmarkBtn.addEventListener('click', async function() {
    if (!currentUser) { alert('Sign in to bookmark!'); return; }
    if (!window._lastResult) return;
    await saveSearch(window._lastLocation, window._lastResult, window._lastSourcesData, window._lastImagesData, 'bookmark');
    bookmarkBtn.textContent    = '🗿 Carved!';
    bookmarkStatus.textContent = '✦ Preserved in stone ✦';
    bookmarkBtn.disabled       = true;
    setTimeout(function() {
      bookmarkBtn.textContent    = '🗿 Carve Into Stone';
      bookmarkStatus.textContent = '';
      bookmarkBtn.disabled       = false;
    }, 3000);
  });

  // ── TTS ───────────────────────────────────────────────────────────────────
  const voiceSelect       = document.getElementById('voice-select');
  const ttsPlayBtn        = document.getElementById('tts-play');
  const ttsPauseBtn       = document.getElementById('tts-pause');
  const ttsProgressToggle = document.getElementById('tts-progress-toggle');
  const ttsProgressWrap   = document.getElementById('tts-progress-wrap');
  const ttsProgressBar    = document.getElementById('tts-progress-bar');
  const ttsProgressFill   = document.getElementById('tts-progress-fill');
  const ttsSkipBack       = document.getElementById('tts-skip-back');
  const ttsSkipFwd        = document.getElementById('tts-skip-fwd');
  const ttsTimeLabel      = document.getElementById('tts-time-label');

  var voices           = [];
  var ttsSummaryText   = '';
  var ttsCharIndex     = 0;
  var ttsTotalLen      = 0;
  var ttsProgressShown = false;
  var ttsProgressTimer = null;

  function loadVoices() {
    voices = speechSynthesis.getVoices().filter(function(v) { return v.lang.startsWith('en'); });
    voiceSelect.innerHTML = '<option value="">Default</option>';
    voices.forEach(function(v, i) {
      var o = document.createElement('option');
      o.value       = i;
      o.textContent = v.name;
      voiceSelect.appendChild(o);
    });
  }
  loadVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  function startProgressTimer() {
    clearInterval(ttsProgressTimer);
    ttsProgressTimer = setInterval(function() {
      if (ttsTotalLen > 0) {
        var pct = Math.min((ttsCharIndex / ttsTotalLen) * 100, 100);
        ttsProgressFill.style.width = pct + '%';
        var wordsDone  = Math.floor(ttsCharIndex / 5);
        var wordsTotal = Math.floor(ttsTotalLen / 5);
        ttsTimeLabel.textContent = wordsDone + ' / ' + wordsTotal + ' words';
      }
    }, 300);
  }

  function stopProgressTimer() {
    clearInterval(ttsProgressTimer);
  }

  function speakFrom(charIdx) {
    speechSynthesis.cancel();
    var textSlice = ttsSummaryText.substring(charIdx);
    if (!textSlice.trim()) return;
    ttsCharIndex = charIdx;
    var utt = new SpeechSynthesisUtterance(textSlice);
    utt.rate  = 0.9;
    utt.pitch = 1;
    if (voiceSelect.value !== '') {
      utt.voice = voices[parseInt(voiceSelect.value)] || null;
    }
    utt.onboundary = function(e) {
      if (e.name === 'word') {
        ttsCharIndex = charIdx + (e.charIndex || 0);
      }
    };
    utt.onstart = function() {
      ttsPlayBtn.style.display  = 'none';
      ttsPauseBtn.style.display = 'inline-flex';
      startProgressTimer();
    };
    utt.onend = function() {
      ttsPlayBtn.style.display  = 'inline-flex';
      ttsPauseBtn.style.display = 'none';
      stopProgressTimer();
      ttsCharIndex = 0;
      ttsProgressFill.style.width = '0%';
      ttsTimeLabel.textContent    = '';
    };
    utt.onerror = function(e) {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      ttsPlayBtn.style.display  = 'inline-flex';
      ttsPauseBtn.style.display = 'none';
      stopProgressTimer();
    };
    speechSynthesis.speak(utt);
  }

  ttsPlayBtn.addEventListener('click', async function() {
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
      ttsPlayBtn.style.display  = 'none';
      ttsPauseBtn.style.display = 'inline-flex';
      startProgressTimer();
      return;
    }
    if (ttsSummaryText && ttsCharIndex > 0) {
      speakFrom(ttsCharIndex);
      return;
    }
    if (!window._lastResult) return;
    ttsPlayBtn.textContent = '⏳';
    ttsPlayBtn.disabled    = true;
    await buildTTSSummary(window._lastResult);
    ttsPlayBtn.textContent = '▶';
    ttsPlayBtn.disabled    = false;
    speakFrom(0);
  });

  ttsPauseBtn.addEventListener('click', function() {
    speechSynthesis.pause();
    ttsPlayBtn.style.display  = 'inline-flex';
    ttsPauseBtn.style.display = 'none';
    stopProgressTimer();
  });

  ttsProgressToggle.addEventListener('click', function() {
    ttsProgressShown = !ttsProgressShown;
    ttsProgressWrap.style.display = ttsProgressShown ? 'block' : 'none';
    ttsProgressToggle.classList.toggle('active', ttsProgressShown);
  });

  ttsProgressBar.addEventListener('click', function(e) {
    if (!ttsTotalLen) return;
    var rect    = ttsProgressBar.getBoundingClientRect();
    var pct     = (e.clientX - rect.left) / rect.width;
    var charIdx = Math.floor(pct * ttsTotalLen);
    speakFrom(Math.max(0, charIdx));
  });

  var CHARS_PER_SEC = 13;
  ttsSkipBack.addEventListener('click', function() {
    speakFrom(Math.max(0, ttsCharIndex - CHARS_PER_SEC * 5));
  });
  ttsSkipFwd.addEventListener('click', function() {
    speakFrom(Math.min(ttsTotalLen, ttsCharIndex + CHARS_PER_SEC * 5));
  });

  async function buildTTSSummary(content) {
    try {
      var resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: content,
          systemPrompt: 'Write a clear, engaging audio narration of approximately 250-300 words about this historical location. Write for listening, not reading — natural spoken language, no markdown, no bullet points, no headers. Pure flowing prose. Calm, informative, measured tone.',
          maxTokens: 600
        })
      });
      var data = await resp.json();
      ttsSummaryText = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text)
        ? data.candidates[0].content.parts[0].text
        : content.replace(/[#*_`]/g, '').substring(0, 800);
    } catch(e) {
      ttsSummaryText = content.replace(/[#*_`]/g, '').substring(0, 800);
    }
    ttsTotalLen  = ttsSummaryText.length;
    ttsCharIndex = 0;
    ttsProgressFill.style.width = '0%';
    ttsTimeLabel.textContent    = '';
  }

  // ── Oracle Panel ──────────────────────────────────────────────────────────
  const oraclePanel    = document.getElementById('oracle-panel');
  const closeOracleBtn = document.getElementById('close-oracle');
  const oracleInput    = document.getElementById('oracle-input');
  const oracleSendBtn  = document.getElementById('oracle-send');
  const oracleMessages = document.getElementById('oracle-tab-location');
  const oracleSuggestions = document.getElementById('oracle-suggestions');
  const oracleBtn      = document.getElementById('oracle-btn');
  const oracleLocBadge = document.getElementById('oracle-loc-badge');
  const oracleLocName  = document.getElementById('oracle-loc-name');
  const oracleClearBtn = document.getElementById('oracle-clear-btn');
  const createSlidesBtn = document.getElementById('create-slides-btn');

  const oracleTabBtns          = document.querySelectorAll('.oracle-tab-btn');
  const oracleTabLocation      = document.getElementById('oracle-tab-location');
  const oracleTabConversations = document.getElementById('oracle-tab-conversations');
  const oracleTabManuscripts   = document.getElementById('oracle-tab-manuscripts');
  const oracleTabSlides        = document.getElementById('oracle-tab-slides');
  const chatHistoryConvEl      = document.getElementById('chat-history-conversations');
  const chatHistoryManuEl      = document.getElementById('chat-history-manuscripts');
  const chatHistorySlidesEl    = document.getElementById('chat-history-slides');

  function buildHistorianPrompt(location, researchContext) {
    return 'You are a professional historian specialising in ' + location + '. Provide evidence-based historical analysis.\n\n' +
      'Tone and style:\n' +
      '- Calm, semi-formal, accessible academic language\n' +
      '- No metaphors, no dramatisation, no sensationalism\n' +
      '- Simple academic vocabulary that a general educated reader can follow\n' +
      '- Acknowledge uncertainty honestly where evidence is limited\n\n' +
      'Structure each answer:\n' +
      '- Causes → Context → Consequences → Long-term significance\n' +
      '- Use **bold** for key terms, dates, and names\n' +
      '- Short paragraphs for readability\n' +
      '- Target 450-550 words per answer\n' +
      '- Do not fabricate facts\n\n' +
      'Historical context:\n---\n' +
      (researchContext ? researchContext.substring(0, 2500) : '(no context)') +
      '\n---';
  }

  oracleBtn.addEventListener('click', function() { oraclePanel.classList.add('open'); });
  closeOracleBtn.addEventListener('click', function() { oraclePanel.classList.remove('open'); });

  oracleClearBtn.addEventListener('click', function() {
    oracleMessages.innerHTML = '';
    appendOracleMsg('Ask me anything about <strong>' + escHtml(window._lastLocation || 'a location') + '</strong>.', 'assistant');
  });

  oracleTabBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      oracleTabBtns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      oracleTabLocation.style.display      = 'none';
      oracleTabConversations.style.display = 'none';
      oracleTabManuscripts.style.display   = 'none';
      oracleTabSlides.style.display        = 'none';
      createSlidesBtn.style.display        = 'none';
      oracleSuggestions.style.display      = 'none';

      var tab = btn.dataset.tab;
      if (tab === 'location') {
        oracleTabLocation.style.display = 'block';
        createSlidesBtn.style.display   = 'inline-flex';
        if (window._lastLocation) oracleSuggestions.style.display = 'flex';
      } else if (tab === 'conversations') {
        oracleTabConversations.style.display = 'block';
        loadChatHistory();
      } else if (tab === 'manuscripts') {
        oracleTabManuscripts.style.display = 'block';
        loadManuscriptHistory();
      } else if (tab === 'slides') {
        oracleTabSlides.style.display = 'block';
        loadSlidesHistory();
      }
    });
  });

  function appendOracleMsg(html, role) {
    var div = document.createElement('div');
    div.className = 'oracle-msg oracle-' + role;
    if (role === 'assistant') {
      div.innerHTML = '<span class="oracle-avatar">🔮</span><div class="oracle-bubble">' + html + '</div>';
    } else {
      div.innerHTML = '<div class="oracle-bubble oracle-user-bubble">' + html + '</div>';
    }
    oracleMessages.appendChild(div);
    oracleMessages.scrollTop = oracleMessages.scrollHeight;
  }

  function showSuggestions(location) {
    var questions = [
      'What caused the decline of ' + location + '?',
      'Who were the most powerful rulers of ' + location + '?',
      'How did trade shape ' + location + '\'s economy?',
      'What cultural practices defined ' + location + '?'
    ];
    oracleSuggestions.style.display = 'flex';
    oracleSuggestions.innerHTML = questions.map(function(q) {
      return '<button class="sugg-chip">' + escHtml(q) + '</button>';
    }).join('');
    oracleSuggestions.querySelectorAll('.sugg-chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        oracleInput.value = chip.textContent;
        sendOracleOrSlides();
      });
    });
  }

  async function sendOracleQuestion() {
    var q = oracleInput.value.trim();
    if (!q) return;
    if (!window._lastResult) {
      appendOracleMsg('Please search for a location first.', 'assistant');
      return;
    }
    oracleInput.value = '';
    oracleSuggestions.style.display = 'none';
    appendOracleMsg(escHtml(q), 'user');

    var thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'oracle-msg oracle-assistant oracle-thinking';
    thinkingDiv.innerHTML = '<span class="oracle-avatar">🔮</span><div class="oracle-bubble">Consulting the historical record…</div>';
    oracleMessages.appendChild(thinkingDiv);
    oracleMessages.scrollTop = oracleMessages.scrollHeight;

    try {
      var resp = await fetch('/api/oracle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: q,
          systemPrompt: buildHistorianPrompt(window._lastLocation, window._lastResult),
          maxTokens: 1300
        })
      });
      var data   = await resp.json();
      var answer = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text)
        ? data.candidates[0].content.parts[0].text : 'No response.';
      thinkingDiv.remove();
      var formatted = answer.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
      appendOracleMsg(formatted, 'assistant');
      if (currentUser) {
        await db.ref('users/' + currentUser.uid + '/oracleChats').push({
          question: q, answer: answer, location: window._lastLocation,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });
      }
    } catch(e) {
      thinkingDiv.remove();
      appendOracleMsg('The Oracle encountered an error. Please try again.', 'assistant');
    }
  }

  function sendOracleOrSlides() {
    var q = oracleInput.value.trim();
    if (!q) return;
    if (/^(create|make) slides/i.test(q)) {
      oracleInput.value = '';
      handleCreateSlides(q);
    } else {
      sendOracleQuestion();
    }
  }

  oracleSendBtn.addEventListener('click', sendOracleOrSlides);
  oracleInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') sendOracleOrSlides(); });

  createSlidesBtn.addEventListener('click', function() {
    oracleInput.value = 'Create slides about ' + (window._lastLocation || '');
    oracleInput.focus();
  });

  // ── Chat History ──────────────────────────────────────────────────────────
  async function loadChatHistory() {
    if (!currentUser) {
      chatHistoryConvEl.innerHTML = '<p class="no-searches">Sign in to view conversations.</p>';
      return;
    }
    chatHistoryConvEl.innerHTML = '<p class="no-searches">Loading…</p>';
    try {
      var snap = await db.ref('users/' + currentUser.uid + '/oracleChats').once('value');
      chatHistoryConvEl.innerHTML = '';
      if (!snap.exists()) {
        chatHistoryConvEl.innerHTML = '<p class="no-searches">No conversations yet.</p>';
        return;
      }
      var arr = Object.entries(snap.val())
        .map(function(e) { return Object.assign({ id: e[0] }, e[1]); })
        .sort(function(a, b) { return b.timestamp - a.timestamp; });

      arr.forEach(function(item) {
        var preview = item.question.length > 55 ? item.question.substring(0, 55) + '…' : item.question;
        var div = document.createElement('div');
        div.className = 'ch-item';
        div.innerHTML =
          '<div class="ch-loc">' + escHtml(item.location || '') + '</div>' +
          '<div class="ch-preview">' + escHtml(preview) + '</div>';
        div.addEventListener('click', function() {
          var existing = div.nextElementSibling;
          if (existing && existing.classList.contains('ch-expanded')) { existing.remove(); return; }
          var exp = document.createElement('div');
          exp.className = 'ch-expanded';
          var answerFormatted = (item.answer || '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
          exp.innerHTML = '<div class="ch-q"><strong>Q:</strong> ' + escHtml(item.question) + '</div><div class="ch-a">' + answerFormatted + '</div>';
          div.after(exp);
          exp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        chatHistoryConvEl.appendChild(div);
      });
    } catch(e) {
      chatHistoryConvEl.innerHTML = '<p class="no-searches">Error loading conversations.</p>';
    }
  }

  async function loadManuscriptHistory() {
    if (!currentUser) {
      chatHistoryManuEl.innerHTML = '<p class="no-searches">Sign in to view manuscripts.</p>';
      return;
    }
    chatHistoryManuEl.innerHTML = '<p class="no-searches">Loading…</p>';
    try {
      var snap = await db.ref('users/' + currentUser.uid + '/manuscripts').once('value');
      chatHistoryManuEl.innerHTML = '';
      if (!snap.exists()) {
        chatHistoryManuEl.innerHTML = '<p class="no-searches">No manuscripts yet. Use "Create Script" on Notable Figures or Events.</p>';
        return;
      }
      var arr = Object.entries(snap.val())
        .map(function(e) { return Object.assign({ id: e[0] }, e[1]); })
        .sort(function(a, b) { return b.timestamp - a.timestamp; });

      arr.forEach(function(item) {
        var div = document.createElement('div');
        div.className = 'ch-item';
        div.innerHTML =
          '<div class="ch-loc">📜 ' + escHtml(item.subject) + '</div>' +
          '<div class="ch-preview">' + escHtml(item.content.substring(0, 60)) + '…</div>';
        div.addEventListener('click', function() { openParchmentOverlay(item.subject, item.content); });
        chatHistoryManuEl.appendChild(div);
      });
    } catch(e) {
      chatHistoryManuEl.innerHTML = '<p class="no-searches">Error loading manuscripts.</p>';
    }
  }

  async function loadSlidesHistory() {
    if (!currentUser) {
      chatHistorySlidesEl.innerHTML = '<p class="no-searches">Sign in to view slides.</p>';
      return;
    }
    chatHistorySlidesEl.innerHTML = '<p class="no-searches">Loading…</p>';
    try {
      var snap = await db.ref('users/' + currentUser.uid + '/slides').once('value');
      chatHistorySlidesEl.innerHTML = '';
      if (!snap.exists()) {
        chatHistorySlidesEl.innerHTML = '<p class="no-searches">No slides yet. Type "Create slides about…" in the Oracle.</p>';
        return;
      }
      var arr = Object.entries(snap.val())
        .map(function(e) { return Object.assign({ id: e[0] }, e[1]); })
        .sort(function(a, b) { return b.timestamp - a.timestamp; });

      arr.forEach(function(item) {
        var div = document.createElement('div');
        div.className = 'ch-item';
        div.innerHTML =
          '<div class="ch-loc">🗂️ ' + escHtml(item.topic) + '</div>' +
          '<div class="ch-preview">' + item.slideCount + ' slides · ' + new Date(item.timestamp).toLocaleDateString() + '</div>';
        div.addEventListener('click', function() { openSlidesViewer(item.topic, item.slidesData); });
        chatHistorySlidesEl.appendChild(div);
      });
    } catch(e) {
      chatHistorySlidesEl.innerHTML = '<p class="no-searches">Error loading slides.</p>';
    }
  }

  // ── Parchment Overlay ──────────────────────────────────────────────────────
  function openParchmentOverlay(subject, content) {
    var overlay = document.getElementById('parchment-overlay');
    document.getElementById('parchment-title').textContent = subject;
    document.getElementById('parchment-body').innerHTML =
      content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    overlay.style.display = 'flex';
    requestAnimationFrame(function() { overlay.classList.add('visible'); });
  }

  document.getElementById('parchment-close').addEventListener('click', function() {
    var overlay = document.getElementById('parchment-overlay');
    overlay.classList.remove('visible');
    setTimeout(function() { overlay.style.display = 'none'; }, 400);
  });

  // ── Create Script ──────────────────────────────────────────────────────────
  async function createScript(subject) {
    if (!currentUser) { alert('Sign in to create manuscripts.'); return; }
    oraclePanel.classList.add('open');
    oracleTabBtns.forEach(function(b) { b.classList.remove('active'); });
    document.querySelector('.oracle-tab-btn[data-tab="manuscripts"]').classList.add('active');
    oracleTabLocation.style.display      = 'none';
    oracleTabConversations.style.display = 'none';
    oracleTabManuscripts.style.display   = 'block';
    oracleTabSlides.style.display        = 'none';
    createSlidesBtn.style.display        = 'none';
    oracleSuggestions.style.display      = 'none';
    chatHistoryManuEl.innerHTML = '<p class="no-searches">Generating manuscript on <strong>' + escHtml(subject) + '</strong>…</p>';

    try {
      var resp = await fetch('/api/manuscript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Write a dedicated historical report on: ' + subject + '. Location context: ' + window._lastLocation + '. Background: ' + (window._lastResult || '').substring(0, 2000),
          systemPrompt: 'You are a professional historian. Write a comprehensive, evidence-based historical report of 500-600 words on the given subject.\n\nStructure:\n1. Who/what they were — brief identification (when, where)\n2. Historical context — what was happening at the time\n3. Key actions, decisions, or characteristics\n4. Causes and consequences\n5. Historical significance and legacy\n\nUse semi-formal, accessible academic language. Use **bold** for key terms and dates. Be factual — note uncertainty where it exists. No dramatisation.',
          maxTokens: 1800
        })
      });
      var data    = await resp.json();
      var content = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text)
        ? data.candidates[0].content.parts[0].text : 'Could not generate manuscript.';

      await db.ref('users/' + currentUser.uid + '/manuscripts').push({
        subject: subject, content: content, location: window._lastLocation,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });

      openParchmentOverlay(subject, content);
      loadManuscriptHistory();
    } catch(e) {
      chatHistoryManuEl.innerHTML = '<p class="no-searches">Error generating manuscript. Please try again.</p>';
    }
  }

  // ── Slides ────────────────────────────────────────────────────────────────
  async function handleCreateSlides(query) {
    var cleanTopic = query
      .replace(/create slides (about|on|for)?/i, '')
      .replace(/make slides (about|on|for)?/i, '')
      .trim() || window._lastLocation;

    appendOracleMsg('Generating slides about <strong>' + escHtml(cleanTopic) + '</strong>…', 'assistant');

    var thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'oracle-msg oracle-assistant oracle-thinking';
    thinkingDiv.innerHTML = '<span class="oracle-avatar">🔮</span><div class="oracle-bubble">Preparing slides…</div>';
    oracleMessages.appendChild(thinkingDiv);
    oracleMessages.scrollTop = oracleMessages.scrollHeight;

    try {
      var resp = await fetch('/api/manuscript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Create a historical presentation about: ' + cleanTopic + '. Context: ' + (window._lastResult || '').substring(0, 2000),
          systemPrompt: 'You are a historian creating an educational slide presentation. Return ONLY a valid JSON array with no markdown, no code blocks, no explanation.\n\nFormat exactly:\n[\n  {"title": "Slide Title", "period": "Optional time period", "content": "100-150 words of detailed factual content."},\n  ...\n]\n\nRules:\n- Generate 6-10 slides\n- First slide: overview/introduction\n- Last slide: legacy and significance\n- Each slide content must be 100-150 words\n- Be factually accurate',
          maxTokens: 3000
        })
      });
      var data = await resp.json();
      var raw = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text)
        ? data.candidates[0].content.parts[0].text : '[]';
      raw = raw.replace(/```json|```/g, '').trim();
      var slidesData = JSON.parse(raw);
      thinkingDiv.remove();

      if (!Array.isArray(slidesData) || !slidesData.length) throw new Error('No slides');

      openSlidesViewer(cleanTopic, slidesData);

      if (currentUser) {
        await db.ref('users/' + currentUser.uid + '/slides').push({
          topic: cleanTopic, slidesData: slidesData, slideCount: slidesData.length,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });
      }
    } catch(e) {
      thinkingDiv.remove();
      appendOracleMsg('Could not generate slides. Please try again.', 'assistant');
    }
  }

  // ── Slides Viewer ─────────────────────────────────────────────────────────
  function openSlidesViewer(topic, slidesData) {
    var overlay   = document.getElementById('slides-overlay');
    var container = document.getElementById('slides-container');
    var topicEl   = document.getElementById('slides-topic');
    var countEl   = document.getElementById('slides-count');
    var currentIdx = 0;

    topicEl.textContent = topic;

    function renderSlide(idx) {
      var slide = slidesData[idx];
      countEl.textContent = (idx + 1) + ' / ' + slidesData.length;
      container.innerHTML =
        '<div class="slide-inner">' +
          (slide.period ? '<div class="slide-period">' + escHtml(slide.period) + '</div>' : '') +
          '<h2 class="slide-title">' + escHtml(slide.title) + '</h2>' +
          '<div class="slide-content">' + slide.content.replace(/\n/g, '<br>') + '</div>' +
        '</div>';
    }

    renderSlide(0);
    overlay.style.display = 'flex';
    requestAnimationFrame(function() { overlay.classList.add('visible'); });

    document.getElementById('slide-prev').onclick = function() {
      if (currentIdx > 0) { currentIdx--; renderSlide(currentIdx); }
    };
    document.getElementById('slide-next').onclick = function() {
      if (currentIdx < slidesData.length - 1) { currentIdx++; renderSlide(currentIdx); }
    };
    document.getElementById('slide-close').onclick = closeSlidesViewer;
    document.getElementById('slide-export').onclick = function() { window.print(); };
  }

  function closeSlidesViewer() {
    var overlay = document.getElementById('slides-overlay');
    overlay.classList.remove('visible');
    setTimeout(function() { overlay.style.display = 'none'; }, 400);
  }

  // ── Search Suggestions ────────────────────────────────────────────────────
  const searchInput    = document.getElementById('search-input');
  const suggestionsBox = document.getElementById('search-suggestions');
  var   suggestTimer   = null;

  searchInput.addEventListener('input', function() {
    clearTimeout(suggestTimer);
    var q = searchInput.value.trim();
    if (q.length < 2) { suggestionsBox.style.display = 'none'; return; }
    suggestTimer = setTimeout(function() { fetchSuggestions(q); }, 350);
  });

  async function fetchSuggestions(q) {
    try {
      var resp = await fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=5');
      var data = await resp.json();
      if (!data.length) { suggestionsBox.style.display = 'none'; return; }
      suggestionsBox.innerHTML = '';
      data.forEach(function(place) {
        var div = document.createElement('div');
        div.className   = 'suggest-item';
        div.textContent = place.display_name;
        div.addEventListener('click', function() {
          searchInput.value = place.display_name.split(',')[0].trim();
          suggestionsBox.style.display = 'none';
        });
        suggestionsBox.appendChild(div);
      });
      suggestionsBox.style.display = 'block';
    } catch(e) {
      suggestionsBox.style.display = 'none';
    }
  }

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.search-bar-wrap')) suggestionsBox.style.display = 'none';
  });

  // ── Main Search ───────────────────────────────────────────────────────────
  const discoverBtn    = document.getElementById('discover-btn');
  const resultsSection = document.getElementById('results-section');
  const loadingEl      = document.getElementById('loading');
  const resultsContent = document.getElementById('results-content');
  const sourcesContainer = document.getElementById('sources-container');
  const bookmarkBar    = document.getElementById('bookmark-bar');

  discoverBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') doSearch(); });

  function doSearch() {
    var loc = searchInput.value.trim();
    if (!loc) { searchInput.focus(); return; }
    suggestionsBox.style.display = 'none';
    runSearch(loc);
  }

  async function runSearch(location) {
    speechSynthesis.cancel();
    ttsSummaryText  = '';
    ttsCharIndex    = 0;
    ttsTotalLen     = 0;
    ttsProgressFill.style.width = '0%';
    ttsTimeLabel.textContent    = '';
    ttsPlayBtn.style.display    = 'inline-flex';
    ttsPauseBtn.style.display   = 'none';

    oracleMessages.innerHTML = '';
    appendOracleMsg('Ask me anything about <strong>' + escHtml(location) + '</strong>.', 'assistant');
    oracleSuggestions.style.display = 'none';

    resultsSection.style.display = 'block';
    loadingEl.style.display      = 'flex';
    resultsContent.innerHTML     = '';
    sourcesContainer.innerHTML   = '';
    bookmarkBar.style.display    = 'none';
    showTab('explore');

    try {
      var resp = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: location })
      });
      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Research API error');
      if (!data.candidates || !data.candidates[0]) throw new Error('No response from AI');

      var content = data.candidates[0].content.parts[0].text;
      window._lastResult      = content;
      window._lastLocation    = location;
      window._lastSourcesData = data;
      window._lastImagesData  = [];

      displayResults(content, data, []);
      bookmarkBar.style.display = 'flex';
      oracleLocBadge.style.display = 'flex';
      oracleLocName.textContent    = location;
      showSuggestions(location);

      if (currentUser) saveSearch(location, content, data, [], 'search');

      // Fetch images in background then re-render
      fetchLocationImages(location, content).then(function(imgs) {
        window._lastImagesData = imgs;
        displayResults(content, data, imgs);
      });

    } catch(err) {
      resultsContent.innerHTML = '<div class="error-msg">⚠️ ' + escHtml(err.message) + '</div>';
    } finally {
      loadingEl.style.display = 'none';
    }
  }

  // ── Images ────────────────────────────────────────────────────────────────
  async function fetchLocationImages(location, content) {
    var imgs = [];
    var sections = [
      location + ' ancient historical ruins',
      location + ' historical landmark',
      location + ' traditional culture heritage'
    ];
    var boldMatch = content.match(/\*\*([A-Z][^*]{3,30})\*\*/);
    if (boldMatch) sections.unshift(boldMatch[1] + ' historical');

    for (var i = 0; i < Math.min(sections.length, 4); i++) {
      var query = sections[i];
      try {
        var resp = await fetch('/api/images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query })
        });
        var data = await resp.json();
        if (data.results && data.results.length) {
          imgs.push(Object.assign({ source: 'unsplash', query: query }, data.results[0]));
          if (imgs.length >= 5) break;
          continue;
        }
      } catch(e) { /* fall through */ }

      var wikiImg = await fetchWikiImage(query);
      if (wikiImg) {
        imgs.push(Object.assign({ source: 'wikipedia', query: query }, wikiImg));
        if (imgs.length >= 5) break;
      }
    }
    return imgs;
  }

  async function fetchWikiImage(query) {
    try {
      var r1   = await fetch('https://en.wikipedia.org/w/api.php?action=query&titles=' + encodeURIComponent(query) + '&prop=images&imlimit=6&format=json&origin=*');
      var d1   = await r1.json();
      var page = Object.values(d1.query && d1.query.pages ? d1.query.pages : {})[0];
      var valid = (page && page.images ? page.images : []).find(function(img) {
        var n = img.title.toLowerCase();
        return !n.includes('logo') && !n.includes('icon') && !n.includes('flag') &&
          (n.endsWith('.jpg') || n.endsWith('.png') || n.endsWith('.jpeg'));
      });
      if (!valid) return null;
      var r2   = await fetch('https://en.wikipedia.org/w/api.php?action=query&titles=' + encodeURIComponent(valid.title) + '&prop=imageinfo&iiprop=url|thumburl|extmetadata&iiurlwidth=380&format=json&origin=*');
      var d2   = await r2.json();
      var p2   = Object.values(d2.query && d2.query.pages ? d2.query.pages : {})[0];
      var info = p2 && p2.imageinfo ? p2.imageinfo[0] : null;
      if (!info || !info.thumburl) return null;
      var desc = (info.extmetadata && info.extmetadata.ImageDescription && info.extmetadata.ImageDescription.value)
        ? info.extmetadata.ImageDescription.value.replace(/<[^>]+>/g, '') : query;
      return { thumbUrl: info.thumburl, fullUrl: info.url, altDescription: desc.substring(0, 100) };
    } catch(e) { return null; }
  }

  // ── Display Results ───────────────────────────────────────────────────────
  function displayResults(content, data, images) {
    resultsContent.innerHTML = renderContent(content, images);

    resultsContent.querySelectorAll('.create-script-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { createScript(btn.dataset.subject); });
    });

    sourcesContainer.innerHTML = '';
    var meta = data && data.candidates && data.candidates[0] && data.candidates[0].groundingMetadata
      ? data.candidates[0].groundingMetadata : null;
    if (meta) {
      var chunks  = meta.groundingChunks || [];
      var queries = meta.webSearchQueries || [];
      if (chunks.some(function(c) { return c.web && c.web.uri; })) {
        var h = document.createElement('h3');
        h.className   = 'sources-heading';
        h.textContent = '📚 Sources';
        sourcesContainer.appendChild(h);
        chunks.forEach(function(c) {
          if (!c.web || !c.web.uri) return;
          var a = document.createElement('a');
          a.className = 'source-card'; a.href = c.web.uri; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.innerHTML = '<span class="source-icon">🔗</span><div class="source-info"><span class="source-title">' + escHtml(c.web.title || c.web.uri) + '</span><span class="source-url">' + escHtml(c.web.uri) + '</span></div>';
          sourcesContainer.appendChild(a);
        });
      } else if (queries.length) {
        var h2 = document.createElement('h3');
        h2.className   = 'sources-heading';
        h2.textContent = '🔍 Web Searches Used';
        sourcesContainer.appendChild(h2);
        queries.forEach(function(q) {
          var div = document.createElement('div');
          div.className = 'source-card';
          div.innerHTML = '<span class="source-icon">🔍</span><span>' + escHtml(q) + '</span>';
          sourcesContainer.appendChild(div);
        });
      }
    }
  }

  // ── Content Renderer ──────────────────────────────────────────────────────
  function renderContent(text, images) {
    var sections = text.split(/(?=^## )/gm).filter(function(s) { return s.trim(); });
    var html     = '';
    var imgIdx   = 0;

    sections.forEach(function(section, secIdx) {
      var lines   = section.split('\n');
      var heading = lines[0].replace(/^## /, '').trim();
      var body    = lines.slice(1).join('\n');

      var isNotableFigures = /Notable Figures/i.test(heading);
      var isMajorEvents    = /Major Events/i.test(heading);

      var imgHtml = '';
      if (secIdx > 0 && images[imgIdx]) {
        var img = images[imgIdx++];
        var attribution = '';
        if (img.source === 'unsplash') {
          attribution = '<div class="img-attribution">Photo by <a href="' + img.photographerUrl + '" target="_blank" rel="noopener noreferrer">' + escHtml(img.photographerName) + '</a> on <a href="' + img.photoPageUrl + '" target="_blank" rel="noopener noreferrer">Unsplash</a></div>';
        }
        imgHtml = '<figure class="inline-figure"><a href="' + img.fullUrl + '" target="_blank" rel="noopener noreferrer"><img src="' + img.thumbUrl + '" alt="' + escAttr(img.altDescription || heading) + '" loading="lazy"/></a>' +
          (img.altDescription ? '<figcaption>' + escHtml(img.altDescription.substring(0, 90)) + '</figcaption>' : '') +
          attribution + '</figure>';
      }

      var bodyHtml;
      if (isNotableFigures)   bodyHtml = renderFiguresOrEvents(body);
      else if (isMajorEvents) bodyHtml = renderFiguresOrEvents(body);
      else                    bodyHtml = renderMarkdownBody(body);

      if (secIdx === 0) {
        html += bodyHtml;
      } else {
        html += '<h2 class="result-section-heading">' + escHtml(heading) + '</h2>';
        if (imgHtml) {
          html += '<div class="section-with-image">' + imgHtml + '<div class="section-text">' + bodyHtml + '</div></div>';
        } else {
          html += bodyHtml;
        }
      }
    });
    return html;
  }

  function renderFiguresOrEvents(body) {
    var lines        = body.split('\n');
    var overviewLines = [];
    var restLines     = [];
    var hitFirst      = false;
    lines.forEach(function(line) {
      if (!hitFirst && (line.startsWith('###') || /^[-*]\s+\*\*/.test(line))) hitFirst = true;
      if (!hitFirst) overviewLines.push(line);
      else restLines.push(line);
    });
    var overviewHtml = renderMarkdownBody(overviewLines.join('\n'));
    var restText     = restLines.join('\n');
    var entries      = [];

    var h3Parts = restText.split(/^### /gm).filter(Boolean);
    if (h3Parts.length > 1) {
      h3Parts.forEach(function(part) {
        var ln   = part.split('\n');
        var name = ln[0].trim();
        var body = ln.slice(1).join('\n').trim();
        if (name) entries.push({ name: name, body: body });
      });
    } else {
      var bulletParts = restText.split(/^[-*]\s+(?=\*\*)/gm).filter(Boolean);
      bulletParts.forEach(function(part) {
        var match = part.match(/^\*\*(.+?)\*\*/);
        if (!match) return;
        entries.push({ name: match[1].trim(), body: part.replace(/^\*\*.+?\*\*\s*/, '').trim() });
      });
    }

    if (!entries.length) return overviewHtml + renderMarkdownBody(restText);

    var cardsHtml = entries.map(function(e) {
      var subject = e.name + ' — ' + window._lastLocation;
      return '<div class="history-card">' +
        '<div class="history-card-header">' +
          '<span class="history-card-name">' + escHtml(e.name) + '</span>' +
          '<button class="create-script-btn" data-subject="' + escAttr(subject) + '" title="Create manuscript">📜 Create Script</button>' +
        '</div>' +
        '<div class="history-card-body">' + renderMarkdownBody(e.body) + '</div>' +
        '</div>';
    }).join('');

    return overviewHtml + '<div class="history-cards">' + cardsHtml + '</div>';
  }

  function renderMarkdownBody(text) {
    return text
      .replace(/^### (.+)$/gm, '<h3 class="result-h3">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]+?<\/li>)+/g, function(m) { return '<ul>' + m + '</ul>'; })
      .replace(/\n\n+/g, '</p><p>')
      .replace(/^(?!<[hpuli\/])/gm, '<p>')
      .replace(/<p><\/p>/g, '')
      .replace(/\n/g, ' ');
  }

  function escHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) {
    return (s || '').replace(/"/g, '&quot;');
  }

  // ── Nav Tabs ──────────────────────────────────────────────────────────────
  const navTabs = document.querySelectorAll('.nav-tab');
  navTabs.forEach(function(tab) {
    tab.addEventListener('click', function(e) { e.preventDefault(); showTab(tab.dataset.tab); });
  });

  function showTab(tabId) {
    navTabs.forEach(function(t) { t.classList.remove('active'); });
    var active = document.querySelector('.nav-tab[data-tab="' + tabId + '"]');
    if (active) active.classList.add('active');

    resultsContent.style.display    = tabId === 'explore'   ? 'block' : 'none';
    sourcesContainer.style.display  = tabId === 'sources'   ? 'block' : 'none';
    document.getElementById('timeline-panel').style.display  = tabId === 'timeline'  ? 'block' : 'none';
    document.getElementById('artifacts-panel').style.display = tabId === 'artifacts' ? 'block' : 'none';

    if (tabId === 'timeline')  buildTimeline();
    if (tabId === 'artifacts') buildArtifacts();
  }

  // ── Timeline ──────────────────────────────────────────────────────────────
  async function buildTimeline() {
    var panel = document.getElementById('timeline-panel');
    if (!window._lastResult) {
      panel.innerHTML = '<p class="no-searches">Search a location first.</p>';
      return;
    }
    panel.innerHTML = '<h2 class="result-section-heading">🏛️ Historical Timeline — ' + escHtml(window._lastLocation) + '</h2>' +
      '<div class="loading-container"><div class="compass-spinner">🧭</div><p class="loading-text">Extracting timeline…</p></div>';
    try {
      var resp = await fetch('/api/timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: window._lastResult,
          systemPrompt: 'Extract exactly 10 key historical events from the content. Return ONLY a valid JSON array — no markdown, no code blocks, no explanation.\nFormat: [{"year":"753 BC","event":"One to two sentences describing the event including cause or consequence."}]\nChronological order. Span the full history of the location.',
          maxTokens: 900
        })
      });
      var data   = await resp.json();
      var raw    = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text)
        ? data.candidates[0].content.parts[0].text : '[]';
      raw        = raw.replace(/```json|```/g, '').trim();
      var events = JSON.parse(raw);
      panel.innerHTML = '<h2 class="result-section-heading">🏛️ Historical Timeline — ' + escHtml(window._lastLocation) + '</h2>' +
        '<div class="timeline-wrap"><div class="timeline-spine"></div>' +
        events.map(function(ev, i) {
          return '<div class="timeline-event" style="animation-delay:' + (i * 0.07) + 's">' +
            '<div class="timeline-dot"></div>' +
            '<div class="timeline-card">' +
              '<div class="timeline-year">' + escHtml(ev.year) + '</div>' +
              '<p>' + escHtml(ev.event) + '</p>' +
            '</div></div>';
        }).join('') + '</div>';
    } catch(e) {
      panel.innerHTML = '<p class="no-searches">Could not extract timeline. Please try again.</p>';
    }
  }

  // ── Artifacts ─────────────────────────────────────────────────────────────
  var leafletMapInstance = null;

  async function buildArtifacts() {
    var panel = document.getElementById('artifacts-panel');
    if (!window._lastLocation) {
      panel.innerHTML = '<p class="no-searches">Search a location first.</p>';
      return;
    }
    panel.innerHTML =
      '<h2 class="result-section-heading">🏺 Artifacts — ' + escHtml(window._lastLocation) + '</h2>' +
      '<div class="artifact-tabs">' +
        '<button class="art-tab active" data-atab="maps">🗺️ Maps</button>' +
        '<button class="art-tab" data-atab="paintings">🖼️ Paintings & Photos</button>' +
        '<button class="art-tab" data-atab="videos">🎥 Videos</button>' +
      '</div>' +
      '<div id="atab-maps" class="atab-pane">' +
        '<div id="leaflet-map" style="height:360px;width:100%;border-radius:8px;border:1px solid var(--border);"></div>' +
        '<div id="map-extent-info" class="map-extent-info"></div>' +
        '<div class="hist-maps-section"><h3 class="result-h3">📜 Historical Maps</h3><div id="hist-maps-grid" class="artifact-grid"></div></div>' +
      '</div>' +
      '<div id="atab-paintings" class="atab-pane" style="display:none;"><div id="paintings-grid" class="artifact-grid"></div></div>' +
      '<div id="atab-videos"   class="atab-pane" style="display:none;"><div id="videos-grid"   class="artifact-grid"></div></div>';

    panel.querySelectorAll('.art-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        panel.querySelectorAll('.art-tab').forEach(function(t) { t.classList.remove('active'); });
        panel.querySelectorAll('.atab-pane').forEach(function(p) { p.style.display = 'none'; });
        tab.classList.add('active');
        document.getElementById('atab-' + tab.dataset.atab).style.display = 'block';
      });
    });

    setTimeout(function() { initLeafletMap(window._lastLocation); }, 100);
    fetchPaintings(window._lastLocation);
    fetchVideos(window._lastLocation);
  }

  function initLeafletMap(location) {
    if (leafletMapInstance) { leafletMapInstance.remove(); leafletMapInstance = null; }
    leafletMapInstance = L.map('leaflet-map').setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 18
    }).addTo(leafletMapInstance);

    fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(location) + '&format=json&limit=1')
      .then(function(r) { return r.json(); })
      .then(function(results) {
        if (!results || !results.length) return;
        var lat = parseFloat(results[0].lat);
        var lon = parseFloat(results[0].lon);
        leafletMapInstance.setView([lat, lon], 6);
        L.marker([lat, lon]).addTo(leafletMapInstance).bindPopup('<b>' + escHtml(location) + '</b>').openPopup();

        var bb = results[0].boundingbox;
        if (bb) {
          var latSpan = Math.abs(parseFloat(bb[1]) - parseFloat(bb[0]));
          var lonSpan = Math.abs(parseFloat(bb[3]) - parseFloat(bb[2]));
          var midLat  = (parseFloat(bb[0]) + parseFloat(bb[1])) / 2;
          var latKm   = Math.round(latSpan * 111);
          var lonKm   = Math.round(lonSpan * 111 * Math.cos(midLat * Math.PI / 180));
          var extEl   = document.getElementById('map-extent-info');
          if (extEl) {
            extEl.innerHTML =
              '<div class="extent-row">' +
                '<div class="extent-item"><span class="extent-label">Latitudinal Extent</span><span class="extent-value">' + latSpan.toFixed(2) + '° · ~' + latKm + ' km</span></div>' +
                '<div class="extent-item"><span class="extent-label">Longitudinal Extent</span><span class="extent-value">' + lonSpan.toFixed(2) + '° · ~' + lonKm + ' km</span></div>' +
              '</div>';
          }
        }
      }).catch(function() {});

    fetchHistoricalMaps(location);
  }

  async function fetchHistoricalMaps(location) {
    var grid = document.getElementById('hist-maps-grid');
    if (!grid) return;
    grid.innerHTML = '<p class="no-searches">Searching map archives…</p>';
    try {
      var terms = [location + ' historical map', location + ' ancient map', location + ' old map 18th century'];
      var count = 0;
      var seen  = new Set();
      grid.innerHTML = '';
      for (var i = 0; i < terms.length; i++) {
        if (count >= 6) break;
        var resp = await fetch('https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=' + encodeURIComponent(terms[i]) + '&srnamespace=6&srlimit=8&format=json&origin=*');
        var data = await resp.json();
        var results = data.query && data.query.search ? data.query.search : [];
        for (var j = 0; j < results.length; j++) {
          if (count >= 6) break;
          var r  = results[j];
          if (seen.has(r.title)) continue;
          seen.add(r.title);
          var tl = r.title.toLowerCase();
          if (!tl.includes('map') && !tl.includes('carte') && !tl.includes('karte') && !tl.includes('mapa')) continue;
          if (tl.endsWith('.pdf') || tl.endsWith('.svg') || tl.includes('icon') || tl.includes('logo')) continue;
          var card = await fetchWikimediaCard(r.title);
          if (card) { grid.appendChild(card); count++; }
        }
      }
      if (!count) grid.innerHTML = '<p class="no-searches">No historical maps found.</p>';
    } catch(e) {
      grid.innerHTML = '<p class="no-searches">Could not load historical maps.</p>';
    }
  }

  async function fetchPaintings(location) {
    var grid = document.getElementById('paintings-grid');
    if (!grid) return;
    grid.innerHTML = '<p class="no-searches">Loading…</p>';
    try {
      var count = 0;
      grid.innerHTML = '';

      var unsplashTerms = [location + ' ancient ruins monument', location + ' historical heritage'];
      for (var i = 0; i < unsplashTerms.length; i++) {
        if (count >= 4) break;
        try {
          var resp = await fetch('/api/images', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: unsplashTerms[i] })
          });
          var data = await resp.json();
          var imgs = data.results || [];
          for (var k = 0; k < imgs.length; k++) {
            if (count >= 4) break;
            var img  = imgs[k];
            var card = document.createElement('div');
            card.className = 'artifact-card';
            card.innerHTML =
              '<a href="' + img.photoPageUrl + '" target="_blank" rel="noopener noreferrer">' +
                '<img src="' + img.thumbUrl + '" alt="' + escAttr(img.altDescription || unsplashTerms[i]) + '" loading="lazy"/>' +
                '<div class="artifact-caption">' +
                  '<p>' + escHtml((img.altDescription || unsplashTerms[i]).substring(0, 80)) + '</p>' +
                  '<p class="img-attribution-small">Photo by <a href="' + img.photographerUrl + '" target="_blank" rel="noopener noreferrer">' + escHtml(img.photographerName) + '</a> on <a href="https://unsplash.com?utm_source=ancient_trace&utm_medium=referral" target="_blank" rel="noopener noreferrer">Unsplash</a></p>' +
                '</div>' +
              '</a>';
            grid.appendChild(card);
            count++;
          }
        } catch(e) { /* continue */ }
      }

      var wikiTerms = [location + ' painting historical illustration', location + ' ancient photograph'];
      for (var wi = 0; wi < wikiTerms.length; wi++) {
        if (count >= 8) break;
        try {
          var wresp = await fetch('https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=' + encodeURIComponent(wikiTerms[wi]) + '&srnamespace=6&srlimit=6&format=json&origin=*');
          var wdata = await wresp.json();
          var wresults = wdata.query && wdata.query.search ? wdata.query.search : [];
          for (var wj = 0; wj < wresults.length; wj++) {
            if (count >= 8) break;
            var wr = wresults[wj];
            var wtl = wr.title.toLowerCase();
            if (wtl.endsWith('.pdf') || wtl.endsWith('.svg') || wtl.includes('map') || wtl.includes('logo')) continue;
            var wcard = await fetchWikimediaCard(wr.title);
            if (wcard) { grid.appendChild(wcard); count++; }
          }
        } catch(e) { /* continue */ }
      }

      if (!count) grid.innerHTML = '<p class="no-searches">No paintings or photos found.</p>';
    } catch(e) {
      grid.innerHTML = '<p class="no-searches">Could not load paintings and photos.</p>';
    }
  }

  async function fetchVideos(location) {
    var grid = document.getElementById('videos-grid');
    if (!grid) return;
    grid.innerHTML = '<p class="no-searches">Finding documentaries…</p>';
    try {
      var resp = await fetch('/api/oracle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'List the 5 best YouTube documentary or educational videos about the history of "' + location + '". Only include well-known videos from major channels: BBC, National Geographic, Smithsonian Channel, History Channel, or established academic YouTube channels.',
          systemPrompt: 'Return ONLY a valid JSON array. No markdown, no code blocks, no explanation.\nFormat exactly:\n[{"title":"Video Title","channel":"Channel Name","url":"https://www.youtube.com/watch?v=VIDEO_ID_HERE","description":"One sentence about what this video covers."}]\nOnly include videos you are highly confident exist. If unsure of the exact video ID, use a search URL: https://www.youtube.com/results?search_query=SEARCH+TERMS',
          maxTokens: 800
        })
      });
      var data = await resp.json();
      var raw  = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text)
        ? data.candidates[0].content.parts[0].text : '[]';
      raw = raw.replace(/```json|```/g, '').trim();
      var videos = JSON.parse(raw);

      grid.innerHTML = '';
      if (!videos.length) throw new Error('No videos');

      videos.forEach(function(v) {
        var a = document.createElement('a');
        a.className = 'video-card'; a.href = v.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.innerHTML =
          '<div class="video-icon">🎥</div>' +
          '<div class="video-info">' +
            '<div class="video-title">'   + escHtml(v.title)       + '</div>' +
            '<div class="video-channel">' + escHtml(v.channel)     + '</div>' +
            '<div class="video-desc">'    + escHtml(v.description) + '</div>' +
          '</div>' +
          '<div class="video-arrow">→</div>';
        grid.appendChild(a);
      });
    } catch(e) {
      grid.innerHTML =
        '<div class="video-fallback">' +
          '<p>Search for documentaries on YouTube:</p>' +
          '<a class="yt-search-link" href="https://www.youtube.com/results?search_query=' + encodeURIComponent((window._lastLocation || '') + ' history documentary') + '" target="_blank" rel="noopener noreferrer">' +
            '▶ Search "' + escHtml(window._lastLocation || '') + ' history" on YouTube' +
          '</a>' +
        '</div>';
    }
  }

  async function fetchWikimediaCard(title) {
    try {
      var resp = await fetch('https://commons.wikimedia.org/w/api.php?action=query&titles=' + encodeURIComponent(title) + '&prop=imageinfo&iiprop=url|thumburl|extmetadata&iiurlwidth=300&format=json&origin=*');
      var data = await resp.json();
      var page = Object.values(data.query && data.query.pages ? data.query.pages : {})[0];
      var info = page && page.imageinfo ? page.imageinfo[0] : null;
      if (!info || !info.thumburl) return null;
      var desc = (info.extmetadata && info.extmetadata.ImageDescription && info.extmetadata.ImageDescription.value)
        ? info.extmetadata.ImageDescription.value.replace(/<[^>]+>/g, '')
        : title.replace('File:', '').replace(/\.[^.]+$/, '');
      var card = document.createElement('div');
      card.className = 'artifact-card';
      card.innerHTML =
        '<a href="' + info.url + '" target="_blank" rel="noopener noreferrer">' +
          '<img src="' + info.thumburl + '" alt="' + escAttr(desc.substring(0, 80)) + '" loading="lazy"/>' +
          '<div class="artifact-caption"><p>' + escHtml(desc.substring(0, 80)) + '</p></div>' +
        '</a>';
      return card;
    } catch(e) { return null; }
  }

  // ── Service Worker ─────────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(function() {});
  }

  // ── Global state init ──────────────────────────────────────────────────────
  window._lastResult      = '';
  window._lastLocation    = '';
  window._lastSourcesData = null;
  window._lastImagesData  = [];

});
