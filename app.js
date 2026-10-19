(function (root) {
  'use strict';

  var data = root.PROOFLOOP_DATA || root.proofLoopData;
  if (!data) {
    return;
  }

  var defaultWeights = {};
  data.criteria.forEach(function (criterion) {
    defaultWeights[criterion.id] = Number(criterion.weight) || 0;
  });

  var defaultBrief = (data.briefs || []).filter(function (brief) {
    return brief.id === (data.defaults && data.defaults.briefId);
  })[0] || (data.briefs || [])[0] || {
    id: 'default',
    question: 'Which laptop is the best fit?',
    budget: '',
    weights: defaultWeights
  };

  var state = {
    weights: copy(defaultBrief.weights || defaultWeights),
    briefId: defaultBrief.id,
    question: defaultBrief.question,
    budget: defaultBrief.budget,
    activeTab: data.defaults && data.defaults.activeTab || 'evidence',
    selectedProductId: data.defaults && data.defaults.selectedProductId || data.products[0].id,
    selectedSourceId: data.defaults && data.defaults.selectedSourceId || (data.sources[0] && data.sources[0].id),
    scores: [],
    initialized: false
  };
  var userSourceSequence = 0;
  var STORAGE_KEY = 'proofloop.workspace.v1';
  var storageRestored = false;

  function copy(object) {
    var result = {};
    Object.keys(object).forEach(function (key) { result[key] = object[key]; });
    return result;
  }

  function storage() {
    try {
      return root.localStorage || null;
    } catch (error) {
      return null;
    }
  }

  function setStorageStatus(label) {
    all('#storage-status').forEach(function (target) { target.textContent = label; });
  }

  function persistedPayload() {
    return {
      version: 1,
      briefId: state.briefId,
      question: state.question,
      budget: state.budget,
      weights: state.weights,
      activeTab: state.activeTab,
      selectedProductId: state.selectedProductId,
      selectedSourceId: state.selectedSourceId,
      userSources: data.sources.filter(function (source) { return source.userProvided === true; })
    };
  }

  function persist() {
    var store = storage();
    if (!store) return;
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(persistedPayload()));
      setStorageStatus('Saved locally');
    } catch (error) {
      setStorageStatus('Local save unavailable');
    }
  }

  function restorePersisted() {
    var store = storage();
    if (!store) return;
    try {
      var raw = store.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (!saved || saved.version !== 1) return;
      if (saved.briefId) {
        var brief = briefById(saved.briefId);
        state.briefId = brief.id;
        state.question = typeof saved.question === 'string' ? saved.question : brief.question;
        state.budget = typeof saved.budget === 'string' ? saved.budget : brief.budget;
      }
      if (saved.weights && typeof saved.weights === 'object') {
        data.criteria.forEach(function (criterion) {
          var value = Number(saved.weights[criterion.id]);
          if (Number.isFinite(value) && value >= 0) state.weights[criterion.id] = value;
        });
      }
      if (['evidence', 'assumptions', 'conflicts'].indexOf(saved.activeTab) >= 0) state.activeTab = saved.activeTab;
      if (data.products.some(function (product) { return product.id === saved.selectedProductId; })) state.selectedProductId = saved.selectedProductId;
      (saved.userSources || []).forEach(function (source) {
        if (!source || !source.id || !source.productId || !source.userProvided) return;
        if (!data.products.some(function (product) { return product.id === source.productId; })) return;
        if (data.sources.some(function (existing) { return existing.id === source.id; })) return;
        data.sources.push(source);
        var product = productById(source.productId);
        product.sourceIds = product.sourceIds || [];
        if (product.sourceIds.indexOf(source.id) < 0) product.sourceIds.push(source.id);
      });
      if (data.sources.some(function (source) { return source.id === saved.selectedSourceId; })) state.selectedSourceId = saved.selectedSourceId;
      storageRestored = true;
      setStorageStatus('Restored locally');
    } catch (error) {
      setStorageStatus('Local demo');
    }
  }

  function clearUserSources() {
    data.sources = data.sources.filter(function (source) { return source.userProvided !== true; });
    data.products.forEach(function (product) {
      product.sourceIds = (product.sourceIds || []).filter(function (sourceId) {
        return data.sources.some(function (source) { return source.id === sourceId; });
      });
    });
  }

  function all(selector) {
    if (!root.document || !root.document.querySelectorAll) return [];
    return Array.prototype.slice.call(root.document.querySelectorAll(selector));
  }

  function first(selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      var element = root.document && root.document.querySelector(selectors[i]);
      if (element) return element;
    }
    return null;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function productById(id) {
    return data.products.filter(function (product) { return product.id === id; })[0] || data.products[0];
  }

  function sourceById(id) {
    return data.sources.filter(function (source) { return source.id === id; })[0] || data.sources[0];
  }

  function sourceTypeLabel(source) {
    return source && source.type === 'user-provided' ? 'User-provided evidence' : String(source && source.type || '').replace('-', ' ');
  }

  function sourceCountLabel() {
    return data.sources.length + ' source' + (data.sources.length === 1 ? '' : 's');
  }

  function briefById(id) {
    return (data.briefs || []).filter(function (brief) { return brief.id === id; })[0] || defaultBrief;
  }

  function calculateScores(weights) {
    var activeWeights = weights || state.weights;
    var totalWeight = data.criteria.reduce(function (sum, criterion) {
      return sum + Math.max(0, Number(activeWeights[criterion.id]) || 0);
    }, 0);
    if (!totalWeight) totalWeight = 1;

    return data.products.map(function (product) {
      var weightedTotal = data.criteria.reduce(function (sum, criterion) {
        var criterionScore = Number(product.scores[criterion.id]) || 0;
        var weight = Math.max(0, Number(activeWeights[criterion.id]) || 0);
        return sum + criterionScore * weight;
      }, 0);
      return {
        productId: product.id,
        score: Math.round((weightedTotal / totalWeight) * 10) / 10
      };
    }).sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.productId.localeCompare(b.productId);
    });
  }

  function calculateSensitivity(weights) {
    var activeWeights = weights || state.weights;
    var totalWeight = data.criteria.reduce(function (sum, criterion) {
      return sum + Math.max(0, Number(activeWeights[criterion.id]) || 0);
    }, 0);
    if (!totalWeight) {
      return {
        active: false,
        winnerId: null,
        winnerName: null,
        winnerScore: 0,
        scoreGap: 0,
        criteria: data.criteria.map(function (criterion) {
          return {
            id: criterion.id,
            label: criterion.label,
            currentPercent: 0,
            changeAt: null,
            challengerId: null,
            challengerName: null
          };
        })
      };
    }

    var ranked = calculateScores(activeWeights);
    var winnerId = ranked[0].productId;
    var winner = productById(winnerId);
    var runnerUp = ranked[1];
    var sensitivityCriteria = data.criteria.map(function (criterion) {
      var currentWeight = Math.max(0, Number(activeWeights[criterion.id]) || 0);
      var currentPercent = Math.round((currentWeight / totalWeight) * 100);
      var otherTotal = totalWeight - currentWeight;
      var threshold = null;

      for (var percent = 0; percent <= 100; percent += 1) {
        var candidateWeights = {};
        data.criteria.forEach(function (candidateCriterion) {
          if (candidateCriterion.id === criterion.id) {
            candidateWeights[candidateCriterion.id] = percent / 100;
          } else if (otherTotal) {
            var otherWeight = Math.max(0, Number(activeWeights[candidateCriterion.id]) || 0);
            candidateWeights[candidateCriterion.id] = (otherWeight / otherTotal) * (1 - (percent / 100));
          } else {
            candidateWeights[candidateCriterion.id] = 0;
          }
        });

        var candidateWinner = calculateScores(candidateWeights)[0];
        if (candidateWinner.productId !== winnerId) {
          var distance = Math.abs(percent - currentPercent);
          if (!threshold || distance < threshold.distance || (distance === threshold.distance && percent < threshold.changeAt)) {
            threshold = {
              changeAt: percent,
              distance: distance,
              challengerId: candidateWinner.productId
            };
          }
        }
      }

      return {
        id: criterion.id,
        label: criterion.label,
        currentPercent: currentPercent,
        changeAt: threshold ? threshold.changeAt : null,
        challengerId: threshold ? threshold.challengerId : null,
        challengerName: threshold ? productById(threshold.challengerId).name : null
      };
    });

    return {
      active: true,
      winnerId: winnerId,
      winnerName: winner.name,
      winnerScore: ranked[0].score,
      scoreGap: runnerUp ? Math.round((ranked[0].score - runnerUp.score) * 10) / 10 : ranked[0].score,
      criteria: sensitivityCriteria
    };
  }

  function recommendation() {
    var top = state.scores[0];
    return top ? productById(top.productId) : data.products[0];
  }

  function scoreFor(productId) {
    var result = state.scores.filter(function (entry) { return entry.productId === productId; })[0];
    return result ? result.score : 0;
  }

  function renderRecommendation() {
    var product = recommendation();
    var score = scoreFor(product.id);
    all('#recommendation, #recommendation-card, [data-recommendation], .recommendation').forEach(function (target) {
      target.innerHTML = '<div class="proofloop-recommendation__eyebrow">Recommended for your current weights</div>' +
        '<h2>' + escapeHtml(product.name) + '</h2>' +
        '<p class="proofloop-score" aria-label="Overall score">' + escapeHtml(score.toFixed(1)) + '<span>/100</span></p>' +
        '<p>' + escapeHtml(product.summary) + '</p>' +
        '<p class="proofloop-meta">Starting at ' + escapeHtml(formatPrice(product.price, product.currency)) + ' · ' + escapeHtml(product.configuration) + '</p>';
      target.setAttribute('data-product-id', product.id);
    });

    all('#recommendation-reason, [data-recommendation-reason], .recommendation-reason').forEach(function (target) {
      target.textContent = recommendationReason(product);
    });
  }

  function renderBrief() {
    all('#question-copy').forEach(function (target) {
      var question = escapeHtml(state.question);
      if (state.budget) question = question.replace(escapeHtml(state.budget), '<strong>' + escapeHtml(state.budget) + '</strong>');
      target.innerHTML = question;
    });
    all('#brief-preview-question').forEach(function (target) { target.textContent = state.question; });
    all('#brief-persona').forEach(function (target) { target.value = state.briefId; });
  }

  function recommendationReason(product) {
    var ranked = data.criteria.map(function (criterion) {
      return { label: criterion.label, score: Number(product.scores[criterion.id]) || 0, weight: state.weights[criterion.id] || 0 };
    }).sort(function (a, b) { return (b.score * b.weight) - (a.score * a.weight); });
    var strengths = ranked.slice(0, 2).map(function (item) { return item.label.toLowerCase(); });
    return product.name + ' leads because it balances ' + strengths.join(' and ') + ' under the current weighting.';
  }

  function renderScores() {
    all('#score-list, #product-scores, [data-score-list], .score-list').forEach(function (target) {
      target.innerHTML = state.scores.map(function (entry, index) {
        var product = productById(entry.productId);
        return '<button type="button" class="proofloop-score-row' + (index === 0 ? ' is-leading' : '') + '" data-product-id="' + escapeHtml(product.id) + '" aria-label="Inspect evidence for ' + escapeHtml(product.name) + '">' +
          '<span class="proofloop-rank">' + (index + 1) + '</span>' +
          '<span class="proofloop-product-name">' + escapeHtml(product.name) + '</span>' +
          '<strong>' + escapeHtml(entry.score.toFixed(1)) + '</strong>' +
          '</button>';
      }).join('');
    });
  }

  function renderCriteria() {
    var targets = all('#criteria-list, #weights-list, [data-criteria-list], .criteria-list');
    targets.forEach(function (target) {
      target.innerHTML = data.criteria.map(function (criterion) {
        var percent = Math.round((state.weights[criterion.id] || 0) * 100);
        return '<div class="proofloop-criterion" data-criterion="' + escapeHtml(criterion.id) + '">' +
          '<div class="proofloop-criterion__header"><label for="proofloop-weight-' + escapeHtml(criterion.id) + '">' + escapeHtml(criterion.label) + '</label>' +
          '<output data-weight-output="' + escapeHtml(criterion.id) + '">' + percent + '%</output></div>' +
          '<input id="proofloop-weight-' + escapeHtml(criterion.id) + '" type="range" min="0" max="100" step="1" value="' + percent + '" data-criterion="' + escapeHtml(criterion.id) + '" aria-label="Weight ' + escapeHtml(criterion.label) + '">' +
          '<small>' + escapeHtml(criterion.description) + '</small>' +
          '</div>';
      }).join('');
    });
  }

  function renderSensitivity() {
    var targets = all('#sensitivity-view, [data-sensitivity-view], .sensitivity-view');
    if (!targets.length) return;
    var analysis = calculateSensitivity();

    targets.forEach(function (target) {
      if (!analysis.active) {
        target.innerHTML = '<div class="sensitivity-empty" aria-live="polite">Give at least one criterion some weight to see how stable the recommendation is.</div>';
        return;
      }

      var rows = analysis.criteria.map(function (item) {
        var currentMarker = '<span class="sensitivity-bar__current" style="left:' + item.currentPercent + '%" aria-hidden="true"></span>';
        var result;
        if (item.changeAt === null) {
          result = '<strong>Stable</strong><span>No winner change across the tested range.</span>';
        } else {
          result = '<strong>Changes at ' + item.changeAt + '%</strong><span>' + escapeHtml(item.challengerName) + ' takes the lead.</span>';
        }
        return '<div class="sensitivity-row">' +
          '<div class="sensitivity-row__header"><strong>' + escapeHtml(item.label) + '</strong><span>Current ' + item.currentPercent + '%</span></div>' +
          '<div class="sensitivity-bar" role="img" aria-label="' + escapeHtml(item.label + ' is currently weighted at ' + item.currentPercent + ' percent' + (item.changeAt === null ? '; no winner change across the tested range' : '; winner changes at ' + item.changeAt + ' percent')) + '">' +
            '<span class="sensitivity-bar__track"></span>' + currentMarker + (item.changeAt === null ? '' : '<span class="sensitivity-bar__threshold" style="left:' + item.changeAt + '%" aria-hidden="true"></span>') +
          '</div>' +
          '<div class="sensitivity-row__result">' + result + '</div>' +
        '</div>';
      }).join('');

      target.innerHTML = '<div class="sensitivity-summary" aria-live="polite"><span>Current pick</span><strong>' + escapeHtml(analysis.winnerName) + '</strong><span>leads by ' + escapeHtml(analysis.scoreGap.toFixed(1)) + ' points.</span></div>' +
        '<div class="sensitivity-legend"><span><i class="sensitivity-legend__current"></i>Current effective weight</span><span><i class="sensitivity-legend__threshold"></i>Crossover point</span></div>' +
        '<div class="sensitivity-list">' + rows + '</div>' +
        '<p class="sensitivity-note">Each criterion is swept from 0–100% while the other priorities keep their relative proportions.</p>';
    });
  }

  function renderEvidence() {
    var product = productById(state.selectedProductId);
    var sourceIds = product.sourceIds || [];
    all('#source-lens-text, [data-source-lens]').forEach(function (target) {
      target.innerHTML = 'Showing the evidence lens for <strong>' + escapeHtml(product.name) + '</strong>';
    });
    all('#evidence-list, #sources-list, [data-evidence-list], .evidence-list').forEach(function (target) {
      target.innerHTML = sourceIds.map(function (sourceId) {
        var source = sourceById(sourceId);
        if (!source) return '';
        var selected = source.id === state.selectedSourceId;
        return '<button type="button" class="proofloop-evidence-item' + (selected ? ' is-selected' : '') + '" data-source-id="' + escapeHtml(source.id) + '" aria-pressed="' + selected + '">' +
          '<span class="proofloop-source-type' + (source.type === 'user-provided' ? ' is-user-provided' : '') + '">' + escapeHtml(sourceTypeLabel(source)) + '</span>' +
          '<strong>' + escapeHtml(source.publisher) + '</strong>' +
          '<span>' + escapeHtml(source.title) + '</span>' +
          '</button>';
      }).join('');
    });

    var selected = sourceIds.map(sourceById).filter(function (source) { return Boolean(source); }).filter(function (source) { return source.id === state.selectedSourceId; })[0] || sourceById(sourceIds[0]);
    all('#source-detail, #evidence-detail, [data-source-detail], .source-detail').forEach(function (target) {
      if (!selected) {
        target.textContent = 'Select a source to inspect its evidence.';
        return;
      }
      var sourceLink = selected.url ? '<a href="' + escapeHtml(selected.url) + '" target="_blank" rel="noopener noreferrer">Open source</a>' : '';
      var removeAction = selected.type === 'user-provided' ? '<button type="button" class="button button-ghost remove-source-button" data-action="remove-source" data-source-id="' + escapeHtml(selected.id) + '">Remove user-provided evidence</button>' : '';
      target.innerHTML = '<p class="proofloop-source-meta' + (selected.type === 'user-provided' ? ' is-user-provided' : '') + '">' + escapeHtml(selected.publisher) + ' · ' + escapeHtml(sourceTypeLabel(selected)) + (selected.published ? ' · ' + escapeHtml(selected.published) : '') + '</p>' +
         '<blockquote>“' + escapeHtml(selected.quote) + '”</blockquote>' +
         '<p>' + escapeHtml(selected.reliability) + '</p>' +
         sourceLink + removeAction;
    });
  }

  function renderSourceCounts() {
    var label = sourceCountLabel();
    all('[data-source-count]').forEach(function (target) { target.textContent = label; });
    all('.inspector-count').forEach(function (target) { target.textContent = String(data.sources.length).padStart(2, '0') + ' sources'; });
  }

  function renderList(selector, items, emptyText, formatter) {
    all(selector).forEach(function (target) {
      target.innerHTML = items.length ? items.map(formatter).join('') : '<p>' + escapeHtml(emptyText) + '</p>';
    });
  }

  function renderAssumptions() {
    renderList('#assumptions-list, [data-assumptions-list], .assumptions-list', data.assumptions, 'No assumptions recorded.', function (item) {
      return '<article class="proofloop-assumption"><h3>' + escapeHtml(item.title) + '</h3><p>' + escapeHtml(item.detail) + '</p></article>';
    });
  }

  function renderConflicts() {
    renderList('#conflicts-list, [data-conflicts-list], .conflicts-list', data.conflicts, 'No conflicts recorded.', function (item) {
      var manufacturer = sourceById(item.manufacturerSourceId);
      var independent = sourceById(item.independentSourceId);
      return '<article class="proofloop-conflict" data-conflict-id="' + escapeHtml(item.id) + '">' +
        '<span class="proofloop-conflict-severity">' + escapeHtml(item.severity) + ' conflict</span>' +
        '<h3>' + escapeHtml(item.title) + '</h3><p>' + escapeHtml(item.summary) + '</p>' +
        '<dl><dt>Manufacturer</dt><dd>“' + escapeHtml(manufacturer.quote) + '”</dd><dt>Independent test</dt><dd>“' + escapeHtml(independent.quote) + '”</dd></dl>' +
        '<p><strong>How it is handled:</strong> ' + escapeHtml(item.resolution) + '</p></article>';
    });
  }

  function renderTabs() {
    all('[data-tab], .proofloop-tab, .tab').forEach(function (tab) {
      var tabName = tab.getAttribute('data-tab') || tab.getAttribute('aria-controls') || '';
      tabName = tabName.replace(/-panel$/, '').replace(/^tab-/, '');
      var active = tabName === state.activeTab;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      if (tab.tagName === 'BUTTON') tab.setAttribute('tabindex', active ? '0' : '-1');
    });
    ['evidence', 'assumptions', 'conflicts'].forEach(function (name) {
      all('#' + name + '-panel, [data-tab-panel="' + name + '"], .' + name + '-panel').forEach(function (panel) {
        var visible = state.activeTab === name;
        panel.hidden = !visible;
        panel.setAttribute('aria-hidden', String(!visible));
      });
    });
  }

  function updateWeight(criterionId, rawValue) {
    if (!Object.prototype.hasOwnProperty.call(defaultWeights, criterionId)) return;
    var value = Math.max(0, Math.min(100, Number(rawValue) || 0));
    state.weights[criterionId] = value / 100;
    all('[data-weight-output="' + criterionId + '"]').forEach(function (output) { output.textContent = Math.round(value) + '%'; });
    all('input[data-criterion="' + criterionId + '"]').forEach(function (input) {
      input.style.background = 'linear-gradient(to right, #e56c4d 0%, #e56c4d ' + value + '%, #f0f3f2 ' + value + '%, #f0f3f2 100%)';
    });
    state.scores = calculateScores();
    renderRecommendation();
    renderScores();
    renderSensitivity();
    persist();
  }

  function reset() {
    var store = storage();
    if (store) {
      try { store.removeItem(STORAGE_KEY); } catch (error) { /* best effort */ }
    }
    clearUserSources();
    state.weights = copy(defaultBrief.weights || defaultWeights);
    state.briefId = defaultBrief.id;
    state.question = defaultBrief.question;
    state.budget = defaultBrief.budget;
    state.activeTab = data.defaults && data.defaults.activeTab || 'evidence';
    state.selectedProductId = data.defaults && data.defaults.selectedProductId || data.products[0].id;
    state.selectedSourceId = data.defaults && data.defaults.selectedSourceId || (data.sources[0] && data.sources[0].id);
    storageRestored = false;
    render();
    setStorageStatus('Demo reset');
  }

  function setBrief(briefId) {
    var brief = briefById(briefId);
    state.briefId = brief.id;
    state.question = brief.question;
    state.budget = brief.budget;
    state.weights = copy(brief.weights || defaultWeights);
    render();
    persist();
  }

  function setBriefModal(open) {
    var modal = first(['#brief-modal']);
    if (!modal) return;
    modal.hidden = !open;
    if (open) {
      renderBrief();
      var select = first(['#brief-persona']);
      if (select && select.focus) select.focus();
    }
  }

  function setEvidenceModal(open) {
    var modal = first(['#evidence-modal']);
    if (!modal) return;
    modal.hidden = !open;
    if (open) {
      all('#evidence-product-name').forEach(function (target) { target.textContent = productById(state.selectedProductId).name; });
      var titleInput = first(['#evidence-title-input']);
      if (titleInput && titleInput.focus) titleInput.focus();
    }
  }

  function addUserSource(form) {
    var title = String((form.elements['evidence-title'] && form.elements['evidence-title'].value) || '').trim();
    var publisher = String((form.elements['evidence-publisher'] && form.elements['evidence-publisher'].value) || '').trim();
    var url = String((form.elements['evidence-url'] && form.elements['evidence-url'].value) || '').trim();
    var quote = String((form.elements['evidence-quote'] && form.elements['evidence-quote'].value) || '').trim();
    if (!title || !publisher || !quote) return;

    userSourceSequence += 1;
    var source = {
      id: 'user-source-' + Date.now().toString(36) + '-' + userSourceSequence,
      productId: state.selectedProductId,
      publisher: publisher,
      type: 'user-provided',
      userProvided: true,
      title: title,
      url: url,
      published: 'Added locally',
      reliability: 'Pasted by the user; not independently verified.',
      quote: quote,
      claims: []
    };
    data.sources.push(source);
    var product = productById(state.selectedProductId);
    product.sourceIds = product.sourceIds || [];
    product.sourceIds.push(source.id);
    state.selectedSourceId = source.id;
    renderEvidence();
    renderSourceCounts();
    persist();
    form.reset();
    setEvidenceModal(false);
  }

  function removeUserSource(sourceId) {
    var sourceIndex = data.sources.findIndex(function (source) { return source.id === sourceId; });
    if (sourceIndex < 0 || data.sources[sourceIndex].type !== 'user-provided' || !data.sources[sourceIndex].userProvided) return;
    data.sources.splice(sourceIndex, 1);
    data.products.forEach(function (product) {
      if (!product.sourceIds) return;
      product.sourceIds = product.sourceIds.filter(function (id) { return id !== sourceId; });
    });
    if (state.selectedSourceId === sourceId) {
      var product = productById(state.selectedProductId);
      state.selectedSourceId = product.sourceIds && product.sourceIds[0];
    }
    renderEvidence();
    renderSourceCounts();
    persist();
  }

  function buildReport() {
    var product = recommendation();
    var score = scoreFor(product.id);
    var lines = [
      '# ProofLoop decision report',
      '',
      '**Question:** ' + state.question,
      '**Recommendation:** ' + product.name + ' (' + score.toFixed(1) + '/100)',
      '**Generated:** ' + new Date().toISOString(),
      '',
      '## Why this recommendation',
      product.summary,
      '',
      recommendationReason(product),
      '',
      '## Score breakdown',
      ''
    ];
    data.criteria.forEach(function (criterion) {
      lines.push('- **' + criterion.label + ':** ' + (Number(product.scores[criterion.id]) || 0) + '/100 · weight ' + Math.round((state.weights[criterion.id] || 0) * 100) + '%');
    });
    lines.push('', '## Evidence used', '');
    (product.sourceIds || []).map(sourceById).filter(Boolean).forEach(function (source) {
      lines.push('- **' + source.publisher + ' — ' + source.title + '** (' + sourceTypeLabel(source) + ')');
      lines.push('  > ' + source.quote);
    });
    lines.push('', '## Assumptions', '');
    data.assumptions.forEach(function (item) { lines.push('- **' + item.title + ':** ' + item.detail); });
    lines.push('', '## Conflicts', '');
    data.conflicts.forEach(function (item) { lines.push('- **' + item.title + ':** ' + item.resolution); });
    lines.push('', '---', 'ProofLoop recommendations are directional, not professional advice.');
    return lines.join('\n');
  }

  function exportReport() {
    if (!root.Blob || !root.URL || !root.URL.createObjectURL || !root.document) return;
    var blob = new Blob([buildReport()], { type: 'text/markdown;charset=utf-8' });
    var link = root.document.createElement('a');
    link.href = root.URL.createObjectURL(blob);
    link.download = 'proofloop-decision-report.md';
    root.document.body.appendChild(link);
    link.click();
    root.document.body.removeChild(link);
    root.setTimeout(function () { root.URL.revokeObjectURL(link.href); }, 0);
  }

  function formatPrice(price, currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(price);
    } catch (error) {
      return '$' + Math.round(Number(price) || 0);
    }
  }

  function handleClick(event) {
    var element = event.target && event.target.closest ? event.target.closest('[data-source-id], [data-product-id], [data-tab], .proofloop-tab, .tab, [data-action], #reset, .reset-button') : null;
    if (!element) return;
    if (element.getAttribute('data-action') === 'open-brief') { setBriefModal(true); return; }
    if (element.getAttribute('data-action') === 'close-brief') { setBriefModal(false); return; }
    if (element.getAttribute('data-action') === 'open-evidence') { setEvidenceModal(true); return; }
    if (element.getAttribute('data-action') === 'close-evidence') { setEvidenceModal(false); return; }
    if (element.getAttribute('data-action') === 'remove-source') { removeUserSource(element.getAttribute('data-source-id')); return; }
    if (element.getAttribute('data-action') === 'export-report') { exportReport(); return; }
    if (element.hasAttribute('data-product-id') && element.classList.contains('proofloop-score-row')) {
      state.selectedProductId = element.getAttribute('data-product-id');
      var selectedProduct = productById(state.selectedProductId);
      state.selectedSourceId = selectedProduct.sourceIds && selectedProduct.sourceIds[0];
      renderEvidence();
      persist();
      return;
    }
    if (element.hasAttribute('data-product-id')) return;
    if (element.hasAttribute('data-source-id')) {
      state.selectedSourceId = element.getAttribute('data-source-id');
      renderEvidence();
      persist();
      return;
    }
    if (element.hasAttribute('data-tab') || element.classList.contains('proofloop-tab') || element.classList.contains('tab')) {
      state.activeTab = (element.getAttribute('data-tab') || element.getAttribute('aria-controls') || '').replace(/-panel$/, '').replace(/^tab-/, '') || 'evidence';
      renderTabs();
      persist();
      return;
    }
    if (element.hasAttribute('data-action') || element.id === 'reset' || element.classList.contains('reset-button')) reset();
  }

  function handleInput(event) {
    var target = event.target;
    if (!target || target.tagName !== 'INPUT' || target.type !== 'range') return;
    var criterionId = target.getAttribute('data-criterion') || target.name || target.id.replace(/^proofloop-weight-/, '').replace(/^weight-/, '');
    updateWeight(criterionId, target.value);
  }

  function handleChange(event) {
    var target = event.target;
    if (!target || target.id !== 'brief-persona') return;
    var brief = briefById(target.value);
    all('#brief-preview-question').forEach(function (preview) { preview.textContent = brief.question; });
  }

  function handleSubmit(event) {
    var form = event.target;
    if (!form) return;
    if (form.id === 'evidence-form') {
      event.preventDefault();
      if (form.checkValidity && !form.checkValidity()) return;
      addUserSource(form);
      return;
    }
    if (form.id !== 'brief-form') return;
    event.preventDefault();
    var select = first(['#brief-persona']);
    setBrief(select ? select.value : defaultBrief.id);
    setBriefModal(false);
  }

  function render() {
    state.scores = calculateScores();
    renderBrief();
    renderRecommendation();
    renderScores();
    renderCriteria();
    renderSensitivity();
    renderEvidence();
    renderAssumptions();
    renderConflicts();
    renderTabs();
    renderSourceCounts();
    state.initialized = true;
  }

  function init() {
    if (!root.document || state.initialized) return api;
    root.document.addEventListener('click', handleClick);
    root.document.addEventListener('input', handleInput);
    root.document.addEventListener('change', handleChange);
    root.document.addEventListener('submit', handleSubmit);
    restorePersisted();
    render();
    return api;
  }

  var api = {
    init: init,
    reset: reset,
    calculateScores: calculateScores,
    calculateSensitivity: calculateSensitivity,
    setBrief: setBrief,
    setWeight: updateWeight,
    getState: function () {
      return {
        weights: copy(state.weights),
        briefId: state.briefId,
        question: state.question,
        activeTab: state.activeTab,
        selectedProductId: state.selectedProductId,
        selectedSourceId: state.selectedSourceId,
        scores: state.scores.slice()
      };
    },
    data: data,
    buildReport: buildReport,
    persist: persist,
    restorePersisted: restorePersisted,
    clearSavedState: function () {
      var store = storage();
      if (store) {
        try { store.removeItem(STORAGE_KEY); } catch (error) { /* best effort */ }
      }
      clearUserSources();
      setStorageStatus('Demo reset');
    }
  };

  root.ProofLoop = api;
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init);
    else init();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
