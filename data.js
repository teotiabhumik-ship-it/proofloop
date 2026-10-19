(function (root, factory) {
  var data = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = data;
  }
  if (root) {
    root.PROOFLOOP_DATA = data;
    root.proofLoopData = data;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var criteria = [
    {
      id: 'price',
      label: 'Value',
      description: 'How much capability the starting configuration provides for its price.',
      unit: 'score',
      weight: 0.20,
      direction: 'higher-is-better'
    },
    {
      id: 'performance',
      label: 'Performance',
      description: 'Productivity performance for coding, office work, and light creative workloads.',
      unit: 'score',
      weight: 0.25,
      direction: 'higher-is-better'
    },
    {
      id: 'battery',
      label: 'Battery life',
      description: 'Expected unplugged runtime across independent real-world testing.',
      unit: 'score',
      weight: 0.25,
      direction: 'higher-is-better'
    },
    {
      id: 'portability',
      label: 'Portability',
      description: 'Weight, thickness, charger burden, and ease of carrying every day.',
      unit: 'score',
      weight: 0.15,
      direction: 'higher-is-better'
    },
    {
      id: 'display',
      label: 'Display',
      description: 'Panel quality, brightness, color, and suitability for long work sessions.',
      unit: 'score',
      weight: 0.15,
      direction: 'higher-is-better'
    }
  ];

  var products = [
    {
      id: 'framework-laptop-13',
      name: 'Framework Laptop 13',
      brand: 'Framework',
      configuration: 'Intel Core Ultra 5 125H · 16 GB · 512 GB',
      price: 1049,
      currency: 'USD',
      summary: 'The repairable, upgradeable pick for buyers who plan to keep a laptop for years.',
      image: '',
      scores: {
        price: 86,
        performance: 87,
        battery: 78,
        portability: 82,
        display: 84
      },
      facts: {
        weight: '2.87 lb',
        claimedBattery: '13 hours',
        testedBattery: '10 hours 4 minutes',
        warranty: '1 year limited'
      },
      sourceIds: ['framework-specs', 'notebookcheck-framework', 'ifixit-framework']
    },
    {
      id: 'thinkpad-x1-carbon-gen12',
      name: 'Lenovo ThinkPad X1 Carbon Gen 12',
      brand: 'Lenovo',
      configuration: 'Intel Core Ultra 7 155U · 16 GB · 512 GB',
      price: 1399,
      currency: 'USD',
      summary: 'A polished business ultraportable with the best keyboard and the lowest carry weight here.',
      image: '',
      scores: {
        price: 68,
        performance: 84,
        battery: 88,
        portability: 96,
        display: 86
      },
      facts: {
        weight: '2.42 lb',
        claimedBattery: '15 hours',
        testedBattery: '12 hours 21 minutes',
        warranty: '1 year limited'
      },
      sourceIds: ['lenovo-x1-specs', 'notebookcheck-x1-carbon', 'rtings-x1-carbon']
    },
    {
      id: 'asus-zenbook-14-oled',
      name: 'ASUS Zenbook 14 OLED',
      brand: 'ASUS',
      configuration: 'AMD Ryzen 7 8840HS · 16 GB · 1 TB',
      price: 899,
      currency: 'USD',
      summary: 'The value option with a gorgeous OLED display and strong multi-core performance.',
      image: '',
      scores: {
        price: 94,
        performance: 91,
        battery: 81,
        portability: 88,
        display: 97
      },
      facts: {
        weight: '3.06 lb',
        claimedBattery: '15 hours',
        testedBattery: '11 hours 7 minutes',
        warranty: '1 year limited'
      },
      sourceIds: ['asus-zenbook-specs', 'notebookcheck-zenbook', 'rtings-zenbook']
    }
  ];

  var sources = [
    {
      id: 'framework-specs',
      productId: 'framework-laptop-13',
      publisher: 'Framework',
      type: 'manufacturer',
      title: 'Framework Laptop 13 technical specifications',
      url: 'https://frame.work/products/laptop13-diy-intel-ultra-1',
      published: '2024-04-23',
      reliability: 'Primary source for specifications; battery figures are optimistic estimates.',
      quote: 'Up to 13 hours of battery life with the 61 Wh battery, depending on configuration and usage.',
      claims: [
        { criterionId: 'battery', value: 13, unit: 'hours', stance: 'manufacturer-claim' },
        { criterionId: 'portability', value: 2.87, unit: 'lb', stance: 'manufacturer-claim' }
      ]
    },
    {
      id: 'notebookcheck-framework',
      productId: 'framework-laptop-13',
      publisher: 'Notebookcheck',
      type: 'independent-review',
      title: 'Framework Laptop 13 (Core Ultra 5 125H) review',
      url: 'https://www.notebookcheck.net/Framework-Laptop-13-review.823000.0.html',
      published: '2024-05-16',
      reliability: 'Independent standardized battery and display testing.',
      quote: 'The laptop lasted 10 hours and 4 minutes in our Wi-Fi test at 150 cd/m².',
      claims: [
        { criterionId: 'battery', value: 10.07, unit: 'hours', stance: 'independent-measurement' },
        { criterionId: 'display', value: 84, unit: 'score', stance: 'independent-assessment' }
      ]
    },
    {
      id: 'ifixit-framework',
      productId: 'framework-laptop-13',
      publisher: 'iFixit',
      type: 'independent-review',
      title: 'Framework Laptop 13 repairability teardown',
      url: 'https://www.ifixit.com/Teardown/Framework+Laptop+13+Teardown/150690',
      published: '2024-06-04',
      reliability: 'Independent repairability analysis.',
      quote: 'Every major component is replaceable, and the expansion cards make the ports user-configurable.',
      claims: [
        { criterionId: 'portability', value: 82, unit: 'score', stance: 'independent-assessment' }
      ]
    },
    {
      id: 'lenovo-x1-specs',
      productId: 'thinkpad-x1-carbon-gen12',
      publisher: 'Lenovo',
      type: 'manufacturer',
      title: 'ThinkPad X1 Carbon Gen 12 specifications',
      url: 'https://www.lenovo.com/us/en/p/laptops/thinkpad/thinkpadx1/21kccto1wwus1',
      published: '2024-02-20',
      reliability: 'Primary source for specifications and claimed runtime.',
      quote: 'Up to 15 hours of battery life and a starting weight of 2.42 lb.',
      claims: [
        { criterionId: 'battery', value: 15, unit: 'hours', stance: 'manufacturer-claim' },
        { criterionId: 'portability', value: 2.42, unit: 'lb', stance: 'manufacturer-claim' }
      ]
    },
    {
      id: 'notebookcheck-x1-carbon',
      productId: 'thinkpad-x1-carbon-gen12',
      publisher: 'Notebookcheck',
      type: 'independent-review',
      title: 'ThinkPad X1 Carbon Gen 12 review',
      url: 'https://www.notebookcheck.net/Lenovo-ThinkPad-X1-Carbon-Gen-12-review.808000.0.html',
      published: '2024-03-19',
      reliability: 'Independent standardized battery and performance testing.',
      quote: 'Our Wi-Fi test measured 12 hours and 21 minutes before the battery reached 3%.',
      claims: [
        { criterionId: 'battery', value: 12.35, unit: 'hours', stance: 'independent-measurement' },
        { criterionId: 'performance', value: 84, unit: 'score', stance: 'independent-assessment' }
      ]
    },
    {
      id: 'rtings-x1-carbon',
      productId: 'thinkpad-x1-carbon-gen12',
      publisher: 'RTINGS',
      type: 'independent-review',
      title: 'Lenovo ThinkPad X1 Carbon Gen 12 review',
      url: 'https://www.rtings.com/laptop/reviews/lenovo/thinkpad-x1-carbon-gen-12-2024',
      published: '2024-04-02',
      reliability: 'Independent usability and display testing.',
      quote: 'It is exceptionally light, with a comfortable keyboard and a matte display suited to office work.',
      claims: [
        { criterionId: 'display', value: 86, unit: 'score', stance: 'independent-assessment' },
        { criterionId: 'portability', value: 96, unit: 'score', stance: 'independent-assessment' }
      ]
    },
    {
      id: 'asus-zenbook-specs',
      productId: 'asus-zenbook-14-oled',
      publisher: 'ASUS',
      type: 'manufacturer',
      title: 'ASUS Zenbook 14 OLED specifications',
      url: 'https://www.asus.com/laptops/for-home/zenbook/asus-zenbook-14-oled-um3406/',
      published: '2024-01-29',
      reliability: 'Primary source for specifications and claimed runtime.',
      quote: 'The 75 Wh battery supports up to 15 hours of video playback.',
      claims: [
        { criterionId: 'battery', value: 15, unit: 'hours', stance: 'manufacturer-claim' },
        { criterionId: 'display', value: 97, unit: 'score', stance: 'manufacturer-claim' }
      ]
    },
    {
      id: 'notebookcheck-zenbook',
      productId: 'asus-zenbook-14-oled',
      publisher: 'Notebookcheck',
      type: 'independent-review',
      title: 'ASUS Zenbook 14 OLED review',
      url: 'https://www.notebookcheck.net/Asus-Zenbook-14-OLED-review.812000.0.html',
      published: '2024-02-28',
      reliability: 'Independent standardized battery and display testing.',
      quote: 'The Zenbook reached 11 hours and 7 minutes in our Wi-Fi test at 150 cd/m².',
      claims: [
        { criterionId: 'battery', value: 11.12, unit: 'hours', stance: 'independent-measurement' },
        { criterionId: 'display', value: 97, unit: 'score', stance: 'independent-assessment' }
      ]
    },
    {
      id: 'rtings-zenbook',
      productId: 'asus-zenbook-14-oled',
      publisher: 'RTINGS',
      type: 'independent-review',
      title: 'ASUS Zenbook 14 OLED usability review',
      url: 'https://www.rtings.com/laptop/reviews/asus/zenbook-14-oled-2024',
      published: '2024-03-11',
      reliability: 'Independent keyboard, display, and performance assessment.',
      quote: 'The OLED panel is vivid and sharp, while the compact chassis remains cool during ordinary work.',
      claims: [
        { criterionId: 'performance', value: 91, unit: 'score', stance: 'independent-assessment' },
        { criterionId: 'portability', value: 88, unit: 'score', stance: 'independent-assessment' }
      ]
    }
  ];

  var conflicts = [
    {
      id: 'framework-battery-runtime',
      productId: 'framework-laptop-13',
      criterionId: 'battery',
      severity: 'medium',
      title: 'Battery runtime differs by nearly three hours',
      summary: 'Framework claims up to 13 hours; Notebookcheck measured 10 hours 4 minutes in a controlled Wi-Fi test.',
      manufacturerSourceId: 'framework-specs',
      independentSourceId: 'notebookcheck-framework',
      resolution: 'The recommendation uses the independent result for scoring and keeps the manufacturer figure visible as an upper-bound claim.'
    },
    {
      id: 'zenbook-battery-runtime',
      productId: 'asus-zenbook-14-oled',
      criterionId: 'battery',
      severity: 'low',
      title: 'Playback claim exceeds mixed-use test',
      summary: 'ASUS claims up to 15 hours of video playback; an independent Wi-Fi test measured 11 hours 7 minutes.',
      manufacturerSourceId: 'asus-zenbook-specs',
      independentSourceId: 'notebookcheck-zenbook',
      resolution: 'The independent mixed-use result is treated as the more comparable number.'
    }
  ];

  var assumptions = [
    {
      id: 'independent-battery-priority',
      title: 'Independent battery tests are weighted above vendor claims',
      detail: 'Battery scores use the independent Wi-Fi result when a manufacturer claim and a standardized test disagree.'
    },
    {
      id: 'starting-price',
      title: 'Starting configuration prices are compared in USD',
      detail: 'Promotions, tax, regional pricing, and accessories are excluded from the value score.'
    },
    {
      id: 'equal-test-context',
      title: 'Scores are directional, not lab measurements',
      detail: 'Each 0–100 criterion score is normalized for this comparison and is intended to make trade-offs legible.'
    },
    {
      id: 'no-ecosystem-lock-in',
      title: 'Operating-system and ecosystem preferences are not scored',
      detail: 'The recommendation assumes the buyer is comfortable with Windows and values the listed hardware traits.'
    }
  ];

  var briefs = [
    {
      id: 'developer',
      label: 'Software developer',
      question: 'Which laptop under $1,500 is the best fit for a software developer?',
      budget: '$1,500',
      weights: { price: 0.20, performance: 0.25, battery: 0.25, portability: 0.15, display: 0.15 }
    },
    {
      id: 'traveler',
      label: 'Traveling engineer',
      question: 'Which laptop under $1,500 is the best fit for an engineer who travels every week?',
      budget: '$1,500',
      weights: { price: 0.10, performance: 0.20, battery: 0.40, portability: 0.25, display: 0.05 }
    },
    {
      id: 'creative-coder',
      label: 'Creative coder',
      question: 'Which laptop under $1,500 is the best fit for a developer who also edits photos and video?',
      budget: '$1,500',
      weights: { price: 0.10, performance: 0.35, battery: 0.15, portability: 0.10, display: 0.30 }
    }
  ];

  return {
    version: '1.0.0',
    title: 'ProofLoop laptop comparison',
    currency: 'USD',
    criteria: criteria,
    products: products,
    sources: sources,
    conflicts: conflicts,
    assumptions: assumptions,
    briefs: briefs,
    defaults: {
      activeTab: 'evidence',
      selectedProductId: 'framework-laptop-13',
      selectedSourceId: 'notebookcheck-framework',
      briefId: 'developer'
    }
  };
}));
