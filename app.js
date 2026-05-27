/* Atlas Historica — App-Logik
   - Leaflet-Weltkarte (TopoJSON von Natural Earth)
   - Klick auf Land → kuratierte Inhalte (countries-data.js) oder Wikipedia-Fallback
   - Nachbarn werden farblich hervorgehoben (aus kuratierter Liste)
   - Suche, Zufall, deutscher Wikipedia-Fallback
*/
(function(){
  'use strict';

  const GEOJSON_URL = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';

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

  // ---------- Lern-Tracking via LocalStorage ----------
  const LS_KEY = 'atlas-historica:learned';
  const learned = new Set(loadLearned());
  function loadLearned(){
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch(e){ return []; }
  }
  function saveLearned(){
    try { localStorage.setItem(LS_KEY, JSON.stringify([...learned])); } catch(e){}
  }
  function setLearned(iso, on){
    if (on) learned.add(iso); else learned.delete(iso);
    saveLearned();
    updateProgressCount();
    refreshAllStyles();
    syncLearnedButton(iso);
  }
  function updateProgressCount(){
    const el = document.getElementById('progress-count');
    if (el) el.textContent = learned.size;
  }
  updateProgressCount();

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

  // ---------- Tab-Verwaltung (Sichtbarkeit & Beschriftung dynamisch) ----------
  const ALL_TABS = ['overview','events','wars','people','neighbors','wealth','facts'];
  const DEFAULT_TAB_LABELS = {
    overview:'Überblick', events:'Ereignisse', wars:'Kriege', people:'Personen',
    neighbors:'Nachbarn', wealth:'Wohlstand & Heute', facts:'Fakten'
  };
  function configureTabs(visible, labels){
    labels = labels || {};
    ALL_TABS.forEach(name => {
      const btn = document.querySelector(`.tab[data-tab="${name}"]`);
      if (!btn) return;
      btn.hidden = !visible.includes(name);
      btn.textContent = labels[name] || DEFAULT_TAB_LABELS[name];
    });
  }

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
    const isLearned = learned.has(iso);
    if (isLearned) {
      return { fillColor:'#3d6e4e', color:'#7be0a6', weight:0.9, fillOpacity:0.92 };
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
    } else {
      renderWikiCountry(iso, fallbackName);
    }
    flyToFeature(iso);
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

    // KEY DATES (Strip mit wichtigsten Jahren)
    renderKeyDates(d.events || []);

    // OVERVIEW
    $('#tab-overview').innerHTML = `
      <div class="overview-hero">${d.overview || ''}</div>
      <p class="hint" style="color:var(--text-3);font-size:13px;margin-top:8px">Wechsle durch die Tabs oben für Ereignisse, Kriege, Personen, Nachbarn, Wohlstand und Fakten.</p>
    `;

    // EVENTS (anklickbar → Detail-Fenster mit ausführlichem Wikipedia-Text)
    $('#tab-events').innerHTML = `
      <h3>Wichtigste Ereignisse</h3>
      <p class="tab-hint">Klicke auf ein Ereignis für ausführliche Hintergründe.</p>
      <div class="timeline">
        ${(d.events||[]).map((e,i) => `
          <div class="tl-item is-clickable" data-idx="${i}">
            <div class="tl-year">${e.year}</div>
            <div class="tl-body"><strong>${e.title}</strong> — ${e.body}</div>
            <div class="tl-more">›</div>
          </div>`).join('')}
      </div>
    `;
    $('#tab-events').querySelectorAll('.tl-item').forEach(el => {
      el.addEventListener('click', () => {
        const e = (d.events||[])[parseInt(el.dataset.idx,10)];
        if (!e) return;
        openDetail({
          kicker:'Ereignis · ' + (d.name||''),
          title:e.title, meta:e.year, lead:e.body,
          wikiTitle: e.wiki || e.title
        });
      });
    });

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

    // PEOPLE (anklickbar → Detail-Fenster mit ausführlicher Biografie)
    $('#tab-people').innerHTML = `
      <h3>Historische Personen</h3>
      <p class="tab-hint">Klicke auf eine Person für eine ausführliche Biografie.</p>
      <div class="people-grid">
        ${(d.people||[]).map((p,i) => `
          <div class="person is-clickable" data-idx="${i}">
            <div class="person-name">${p.name}</div>
            <div class="person-meta">${p.period} · ${p.role}</div>
            <div class="person-desc">${p.desc}</div>
            <div class="person-more">Mehr lesen ›</div>
          </div>`).join('')}
      </div>
    `;
    $('#tab-people').querySelectorAll('.person').forEach(el => {
      el.addEventListener('click', () => {
        const p = (d.people||[])[parseInt(el.dataset.idx,10)];
        if (!p) return;
        openDetail({
          kicker:'Person · ' + (d.name||''),
          title:p.name, meta:`${p.period} · ${p.role}`, lead:p.desc,
          wikiTitle: p.wiki || p.name
        });
      });
    });

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

    // Tabs zurücksetzen (alle sichtbar, Standard-Beschriftung)
    configureTabs(ALL_TABS);
    setActiveTab('overview');
    syncLearnedButton(currentIso);
    $('#content-pane').scrollTo({top:0, behavior:'smooth'});
  }

  // ---------- Key-Dates Strip ----------
  function renderKeyDates(events){
    const strip = $('#key-dates');
    if (!strip) return;
    if (!events || events.length === 0) { strip.innerHTML=''; strip.hidden=true; return; }
    strip.hidden = false;
    // Bis zu 6 wichtigste Daten (gleichmäßig über Liste verteilt für gute Spannweite)
    const picks = pickKeyDates(events, 6);
    strip.innerHTML = picks.map(e => `
      <div class="key-date" title="${e.title.replace(/"/g,'&quot;')}">
        <div class="key-date-year">${e.year}</div>
        <div class="key-date-label">${shortLabel(e.title)}</div>
      </div>
    `).join('');
  }
  function pickKeyDates(events, n){
    if (events.length <= n) return events;
    const idxs = [];
    for (let i = 0; i < n; i++) {
      idxs.push(Math.round(i * (events.length-1) / (n-1)));
    }
    return [...new Set(idxs)].map(i => events[i]);
  }
  function shortLabel(s){
    if (!s) return '';
    if (s.length <= 28) return s;
    return s.slice(0,26).trim() + '…';
  }

  // ---------- "Gelernt"-Button ----------
  function syncLearnedButton(iso){
    const btn = $('#learned-btn');
    if (!btn) return;
    const on = learned.has(iso);
    btn.classList.toggle('is-learned', on);
    btn.querySelector('.learned-icon').textContent = on ? '●' : '○';
    btn.querySelector('.learned-text').textContent = on ? 'Gelernt' : 'Als gelernt markieren';
  }
  $('#learned-btn').addEventListener('click', () => {
    if (!currentIso) return;
    setLearned(currentIso, !learned.has(currentIso));
  });

  // ---------- Wikipedia-Fallback ----------
  function renderLoading(name){
    $('#c-region').textContent = 'Wikipedia-Inhalt';
    $('#c-name').textContent = name;
    $('#c-stats').innerHTML = '';
    $('#key-dates').innerHTML = '';
    $('#key-dates').hidden = true;
    document.querySelectorAll('.tab-content').forEach(el => el.innerHTML = '');
    $('#tab-overview').innerHTML = '<div class="loading">Lade Inhalte</div>';
    setActiveTab('overview');
    syncLearnedButton(currentIso);
  }

  const WIKI_PROPS = '&prop=extracts%7Cpageimages%7Cinfo&inprop=url&piprop=thumbnail&pithumbsize=360&exintro=1&redirects=1';
  function pageToLead(p, lang){
    if (!p || p.missing !== undefined || !p.extract) return null;
    return {
      title: p.title,
      extract: p.extract,
      thumb: p.thumbnail && p.thumbnail.source,
      canonical: p.canonicalurl || p.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
      lang
    };
  }

  // Exakter Titel-Treffer (DE, sonst EN) – präzise für Länder & Personen
  async function wikiLead(title){
    for (const lang of ['de','en']){
      try {
        const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*`
          + WIKI_PROPS + `&titles=${encodeURIComponent(title)}`;
        const r = await fetch(url);
        if (!r.ok) continue;
        const j = await r.json();
        const pages = j.query && j.query.pages;
        const lead = pages && pageToLead(Object.values(pages)[0], lang);
        if (lead) return lead;
      } catch(e){}
    }
    return null;
  }

  // Volltextsuche → bester Artikel (Fallback für Ereignistitel ohne exakten Artikel)
  async function wikiSearch(query){
    for (const lang of ['de','en']){
      try {
        const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*`
          + `&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1` + WIKI_PROPS;
        const r = await fetch(url);
        if (!r.ok) continue;
        const j = await r.json();
        const pages = j.query && j.query.pages;
        const lead = pages && pageToLead(Object.values(pages)[0], lang);
        if (lead) return lead;
      } catch(e){}
    }
    return null;
  }

  // Holt einen benannten Artikel-Abschnitt (z.B. "Geschichte") als bereinigtes HTML
  async function wikiSection(title, lang, keyword){
    try {
      const sUrl = `https://${lang}.wikipedia.org/w/api.php?action=parse&format=json&origin=*&prop=sections&page=${encodeURIComponent(title)}`;
      const sr = await fetch(sUrl);
      if (!sr.ok) return null;
      const sj = await sr.json();
      const secs = (sj.parse && sj.parse.sections) || [];
      const rx = new RegExp(keyword, 'i');
      const hit = secs.find(s => s.toclevel === 1 && rx.test(s.line)) || secs.find(s => rx.test(s.line));
      if (!hit) return null;
      const tUrl = `https://${lang}.wikipedia.org/w/api.php?action=parse&format=json&origin=*&prop=text&disabletoc=1&page=${encodeURIComponent(title)}&section=${hit.index}`;
      const tr = await fetch(tUrl);
      if (!tr.ok) return null;
      const tj = await tr.json();
      const html = tj.parse && tj.parse.text && tj.parse.text['*'];
      return html ? cleanWikiSection(html, lang) : null;
    } catch(e){ return null; }
  }

  // Entfernt Tabellen/Bilder/Fußnoten/Bearbeiten-Links → saubere Lese-Prosa
  function cleanWikiSection(html, lang){
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('table, figure, img, .thumb, .infobox, .navbox, .metadata, .mw-editsection, sup.reference, .reference, style, .hatnote, .mw-empty-elt, .noprint, .reflist, .mw-references-wrap, audio, .gallery').forEach(el => el.remove());
    // Erste Überschrift entfernen (Tab heißt bereits "Geschichte")
    const firstHead = tmp.querySelector('h1,h2,h3');
    if (firstHead) firstHead.remove();
    tmp.querySelectorAll('a').forEach(a => {
      const h = a.getAttribute('href') || '';
      if (h.startsWith('/')) a.setAttribute('href', `https://${lang}.wikipedia.org` + h);
      a.setAttribute('target','_blank'); a.setAttribute('rel','noopener');
    });
    tmp.querySelectorAll('p').forEach(p => { if (!p.textContent.trim()) p.remove(); });
    return tmp.innerHTML;
  }

  // Nicht-kuratiertes Land: umfangreicher Wikipedia-Inhalt statt leerer Tabs
  async function renderWikiCountry(iso, fallbackName){
    const title = WIKI_TITLES[iso] || fallbackName || iso;
    renderLoading(fallbackName || title);
    const lead = await wikiLead(title);
    if (currentIso !== iso) return;                 // Nutzer hat inzwischen gewechselt
    if (!lead){ renderWikiError(fallbackName || title, { message:'nicht gefunden' }); return; }

    $('#c-region').textContent = 'Wikipedia · ' + lead.lang.toUpperCase();
    $('#c-name').textContent = lead.title;
    $('#c-stats').innerHTML = '';
    $('#key-dates').innerHTML = ''; $('#key-dates').hidden = true;

    const img = lead.thumb ? `<img class="wiki-image" src="${lead.thumb}" alt="${lead.title}">` : '';
    $('#tab-overview').innerHTML = `
      <div class="overview-hero">${img}${lead.extract}</div>
      <p class="hint" style="color:var(--text-3);font-size:13px;margin-top:14px">
        Für dieses Land gibt es (noch) keine handkuratierten Tiefen-Inhalte – der Text stammt live aus der Wikipedia.
        Ganzer Artikel auf <a href="${lead.canonical}" target="_blank" rel="noopener" style="color:var(--accent)">Wikipedia ↗</a>.
      </p>
    `;
    configureTabs(['overview']);
    setActiveTab('overview');
    syncLearnedButton(currentIso);
    $('#content-pane').scrollTo({top:0, behavior:'smooth'});

    // Geschichte-Abschnitt nachladen (sofern vorhanden)
    const hist = await wikiSection(title, lead.lang, 'Geschichte');
    if (currentIso !== iso) return;
    if (hist){
      $('#tab-events').innerHTML = `
        <h3>Geschichte</h3>
        <div class="wiki-section">${hist}</div>
        <p class="hint" style="color:var(--text-3);font-size:13px;margin-top:14px">
          Quelle: <a href="${lead.canonical}" target="_blank" rel="noopener" style="color:var(--accent)">Wikipedia ↗</a>
        </p>`;
      configureTabs(['overview','events'], { events:'Geschichte' });
    }
  }

  function renderWikiError(name, err){
    $('#c-region').textContent = 'Wikipedia-Inhalt';
    $('#c-name').textContent = name;
    $('#c-stats').innerHTML = '';
    $('#tab-overview').innerHTML = `
      <div class="error-state">Konnte keine Wikipedia-Inhalte für <strong>${name}</strong> laden (${err.message}).</div>
    `;
    configureTabs(['overview']);
    setActiveTab('overview');
  }

  // ---------- Detail-Fenster (Ereignisse & Personen) ----------
  const detailModal = $('#detail-modal');
  const detailBody = $('#detail-body');
  let detailToken = 0;

  function openDetail(opts){
    const token = ++detailToken;
    detailBody.innerHTML = `
      <div class="dt-kicker">${opts.kicker || ''}</div>
      <h2 class="dt-title">${opts.title || ''}</h2>
      ${opts.meta ? `<div class="dt-meta">${opts.meta}</div>` : ''}
      ${opts.lead ? `<p class="dt-lead">${opts.lead}</p>` : ''}
      <div class="dt-wiki" id="dt-wiki"><div class="loading">Lade Wikipedia-Details</div></div>
    `;
    detailModal.hidden = false;
    document.body.classList.add('modal-open');
    detailBody.parentElement.scrollTop = 0;

    const q = opts.wikiTitle || opts.title;
    (async () => {
      let w = null;
      try { w = await wikiLead(q); if (!w) w = await wikiSearch(q); } catch(e){}
      if (token !== detailToken) return;          // inzwischen anderes Detail geöffnet
      const el = $('#dt-wiki');
      if (!el) return;
      if (!w){ el.innerHTML = detailMissHtml(q); return; }
      el.innerHTML = `
        <div class="dt-wiki-head">Aus der Wikipedia</div>
        ${w.thumb ? `<img class="dt-img" src="${w.thumb}" alt="${w.title}">` : ''}
        <div class="dt-extract">${w.extract}</div>
        <a class="dt-link" href="${w.canonical}" target="_blank" rel="noopener">Ganzer Artikel auf Wikipedia ↗</a>
      `;
    })();
  }
  function detailMissHtml(q){
    return `<p class="hint" style="color:var(--text-3)">Kein direkt passender Wikipedia-Artikel gefunden.
      <a href="https://de.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}" target="_blank" rel="noopener" style="color:var(--accent)">Auf Wikipedia suchen ↗</a></p>`;
  }
  function closeDetail(){
    detailModal.hidden = true;
    document.body.classList.remove('modal-open');
  }
  $('#detail-close').addEventListener('click', closeDetail);
  $('#detail-backdrop').addEventListener('click', closeDetail);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !detailModal.hidden) closeDetail();
  });

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

  // ---------- Welcome-Karten (dynamisch aus allen kuratierten Ländern) ----------
  function buildWelcomeGrid(){
    const grid = $('#welcome-grid');
    if (!grid) return;
    const entries = Object.entries(COUNTRIES_DATA)
      .map(([iso,d]) => ({ iso, name:d.name, flag:d.flag || '' }))
      .sort((a,b) => a.name.localeCompare(b.name,'de'));
    grid.innerHTML = entries.map(e =>
      `<div class="welcome-card" data-iso="${e.iso}">${e.flag} ${e.name}</div>`
    ).join('');
    grid.querySelectorAll('.welcome-card').forEach(card => {
      card.addEventListener('click', () => openCountry(card.dataset.iso, card.textContent.trim()));
    });
  }
  buildWelcomeGrid();

  // ---------- Zufallsland ----------
  $('#random-btn').addEventListener('click', () => {
    const keys = Object.keys(COUNTRIES_DATA);
    const iso = keys[Math.floor(Math.random()*keys.length)];
    openCountry(iso, COUNTRIES_DATA[iso].name);
  });

  // ---------- Progress-Panel ----------
  const progressBtn = $('#progress-btn');
  let progressPanel = null;
  function buildProgressPanel(){
    closeProgressPanel();
    const panel = document.createElement('div');
    panel.className = 'progress-panel';
    const total = Object.keys(COUNTRIES_DATA).length;
    const pct = total ? Math.round(100 * learned.size / total) : 0;

    const items = [...learned].map(iso => {
      const name = COUNTRIES_DATA[iso]?.name || WIKI_TITLES[iso] || iso;
      const flag = COUNTRIES_DATA[iso]?.flag || '';
      return { iso, name, flag };
    }).sort((a,b) => a.name.localeCompare(b.name,'de'));

    panel.innerHTML = `
      <h3>Lernfortschritt</h3>
      <div class="pp-sub">${learned.size} von ${total} kuratierten Ländern · ${pct}%</div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      ${items.length === 0
        ? '<div class="pp-empty">Noch nichts als gelernt markiert. Öffne ein Land und klicke „Gelernt".</div>'
        : `<div class="progress-list">${items.map(it => `
            <div class="pp-item" data-iso="${it.iso}">
              <span>${it.flag} ${it.name}</span>
              <span class="pp-remove" title="Entfernen">✕</span>
            </div>`).join('')}</div>`
      }
      ${items.length > 0 ? '<button class="pp-reset" id="pp-reset">Alle zurücksetzen</button>' : ''}
    `;
    document.body.appendChild(panel);
    progressPanel = panel;

    panel.querySelectorAll('.pp-item').forEach(el => {
      el.addEventListener('click', e => {
        const iso = el.dataset.iso;
        if (e.target.classList.contains('pp-remove')) {
          setLearned(iso, false);
          buildProgressPanel();
        } else {
          closeProgressPanel();
          openCountry(iso);
        }
      });
    });
    const resetBtn = panel.querySelector('#pp-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      if (confirm('Alle gelernten Länder zurücksetzen?')) {
        learned.clear();
        saveLearned();
        updateProgressCount();
        refreshAllStyles();
        if (currentIso) syncLearnedButton(currentIso);
        buildProgressPanel();
      }
    });
  }
  function closeProgressPanel(){
    if (progressPanel) { progressPanel.remove(); progressPanel = null; }
  }
  progressBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (progressPanel) closeProgressPanel();
    else buildProgressPanel();
  });
  document.addEventListener('click', e => {
    if (progressPanel && !progressPanel.contains(e.target) && e.target !== progressBtn && !progressBtn.contains(e.target)) {
      closeProgressPanel();
    }
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

  // ========================================================================
  //  ZEITREISE — Historische Grenzen über die Zeit
  //  Daten: aourednik/historical-basemaps (CC-BY-SA), Welt-GeoJSON je Stichjahr
  // ========================================================================
  const HIST_BASE = 'https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/world_';
  const HIST_TOKENS = ['bc123000','bc10000','bc8000','bc5000','bc4000','bc3000','bc2000',
    'bc1500','bc1000','bc700','bc500','bc400','bc323','bc300','bc200','bc100','bc1',
    '100','200','300','400','500','600','700','800','900','1000','1100','1200','1279',
    '1300','1400','1492','1500','1530','1600','1650','1700','1715','1783','1800','1815',
    '1880','1900','1914','1920','1930','1938','1945','1960','1994','2000','2010'];

  const HIST_YEARS = HIST_TOKENS.map(tok => {
    const bc = tok.startsWith('bc');
    const num = parseInt(bc ? tok.slice(2) : tok, 10);
    let label;
    if (bc) label = num.toLocaleString('de-DE') + ' v. Chr.';
    else if (num < 1000) label = num + ' n. Chr.';
    else label = String(num);
    return { token: tok, label };
  });

  // Deutsche Namen für häufige historische Reiche/Entitäten (Fallback = Originalname)
  const HIST_DE = {
    'Roman Empire':'Römisches Reich', 'Western Roman Empire':'Weströmisches Reich',
    'Eastern Roman Empire':'Oströmisches Reich', 'Byzantine Empire':'Byzantinisches Reich',
    'Holy Roman Empire':'Heiliges Römisches Reich', 'Ottoman Empire':'Osmanisches Reich',
    'Russian Empire':'Russisches Kaiserreich', 'Russia':'Russland', 'Soviet Union':'Sowjetunion',
    'Mongol Empire':'Mongolisches Reich', 'Persian Empire':'Persisches Reich',
    'Achaemenid Empire':'Achämenidenreich', 'Sasanian Empire':'Sassanidenreich',
    'Parthian Empire':'Partherreich', 'Macedon':'Makedonien', 'Macedonia':'Makedonien',
    'Carthage':'Karthago', 'Gaul':'Gallien', 'Ptolemaic Kingdom':'Ptolemäerreich',
    'Egypt':'Ägypten', 'Greece':'Griechenland', 'Han Empire':'Han-Reich', 'Han dynasty':'Han-Dynastie',
    'Tang dynasty':'Tang-Dynastie', 'Ming dynasty':'Ming-Dynastie', 'Qing Empire':'Qing-Reich',
    'Qing dynasty':'Qing-Dynastie', 'China':'China', 'Japan':'Japan', 'Imperial Japan':'Kaiserreich Japan',
    'British Empire':'Britisches Weltreich', 'United Kingdom':'Vereinigtes Königreich',
    'Great Britain':'Großbritannien', 'England':'England', 'France':'Frankreich',
    'Kingdom of France':'Königreich Frankreich', 'Spain':'Spanien', 'Spanish Empire':'Spanisches Weltreich',
    'Portugal':'Portugal', 'Portuguese Empire':'Portugiesisches Weltreich',
    'Austria-Hungary':'Österreich-Ungarn', 'Austrian Empire':'Kaisertum Österreich',
    'Habsburg Monarchy':'Habsburgermonarchie', 'Prussia':'Preußen', 'German Empire':'Deutsches Kaiserreich',
    'Germany':'Deutschland', 'Nazi Germany':'Deutsches Reich (NS)', 'Italy':'Italien',
    'Kingdom of Italy':'Königreich Italien', 'Papal States':'Kirchenstaat',
    'Republic of Venice':'Republik Venedig', 'United States':'Vereinigte Staaten',
    'United States of America':'Vereinigte Staaten', 'Mexico':'Mexiko', 'Brazil':'Brasilien',
    'Inca Empire':'Inkareich', 'Aztec Empire':'Aztekenreich', 'Poland':'Polen',
    'Polish-Lithuanian Commonwealth':'Polen-Litauen', 'Poland-Lithuania':'Polen-Litauen',
    'Sweden':'Schweden', 'Denmark':'Dänemark', 'Norway':'Norwegen', 'Netherlands':'Niederlande',
    'Dutch Republic':'Republik der Niederlande', 'Switzerland':'Schweiz', 'India':'Indien',
    'Mughal Empire':'Mogulreich', 'Maurya Empire':'Maurya-Reich', 'Gupta Empire':'Gupta-Reich',
    'Kievan Rus':'Kiewer Rus', 'Caliphate':'Kalifat', 'Umayyad Caliphate':'Umayyaden-Kalifat',
    'Abbasid Caliphate':'Abbasiden-Kalifat', 'Rashidun Caliphate':'Raschidun-Kalifat',
    'Frankish Empire':'Frankenreich', 'Carolingian Empire':'Karolingerreich',
    'Ethiopia':'Äthiopien', 'Mali Empire':'Mali-Reich', 'Songhai Empire':'Songhai-Reich',
    'Korea':'Korea', 'Joseon':'Joseon (Korea)', 'Vietnam':'Vietnam', 'Siam':'Siam',
    'Khmer Empire':'Khmer-Reich', 'Ukraine':'Ukraine', 'Turkey':'Türkei'
  };

  function histName(props){
    const raw = (props && (props.NAME || props.SUBJECTO || props.PARTOF)) || 'Unbekannt';
    return HIST_DE[raw] || raw;
  }
  // Stabile Farbe pro Entität (Name-Hash → HSL)
  function histColor(name){
    let h = 0;
    for (let i=0;i<name.length;i++){ h = (h*31 + name.charCodeAt(i)) % 360; }
    return `hsl(${h}, 52%, 56%)`;
  }

  const histCache = new Map();    // token → parsed GeoJSON
  let histLayer = null;
  let timeMode = false;
  let timeIdx = Math.max(0, HIST_TOKENS.indexOf('1914'));
  let playTimer = null;

  const timeBtn = $('#time-btn');
  const timeControls = $('#time-controls');
  const tcSlider = $('#tc-slider');
  const tcYear = $('#tc-year');
  const tcStatus = $('#tc-status');
  const tcPlay = $('#tc-play');
  tcSlider.max = HIST_YEARS.length - 1;

  function enterTimeMode(){
    if (timeMode) return;
    timeMode = true;
    document.body.classList.add('time-mode');
    timeControls.hidden = false;
    timeBtn.classList.add('is-active');
    if (geoLayer) map.removeLayer(geoLayer);
    map.flyTo([20,10], 2, { duration:0.5 });
    showYear(timeIdx);
  }
  function exitTimeMode(){
    if (!timeMode) return;
    stopPlay();
    timeMode = false;
    document.body.classList.remove('time-mode');
    timeControls.hidden = true;
    timeBtn.classList.remove('is-active');
    if (histLayer){ map.removeLayer(histLayer); histLayer = null; }
    if (geoLayer) geoLayer.addTo(map);
  }

  async function loadHistYear(token){
    if (histCache.has(token)) return histCache.get(token);
    const r = await fetch(HIST_BASE + token + '.geojson');
    if (!r.ok) throw new Error('http '+r.status);
    const data = await r.json();
    histCache.set(token, data);
    return data;
  }

  function drawHistLayer(data){
    if (histLayer){ map.removeLayer(histLayer); histLayer = null; }
    histLayer = L.geoJSON(data, {
      style: f => ({
        fillColor: histColor(histName(f.properties)),
        color:'#0a0f1f', weight:0.6, fillOpacity:0.5
      }),
      onEachFeature: (f, layer) => {
        layer.bindTooltip(histName(f.properties), { sticky:true, direction:'top', className:'hist-tooltip' });
        layer.on({
          mouseover: () => { layer.setStyle({ weight:1.6, color:'#fff', fillOpacity:0.72 }); layer.bringToFront(); },
          mouseout:  () => { layer.setStyle({ weight:0.6, color:'#0a0f1f', fillOpacity:0.5 }); }
        });
      }
    }).addTo(map);
  }

  async function showYear(idx){
    idx = Math.max(0, Math.min(HIST_YEARS.length-1, idx));
    timeIdx = idx;
    const y = HIST_YEARS[idx];
    tcYear.textContent = y.label;
    tcSlider.value = idx;
    tcStatus.textContent = 'Lade Karte …';
    let data;
    try { data = await loadHistYear(y.token); }
    catch(e){
      if (timeIdx === idx) tcStatus.textContent = 'Für dieses Jahr nicht verfügbar';
      return;
    }
    if (timeIdx !== idx) return;   // Slider weitergezogen → veraltetes Ergebnis verwerfen
    drawHistLayer(data);
    tcStatus.textContent = (data.features || []).length + ' politische Gebilde · zum Vergrößern scrollen';
  }

  function startPlay(){
    if (playTimer) return;
    tcPlay.textContent = '⏸'; tcPlay.title = 'Pause';
    playTimer = setInterval(() => {
      if (timeIdx >= HIST_YEARS.length-1){ stopPlay(); return; }
      showYear(timeIdx + 1);
    }, 1900);
  }
  function stopPlay(){
    if (playTimer){ clearInterval(playTimer); playTimer = null; }
    tcPlay.textContent = '⏵'; tcPlay.title = 'Zeit abspielen';
  }

  timeBtn.addEventListener('click', () => timeMode ? exitTimeMode() : enterTimeMode());
  $('#tc-exit').addEventListener('click', exitTimeMode);
  $('#tc-prev').addEventListener('click', () => { stopPlay(); showYear(timeIdx - 1); });
  $('#tc-next').addEventListener('click', () => { stopPlay(); showYear(timeIdx + 1); });
  tcPlay.addEventListener('click', () => playTimer ? stopPlay() : startPlay());
  tcSlider.addEventListener('input', e => { stopPlay(); showYear(parseInt(e.target.value,10)); });

})();
