'use strict';

function clampWeight(value) {
  return Math.max(0, Number(value) || 0);
}

function productById(data, id) {
  return data.products.filter(function (product) { return product.id === id; })[0] || null;
}

function briefById(data, id) {
  return (data.briefs || []).filter(function (brief) { return brief.id === id; })[0] || null;
}

function calculateScores(data, weights) {
  var totalWeight = data.criteria.reduce(function (sum, criterion) {
    return sum + clampWeight(weights[criterion.id]);
  }, 0);
  var divisor = totalWeight || 1;

  return data.products.map(function (product) {
    var weightedTotal = data.criteria.reduce(function (sum, criterion) {
      return sum + (Number(product.scores[criterion.id]) || 0) * clampWeight(weights[criterion.id]);
    }, 0);
    return {
      productId: product.id,
      score: Math.round((weightedTotal / divisor) * 10) / 10
    };
  }).sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.productId.localeCompare(b.productId);
  });
}

function calculateSensitivity(data, weights) {
  var totalWeight = data.criteria.reduce(function (sum, criterion) {
    return sum + clampWeight(weights[criterion.id]);
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

  var ranked = calculateScores(data, weights);
  var winnerId = ranked[0].productId;
  var winner = productById(data, winnerId);
  var runnerUp = ranked[1];

  return {
    active: true,
    winnerId: winnerId,
    winnerName: winner.name,
    winnerScore: ranked[0].score,
    scoreGap: runnerUp ? Math.round((ranked[0].score - runnerUp.score) * 10) / 10 : ranked[0].score,
    criteria: data.criteria.map(function (criterion) {
      var currentWeight = clampWeight(weights[criterion.id]);
      var currentPercent = Math.round((currentWeight / totalWeight) * 100);
      var otherTotal = totalWeight - currentWeight;
      var threshold = null;

      for (var percent = 0; percent <= 100; percent += 1) {
        var candidateWeights = {};
        data.criteria.forEach(function (candidateCriterion) {
          if (candidateCriterion.id === criterion.id) {
            candidateWeights[candidateCriterion.id] = percent / 100;
          } else if (otherTotal) {
            candidateWeights[candidateCriterion.id] = (clampWeight(weights[candidateCriterion.id]) / otherTotal) * (1 - (percent / 100));
          } else {
            candidateWeights[candidateCriterion.id] = 0;
          }
        });

        var candidateWinner = calculateScores(data, candidateWeights)[0];
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
        challengerName: threshold ? productById(data, threshold.challengerId).name : null
      };
    })
  };
}

function validateCatalog(data) {
  var criterionIds = new Set(data.criteria.map(function (criterion) { return criterion.id; }));
  var productIds = new Set(data.products.map(function (product) { return product.id; }));
  var sourceIds = new Set(data.sources.map(function (source) { return source.id; }));

  if (!data.defaults || !briefById(data, data.defaults.briefId)) throw new Error('Default brief is invalid.');
  data.products.forEach(function (product) {
    (product.sourceIds || []).forEach(function (sourceId) {
      if (!sourceIds.has(sourceId)) throw new Error('Product source reference is invalid: ' + sourceId);
    });
    Object.keys(product.scores || {}).forEach(function (criterionId) {
      if (!criterionIds.has(criterionId)) throw new Error('Product criterion reference is invalid: ' + criterionId);
    });
  });
  data.sources.forEach(function (source) {
    if (!productIds.has(source.productId)) throw new Error('Source product reference is invalid: ' + source.productId);
  });
  data.conflicts.forEach(function (conflict) {
    if (!productIds.has(conflict.productId) || !sourceIds.has(conflict.manufacturerSourceId) || !sourceIds.has(conflict.independentSourceId)) {
      throw new Error('Conflict reference is invalid: ' + conflict.id);
    }
  });
  return true;
}

function preview(data, options) {
  var brief = briefById(data, options.briefId || data.defaults.briefId);
  if (!brief) return null;
  var weights = options.weights || brief.weights;
  var ranking = calculateScores(data, weights);
  var sensitivity = calculateSensitivity(data, weights);
  var top = sensitivity.active ? productById(data, ranking[0].productId) : null;

  return {
    schemaVersion: 1,
    dataVersion: data.version,
    brief: {
      id: brief.id,
      label: brief.label,
      question: brief.question,
      budget: brief.budget
    },
    weights: Object.assign({}, weights),
    ranking: ranking,
    recommendation: top ? {
      productId: top.id,
      name: top.name,
      score: ranking[0].score,
      summary: top.summary,
      price: top.price,
      currency: top.currency,
      configuration: top.configuration,
      sourceIds: (top.sourceIds || []).slice()
    } : null,
    sensitivity: sensitivity
  };
}

module.exports = {
  calculateScores: calculateScores,
  calculateSensitivity: calculateSensitivity,
  preview: preview,
  validateCatalog: validateCatalog,
  briefById: briefById
};
