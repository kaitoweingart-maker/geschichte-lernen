/* Atlas Historica — App-Logik
   - Leaflet-Weltkarte (TopoJSON von Natural Earth)
   - Klick auf Land → kuratierte Inhalte (countries-data.js) oder Wikipedia-Fallback
   - Nachbarn werden farblich hervorgehoben (aus kuratierter Liste)
   - Suche, Zufall, deutscher Wikipedia-Fallback
*/
(function(){
  'use strict';

  const GEOJSON_URL = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';
  const WIKI_API = (lang, title) => `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

  // ---------- Wikipedia-Titel-Mapping für Länder ohne kuratierte Inhalte ----------
  // ISO-A3 → deutscher Wikipedia-Seitentitel
  const WIKI_TITLES = {
    NOR:'Norwegen', SWE:'Schweden', FIN:'Finnland', DNK:'Dänemark', ISL:'Island',
    BEL:'Belgien', LUX:'Luxemburg', LIE:'Liechtenstein', MCO:'Monaco', AND:'Andorra',
    SVK:'Slowakei', CZE:'Tschechien', HUN:'Ungarn', SVN:'Slowenien', HRV:'Kroatien',
    BIH:'Bosnien und Herzegowina', SRB:'Serbien', MNE:'Montenegro', MKD:'Nordmazedonien',
    ALB:'Albanien', BGR:'Bulgarien', ROU:'Rumänien', MDA:'Republik Moldau',
    BLR:'Belarus', LTU:'Litauen', LVA:'Lettland', EST:'Estland',
    CYP:'Republik Zypern', MLT:'Malta', VAT:'Vatikanstadt', SMR:'San Marino',
    ARG:'Argentinien', CHL:'Chile', PER:'Peru', BOL:'Bolivien', URY:'Uruguay',
    PRY:'Paraguay', COL:'Kolumbien', VEN:'Venezuela', ECU:'Ecuador',
    GUY:'Guyana', SUR:'Suriname', CUB:'Kuba', JAM:'Jamaika', HTI:'Haiti',
    DOM:'Dominikanische Republik', PRI:'Puerto Rico', PAN:'Panama',
    CRI:'Costa Rica', NIC:'Nicaragua', HND:'Honduras', GTM:'Guatemala',
    SLV:'El Salvador', BLZ:'Belize',
    NZL:'Neuseeland', PNG:'Papua-Neuguinea', FJI:'Fidschi',
    KAZ:'Kasachstan', UZB:'Usbekistan', TKM:'Turkmenistan', KGZ:'Kirgisistan', TJK:'Tadschikistan',
    AFG:'Afghanistan', PAK:'Pakistan', BGD:'Bangladesch', NPL:'Nepal', BTN:'Bhutan',
    LKA:'Sri Lanka', MMR:'Myanmar', THA:'Thailand', VNM:'Vietnam', LAO:'Laos',
    KHM:'Kambodscha', MYS:'Malaysia', SGP:'Singapur', IDN:'Indonesien',
    PHL:'Philippinen', TWN:'Taiwan', PRK:'Nordkorea', MNG:'Mongolei',
    GEO:'Georgien', ARM:'Armenien', AZE:'Aserbaidschan',
    SYR:'Syrien', LBN:'Libanon', JOR:'Jordanien', IRQ:'Irak', YEM:'Jemen',
    OMN:'Oman', ARE:'Vereinigte Arabische Emirate', QAT:'Katar', BHR:'Bahrain',
    KWT:'Kuwait', PSE:'Palästinensische Autonomiegebiete',
    MAR:'Marokko', DZA:'Algerien', TUN:'Tunesien', LBY:'Libyen',
    SDN:'Sudan', SSD:'Südsudan', ETH:'Äthiopien', ERI:'Eritrea', SOM:'Somalia',
    DJI:'Dschibuti', KEN:'Kenia', TZA:'Tansania', UGA:'Uganda', RWA:'Ruanda',
    BDI:'Burundi', COD:'Demokratische Republik Kongo', COG:'Republik Kongo',
    CAF:'Zentralafrikanische Republik', TCD:'Tschad', NER:'Niger', NGA:'Nigeria',
    CMR:'Kamerun', GAB:'Gabun', GNQ:'Äquatorialguinea',
    AGO:'Angola', ZMB:'Sambia', ZWE:'Simbabwe', MOZ:'Mosambik', MWI:'Malawi',
    MDG:'Madagaskar', NAM:'Namibia', BWA:'Botswana', LSO:'Lesotho', SWZ:'Eswatini',
    GHA:'Ghana', CIV:'Elfenbeinküste', SEN:'Senegal', MLI:'Mali', BFA:'Burkina Faso',
    GIN:'Guinea', SLE:'Sierra Leone', LBR:'Liberia', TGO:'Togo', BEN:'Benin',
    MRT:'Mauretanien', GMB:'Gambia', GNB:'Guinea-Bissau', CPV:'Kap Verde'
  };

  const COUNTRIES_DATA = window.COUNTRIES_DATA || {};

  // ---------- DOM Refs ----------
  const $ = sel => document.querySelector(sel);
  const map = L.map('map', { worldCopyJump:true, zoomControl:true, minZoom:2, maxZoom:6 }).setView([25, 15], 2);

  // Dark, no-label basemap (free Carto Positron Dark Matter)
  L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_nolabels/{z}/{x}/{y}.png',{
    attribution:'© OpenStreetMap, © Carto',
    subdomains:'abcd',
    maxZoom:6
  }).addTo(map);

  let geoLayer = null;
  let countryIndex = {};   // ISO_A3 → feature.layer
  let currentIso = null;

  // ---------- GeoJSON laden + zeichnen ----------
  fetch(GEOJSON_URL).then(r=>r.json()).then(data=>{
    geoLayer = L.geoJSON(data, {
      style: feature => styleFor(feature.properties['ISO_A3'] || feature.id, false, false),
      onEachFeature: (feature, layer) => {
        const iso = feature.properties['ISO_A3'] || feature.id;
        countryIndex[iso] = layer;
        layer.on({
          mouseover: e => {
            if (currentIso !== iso) layer.setStyle(styleFor(iso, true, false));
            layer.bringToFront();
          },
          mouseout: e => {
            if (currentIso !== iso) layer.setStyle(styleFor(iso, false, isNeighborOfCurrent(iso)));
          },
          click: () => openCountry(iso, feature.properties.ADMIN || feature.properties.name)
        });
      }
    }).addTo(map);
  }).catch(err => {
    console.error('GeoJSON-Laden fehlgeschlagen', err);
    $('#welcome').insertAdjacentHTML('beforeend',
      '<div class="error-state">Karte konnte nicht geladen werden. Bitte Internetverbindung prüfen.</div>');
  });

  function styleFor(iso, hover, neighbor){
    if (currentIso === iso) {
      return { fillColor:'#e8c98a', color:'#fff', weight:1.4, fillOpacity:0.95 };
    }
    if (hover) {
      return { fillColor:'#d6a55c', color:'#fff', weight:1.0, fillOpacity:0.85 };
    }
    if (neighbor) {
      return { fillColor:'#3a4d80', color:'#fff', weight:0.7, fillOpacity:0.85 };
    }
    const curated = !!COUNTRIES_DATA[iso];
    return {
      fillColor: curated ? '#3d2f1c' : '#22304f',
      color: '#0a0f1f',
      weight: 0.5,
      fillOpacity: 0.85
    };
  }

  function isNeighborOfCurrent(iso){
    if (!currentIso) return false;
    const cur = COUNTRIES_DATA[currentIso];
    if (!cur || !cur.neighbors) return false;
    return cur.neighbors.some(n => n.iso === iso);
  }

  function refreshAllStyles(){
    if (!geoLayer) return;
    geoLayer.eachLayer(layer => {
      const iso = layer.feature.properties['ISO_A3'] || layer.feature.id;
      layer.setStyle(styleFor(iso, false, isNeighborOfCurrent(iso)));
    });
  }

  // ---------- Country öffnen ----------
  async function openCountry(iso, fallbackName){
    currentIso = iso;
    refreshAllStyles();

    $('#welcome').hidden = true;
    const view = $('#country-view');
    view.hidden = false;

    const data = COUNTRIES_DATA[iso];

    if (data) {
      renderCurated(data);
      flyToFeature(iso);
    } else {
      const wikiTitle = WIKI_TITLES[iso] || fallbackName || iso;
      renderLoading(fallbackName || wikiTitle);
      try {
        const wiki = await loadWiki(wikiTitle);
        renderWikiOnly(wiki, fallbackName || wikiTitle);
      } catch(err) {
        renderWikiError(fallbackName || wikiTitle, err);
      }
      flyToFeature(iso);
    }
  }

  function flyToFeature(iso){
    const layer = countryIndex[iso];
    if (!layer) return;
    const b = layer.getBounds();
    if (b.isValid()) map.flyToBounds(b, { padding:[40,40], maxZoom:5, duration:0.6 });
  }

  // ---------- Kuratierte Darstellung ----------
  function renderCurated(d){
    $('#c-region').textContent = d.region || '';
    $('#c-name').innerHTML = (d.flag ? d.flag+' ' : '') + d.name;

    const stats = $('#c-stats');
    stats.innerHTML = '';
    if (d.stats) {
      Object.entries(d.stats).forEach(([k,v]) => {
        const el = document.createElement('span');
        el.className = 'stat';
        el.innerHTML = `${k}: <strong>${v}</strong>`;
        stats.appendChild(el);
      });
    }

    // OVERVIEW
    $('#tab-overview').innerHTML = `
      <div class="overview-hero">${d.overview || ''}</div>
      <p class="hint" style="color:var(--text-3);font-size:13px;margin-top:8px">Wechsle durch die Tabs oben für Ereignisse, Kriege, Personen, Nachbarn, Wohlstand und Fakten.</p>
    `;

    // EVENTS
    $('#tab-events').innerHTML = `
      <h3>Wichtigste Ereignisse</h3>
      <div class="timeline">
        ${(d.events||[]).map(e => `
          <div class="tl-item">
            <div class="tl-year">${e.year}</div>
            <div class="tl-body"><strong>${e.title}</strong> — ${e.body}</div>
          </div>`).join('')}
      </div>
    `;

    // WARS
    $('#tab-wars').innerHTML = `
      <h3>Kriege & Konflikte</h3>
      ${(d.wars||[]).map(w => `
        <div class="war">
          <div class="war-name">${w.name}</div>
          <div class="war-meta">${w.period}</div>
          <div class="war-desc">${w.body}</div>
        </div>`).join('')}
    `;

    // PEOPLE
    $('#tab-people').innerHTML = `
      <h3>Historische Personen</h3>
      <div class="people-grid">
        ${(d.people||[]).map(p => `
          <div class="person">
            <div class="person-name">${p.name}</div>
            <div class="person-meta">${p.period} · ${p.role}</div>
            <div class="person-desc">${p.desc}</div>
          </div>`).join('')}
      </div>
    `;

    // NEIGHBORS
    $('#tab-neighbors').innerHTML = `
      <h3>Beziehungen zu Nachbarn</h3>
      <div class="neighbors-list">
        ${(d.neighbors||[]).map(n => `
          <div class="neighbor" data-iso="${n.iso}">
            <div>
              <div class="neighbor-name">${n.name}</div>
              <div class="neighbor-rel">${n.relation}</div>
            </div>
            <div class="neighbor-arrow">→</div>
          </div>`).join('')}
      </div>
    `;
    // Click → switch country
    $('#tab-neighbors').querySelectorAll('.neighbor').forEach(el=>{
      el.addEventListener('click', () => {
        const iso = el.dataset.iso;
        openCountry(iso, el.querySelector('.neighbor-name').textContent);
      });
    });

    // WEALTH
    const w = d.wealth || {};
    $('#tab-wealth').innerHTML = `
      <h3>Wohlstand & Heute</h3>
      <div class="wealth-block"><h4>Wirtschaft</h4><p>${w.economy || ''}</p></div>
      <div class="wealth-block"><h4>Aktuelle Lage</h4><p>${w.today || ''}</p></div>
      <div class="wealth-block"><h4>Verhaltensmuster & Mentalität</h4><p>${w.mentality || ''}</p></div>
    `;

    // FACTS
    $('#tab-facts').innerHTML = `
      <h3>Interessante Fakten</h3>
      <div class="facts">
        ${(d.facts||[]).map(f => `<div class="fact">${f}</div>`).join('')}
      </div>
    `;

    // Tabs zurücksetzen
    setActiveTab('overview');
    $('#content-pane').scrollTo({top:0, behavior:'smooth'});
  }

  // ---------- Wikipedia-Fallback ----------
  function renderLoading(name){
    $('#c-region').textContent = 'Wikipedia-Inhalt';
    $('#c-name').textContent = name;
    $('#c-stats').innerHTML = '';
    document.querySelectorAll('.tab-content').forEach(el => el.innerHTML = '');
    $('#tab-overview').innerHTML = '<div class="loading">Lade Inhalte</div>';
    setActiveTab('overview');
  }

  async function loadWiki(title){
    // 1. Deutsch versuchen
    try {
      const r = await fetch(WIKI_API('de', title));
      if (r.ok) {
        const j = await r.json();
        if (j && j.extract) return { ...j, lang:'de' };
      }
    } catch(e){}
    // 2. Englisch versuchen
    try {
      const r = await fetch(WIKI_API('en', title));
      if (r.ok) {
        const j = await r.json();
        if (j && j.extract) return { ...j, lang:'en' };
      }
    } catch(e){}
    throw new Error('not_found');
  }

  function renderWikiOnly(wiki, name){
    $('#c-region').textContent = 'Wikipedia · ' + (wiki.lang || '').toUpperCase();
    $('#c-name').textContent = name;
    $('#c-stats').innerHTML = '';

    const img = wiki.thumbnail && wiki.thumbnail.source
      ? `<img class="wiki-image" src="${wiki.thumbnail.source}" alt="${name}">` : '';

    $('#tab-overview').innerHTML = `
      <div class="overview-hero">
        ${img}
        ${wiki.extract_html || wiki.extract || ''}
      </div>
      <p class="hint" style="color:var(--text-3);font-size:13px;margin-top:14px">
        Für dieses Land gibt es noch keine kuratierten Tiefen-Inhalte.
        Mehr auf <a href="${wiki.content_urls?.desktop?.page || '#'}" target="_blank" rel="noopener" style="color:var(--accent)">Wikipedia</a>.
      </p>
    `;
    const placeholder = `<div class="hint" style="color:var(--text-3);padding:14px">Für dieses Land gibt es noch keine kuratierten Inhalte hier. Siehe Überblick / Wikipedia.</div>`;
    ['tab-events','tab-wars','tab-people','tab-neighbors','tab-wealth','tab-facts']
      .forEach(id => $('#'+id).innerHTML = placeholder);
    setActiveTab('overview');
    $('#content-pane').scrollTo({top:0, behavior:'smooth'});
  }

  function renderWikiError(name, err){
    $('#c-region').textContent = 'Wikipedia-Inhalt';
    $('#c-name').textContent = name;
    $('#c-stats').innerHTML = '';
    $('#tab-overview').innerHTML = `
      <div class="error-state">Konnte keine Wikipedia-Inhalte für <strong>${name}</strong> laden (${err.message}).</div>
    `;
  }

  // ---------- Tabs ----------
  function setActiveTab(name){
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-content').forEach(c => {
      c.hidden = (c.id !== 'tab-'+name);
    });
  }
  document.querySelectorAll('.tab').forEach(btn=>{
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });

  // ---------- Close → Welcome ----------
  $('#close-btn').addEventListener('click', () => {
    $('#country-view').hidden = true;
    $('#welcome').hidden = false;
    currentIso = null;
    refreshAllStyles();
    map.flyTo([25,15], 2, { duration:0.6 });
  });

  // ---------- Welcome-Karten ----------
  document.querySelectorAll('.welcome-card').forEach(card => {
    card.addEventListener('click', () => openCountry(card.dataset.iso, card.textContent.trim()));
  });

  // ---------- Zufallsland ----------
  $('#random-btn').addEventListener('click', () => {
    const keys = Object.keys(COUNTRIES_DATA);
    const iso = keys[Math.floor(Math.random()*keys.length)];
    openCountry(iso, COUNTRIES_DATA[iso].name);
  });

  // ---------- Suche ----------
  const searchInput = $('#search');
  const searchResults = $('#search-results');

  const SEARCH_INDEX = [];
  function buildSearchIndex(){
    Object.entries(COUNTRIES_DATA).forEach(([iso,d]) => {
      SEARCH_INDEX.push({ iso, name:d.name, curated:true, flag:d.flag||'' });
    });
    Object.entries(WIKI_TITLES).forEach(([iso, name]) => {
      if (!COUNTRIES_DATA[iso]) SEARCH_INDEX.push({ iso, name, curated:false, flag:'' });
    });
  }
  buildSearchIndex();

  function runSearch(q){
    q = q.trim().toLowerCase();
    if (q.length < 1) { searchResults.hidden = true; return; }
    const hits = SEARCH_INDEX
      .filter(item => item.name.toLowerCase().includes(q) || item.iso.toLowerCase()===q)
      .sort((a,b) => (b.curated?1:0) - (a.curated?1:0))
      .slice(0, 20);
    if (hits.length === 0) {
      searchResults.innerHTML = '<div class="sr-item" style="color:var(--text-3)">Nichts gefunden.</div>';
    } else {
      searchResults.innerHTML = hits.map(h =>
        `<div class="sr-item ${h.curated?'curated':''}" data-iso="${h.iso}">
          ${h.flag} ${h.name}<span class="sr-iso">${h.iso}</span>
        </div>`).join('');
      searchResults.querySelectorAll('.sr-item').forEach(item=>{
        item.addEventListener('click', ()=>{
          const iso = item.dataset.iso;
          const entry = SEARCH_INDEX.find(s=>s.iso===iso);
          openCountry(iso, entry?.name);
          searchInput.value = '';
          searchResults.hidden = true;
        });
      });
    }
    searchResults.hidden = false;
  }
  searchInput.addEventListener('input', e => runSearch(e.target.value));
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const first = searchResults.querySelector('.sr-item[data-iso]');
      if (first) first.click();
    } else if (e.key === 'Escape') {
      searchResults.hidden = true;
    }
  });
  document.addEventListener('click', e => {
    if (!searchResults.contains(e.target) && e.target !== searchInput) {
      searchResults.hidden = true;
    }
  });

})();
