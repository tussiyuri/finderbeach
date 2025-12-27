
// --- SERVICES ---

const WeatherService = {
  async getWeather(lat, lng) {
    if (!lat || !lng) {
      console.error("WeatherService: Missing coords", lat, lng);
      throw new Error("Coordinate mancanti");
    }
    console.log(`WeatherService: Fetching for ${lat}, ${lng}`);
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`
      );
      if (!response.ok) throw new Error(`API Error: ${response.status}`);

      const data = await response.json();
      console.log("WeatherService: Data received", data);

      if (!data || !data.current) throw new Error("Dati incompleti o malformati");
      return data;
    } catch (error) {
      console.error("WeatherService: Caught error", error);
      throw error;
    }
  },

  getWeatherLabel(code) {
    const codes = {
      0: 'Cielo Sereno', 1: 'Poco Nuvoloso', 2: 'Parzialmente Nuvoloso', 3: 'Coperto',
      45: 'Nebbia', 48: 'Nebbia brinata', 51: 'Pioggerella', 61: 'Pioggia',
      71: 'Neve', 95: 'Temporale'
    };
    return codes[code] || 'Variabile';
  },

  getWindDirection(degrees) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
  },

  calculateBeachScore(w) {
    if (!w || !w.current) return { score: 0, label: 'N/A', sea: 'Sconosciuto', css: 'sea-choppy' };

    let score = 0;
    const code = w.current.weather_code;
    const temp = w.current.temperature_2m;
    const wind = w.current.wind_speed_10m;

    // 1. Weather Condition (Max 4 pts)
    if (code === 0) score += 4; // Clear Sky
    else if (code <= 2) score += 3; // Partly Cloudy
    else if (code <= 3) score += 2; // Overcast
    else if (code >= 95) score -= 2; // Thunderstorm
    else if (code >= 51) score -= 1; // Rain

    // 2. Wind / Sea (Max 3 pts)
    // Ideal wind < 10km/h
    if (wind < 10) score += 3;
    else if (wind < 20) score += 2;
    else if (wind < 30) score += 1;
    else score -= 1; // Windy

    // 3. Temperature (Max 3 pts)
    // Ideal beach temp 25-32
    if (temp >= 25 && temp <= 32) score += 3;
    else if (temp >= 20) score += 2;
    else if (temp >= 15) score += 1;
    else score -= 1; // Too cold

    // Normalize to 0-10 then to 1-5
    // Max raw score approx 10. Min approx -4.
    // Let's map robustly:
    // Raw 10 -> 5.0
    // Raw 5 -> 2.5
    // Raw < 0 -> 1.0

    let finalScore = (score / 2); // 0-5 scale roughly
    if (finalScore > 5) finalScore = 5;
    if (finalScore < 1) finalScore = 1;

    // Formatting
    const scoreStr = finalScore.toFixed(1).replace('.', ',');

    // Sea Condition
    let seaLabel = "Calmo 🌊";
    let seaCss = "sea-calm";
    if (wind >= 10 && wind < 25) { seaLabel = "Poco Mosso 〰️"; seaCss = "sea-choppy"; }
    else if (wind >= 25) { seaLabel = "Mosso/Agitato 🌊💨"; seaCss = "sea-rough"; }

    return { score: scoreStr, raw: finalScore, sea: seaLabel, css: seaCss };
  }
};

// Fallback Service for Variety when Flickr fails
const BeachImageService = {
  imagePool: [
    "photo-1507525428034-b723cf961d3e",
    "photo-1519046904884-53103b34b206",
    "photo-1471922694854-ff1b63b20054",
    "photo-1468413253725-0d518130b7e7",
    "photo-1520942702018-08622ee79dd7",
    "photo-1499209971180-415802d8d75e",
    "photo-1506929562872-bb421503ef21",
    "photo-1454391304352-2bf4678b1a7a",
    "photo-1515238152791-8216bfdf89a7",
    "photo-1537162998323-38aa878da431",
    "photo-1509233725247-49e657c54213",
    "photo-1506953823976-52e1fdc0149a",
    "photo-1596395819057-d37e246067b",
    "photo-1544551763-46a42a45745b",
    "photo-1510414842594-a61c69b5ae57",
  ],

  getImage(name) {
    if (!name) return `https://images.unsplash.com/${this.imagePool[0]}?w=800&q=80`;
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % this.imagePool.length;
    const id = this.imagePool[index];
    // Fallback to generic beach if specific image fails
    return `https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80`;
  },
};

// ... (Rest of code) ...

// JSONP Handler for Flickr
const FlickrService = {
  search(query) {
    return new Promise((resolve) => {
      const callbackName = 'flickrCallback_' + Math.round(Math.random() * 1000000);

      const timeout = setTimeout(() => {
        delete window[callbackName];
        if (document.body.contains(script)) document.body.removeChild(script);
        resolve([]);
      }, 5000);

      window[callbackName] = (data) => {
        clearTimeout(timeout);
        delete window[callbackName];
        if (document.body.contains(script)) document.body.removeChild(script);
        resolve(data.items || []);
      };

      const script = document.createElement('script');
      // Adding 'beach' context but avoiding over-constraining
      const tags = encodeURIComponent(query + ",beach");
      script.src = `https://api.flickr.com/services/feeds/photos_public.gne?tags=${tags}&tagmode=all&format=json&jsoncallback=${callbackName}`;

      script.onerror = () => {
        clearTimeout(timeout);
        delete window[callbackName];
        if (document.body.contains(script)) document.body.removeChild(script);
        resolve([]);
      };

      document.body.appendChild(script);
    });
  }
};

// HELPER: Haversine Distance in km
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2 - lat1);  // deg2rad below
  var dLon = deg2rad(lon2 - lon1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
    ;
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180)
}

const BeachService = {
  // Hardcoded 'Featured' Beaches - EMPTIED as requested to properly test dynamic fetching
  // We keep the structure but empty the content so everything comes from "Search" logic
  localBeaches: [
    // Navagio kept ONLY as a fallback reference if API fails strictly, 
    // but the logic below will prefer API results if found.
    // Actually, removing them ensures we use the API as requested.
  ],

  // Curated queries to populate the homepage dynamically
  featuredQueries: {
    trending: ["Cala Mariolu", "Rabbit Beach", "Tropea"],
    famous: ["Navagio Beach", "Anse Source d'Argent", "Whitehaven Beach"]
  },

  async fetchFeatured() {
    // Helper to fetch valid results for a list of queries
    const fetchList = async (queries) => {
      let results = [];
      for (const q of queries) {
        try {
          const res = await this.search(q);
          if (res && res.length > 0) {
            // Take the first best match
            results.push(res[0]);
          }
        } catch (e) {
          console.warn(`Failed to fetch featured: ${q}`, e);
        }
      }
      return results;
    };

    const [trending, famous] = await Promise.all([
      fetchList(this.featuredQueries.trending),
      fetchList(this.featuredQueries.famous)
    ]);

    return { trending, famous };
  },
  // Cache
  allBeaches: [],

  // Track used photos in this session to avoid duplicates on the grid
  usedPhotoIds: new Set(),

  async getPhotos(query) {
    // Search returns Beach Objects now. We need to extract the photos from the best match.
    const results = await this.search(query);
    if (results && results.length > 0) {
      // Return the photos of the first result (Google Places usually)
      // Ensure we strictly return an array of strings
      const bestMatch = results[0];
      if (bestMatch.photos && Array.isArray(bestMatch.photos)) {
        return bestMatch.photos;
      } else if (bestMatch.preview) {
        return [bestMatch.preview];
      }
    }
    return [];
  },

  async search(query, location = null, countryCode = null) {
    const q = query.toLowerCase();
    this.usedPhotoIds.clear();

    const curatedMatch = this.localBeaches.filter(b => b.name.toLowerCase().includes(q));

    if (!window.google) {
      console.warn("Google Maps not loaded. Returning local matches.");
      return curatedMatch;
    }

    // Google Places Search
    const mapDiv = document.createElement('div');
    const service = new google.maps.places.PlacesService(mapDiv);

    // DYNAMIC SEARCH STRATEGY
    // 1. If we have a specific location (from Autocomplete), search NEAR there.
    // 2. If 'query' looks like a generic term (e.g. "Spiagge"), search near the location.

    let request = {};

    if (location) {
      // SMART KEYWORD MAPPING
      const keywords = {
        'IT': 'spiaggia', // Italy
        'ES': 'playa',    // Spain
        'MX': 'playa',    // Mexico
        'AR': 'playa',    // Argentina
        'FR': 'plage',    // France
        'PT': 'praia',    // Portugal
        'BR': 'praia',    // Brazil
        'DE': 'strand',   // Germany
        'NL': 'strand',   // Netherlands
      };
      const activeKeyword = (countryCode && keywords[countryCode]) ? keywords[countryCode] : 'beach';

      // RADAR SEARCH: We have coordinates. Find CLOSEST beaches (Distance Sort).
      console.log(`📍 RADAR SEARCH: Searching for '${activeKeyword}' near`, location, `(${countryCode})`);
      request = {
        location: location,
        rankBy: google.maps.places.RankBy.DISTANCE, // Strict distance sorting
        keyword: activeKeyword,
        // 'radius' MUST be removed when using rankBy: DISTANCE
      };
    } else {
      // TEXT SEARCH: Classic behavior
      let searchQuery = query;
      if (!query.toLowerCase().includes('beach') && !query.toLowerCase().includes('spiaggia')) {
        searchQuery = `beaches in ${query}`;
      }
      request = {
        query: searchQuery
      };
    }

    return new Promise((resolve) => {
      let allPlaces = [];

      try {
        if (location) {
          // Use nearbySearch for precise location radius
          service.nearbySearch(request, (results, status, pagination) => {
            handleResponse(results, status, pagination);
          });
        } else {
          // Use textSearch for free text
          service.textSearch(request, (results, status, pagination) => {
            handleResponse(results, status, pagination);
          });
        }

        const handleResponse = (results, status, pagination) => {
          // SAFEGUARD CALLBACK
          try {
            if (status === google.maps.places.PlacesServiceStatus.OK && results) {
              allPlaces = [...allPlaces, ...results];

              // PAGINATION: Fetch up to 60 results (Google Limit is 60 = 3 pages of 20)
              // We need deep results to find local beaches like "Spiaggia di Mezzo"
              if (pagination && pagination.hasNextPage && allPlaces.length < 60) {
                // Google API requires ~2s delay for next page token to become valid
                setTimeout(() => {
                  console.log("Fetching next page of results...");
                  pagination.nextPage();
                }, 2000);
              } else {
                // Finished fetching
                // Filter duplicates just in case
                const unique = Array.from(new Map(allPlaces.map(item => [item.place_id, item])).values());
                // Sort: Photos first, then original rank (distance)
                const sorted = unique.sort((a, b) => (b.photos ? 1 : 0) - (a.photos ? 1 : 0));
                finish(sorted);
              }
            } else {
              // If we gathered some places before error/end, show them
              if (allPlaces.length > 0) {
                finish(allPlaces);
              } else {
                console.warn("Search failed or empty:", status);
                finish([]);
              }
            }
          } catch (err) {
            console.error("Critical error in search callback:", err);
            // Graceful exit with what we have
            finish(allPlaces);
          }
        };

      } catch (err) {
        console.error("Failed to start search:", err);
        finish([]);
      }

      const finish = (places) => {
        try {
          if (!places || places.length === 0) {
            if (curatedMatch.length > 0) {
              resolve(curatedMatch);
              return;
            }
            resolve([]);
            return;
          }

          const processed = places.map(place => {
            let photoUrl = null;
            try {
              if (place.photos && place.photos.length > 0) {
                photoUrl = place.photos[0].getUrl({ maxWidth: 500 });
              }
            } catch (err) {
              console.warn("Error getting photo URL for", place.name, err);
            }

            if (!photoUrl) {
              photoUrl = BeachImageService.getImage(place.name);
            }

            const isRegion = (place.types && (place.types.includes('administrative_area_level_1') || place.types.includes('locality'))) || false;

            // Safer lat/lng extraction
            let lat = 0, lng = 0;
            try {
              if (place.geometry && place.geometry.location) {
                lat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
                lng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
              }
            } catch (e) { }

            // Safely extract photos for gallery
            let gallery = [];
            try {
              if (place.photos) {
                gallery = place.photos.map(p => p.getUrl({ maxWidth: 800 }));
              }
            } catch (e) { }

            return {
              id: place.place_id,
              name: place.name,
              location: place.vicinity || place.formatted_address || "Posizione sconosciuta", // vicinity is better for nearbySearch
              lat: lat,
              lng: lng,
              preview: photoUrl,
              rating: place.rating,
              reviews: place.user_ratings_total,
              isRegion: isRegion,
              photos: gallery
            };
          });

          // Merge curated
          const final = [...processed];
          curatedMatch.forEach(local => {
            if (!final.find(f => f.name.toLowerCase() === local.name.toLowerCase())) {
              final.push(local);
            }
          });

          this.allBeaches = [...this.allBeaches, ...final];
          resolve(final);

        } catch (finishErr) {
          console.error("Error in finish processing:", finishErr);
          resolve(curatedMatch);
        }
      };
    });
  },

  getById(id) {
    const beach = this.allBeaches.find(b => String(b.id) === String(id)) || this.localBeaches.find(b => String(b.id) === String(id));
    if (beach && (!beach.gallery || beach.gallery.length === 0)) {
      beach.gallery = [beach.preview];
    }
    return beach;
  }
};

// Expose services for global access (needed for inline event handlers like onerror)
window.BeachImageService = BeachImageService;

// --- APP STATE & ROUTING ---

// --- DATA: DESTINATIONS ---
const Destinations = {
  "Europa": {
    "Italia": ["Sardegna", "Sicilia", "Puglia", "Toscana", "Liguria"],
    "Spagna": ["Ibiza", "Formentera", "Mallorca", "Menorca", "Tenerife"],
    "Grecia": ["Creta", "Santorini", "Mykonos", "Rodi", "Zante"],
    "Francia": ["Costa Azzurra", "Corsica", "Normandia"],
    "Portogallo": ["Algarve", "Madeira"]
  },
  "Asia": {
    "Thailandia": ["Phuket", "Koh Samui", "Phi Phi Islands", "Krabi"],
    "Indonesia": ["Bali", "Lombok", "Gili Islands"],
    "Maldive": ["Atollo di Malé", "Atollo di Ari"],
    "Filippine": ["Palawan", "Boracay"]
  },
  "Americhe": {
    "USA": ["Miami / Florida", "Hawaii", "California", "Hamptons"],
    "Messico": ["Tulum", "Cancun", "Playa del Carmen", "Cabo San Lucas"],
    "Caraibi": ["Bahamas", "Turks & Caicos", "Aruba", "Jamaica"],
    "Brasile": ["Copacabana", "Ipanema", "Fernando de Noronha"]
  },
  "Oceania": {
    "Australia": ["Gold Coast", "Whitehaven Beach", "Bondi Beach"],
    "Polinesia": ["Bora Bora", "Tahiti", "Moorea"],
    "Fiji": ["Mamanuca Islands", "Yasawa Islands"]
  },
  "Africa": {
    "Egitto": ["Sharm El Sheikh", "Marsa Alam", "Hurghada"],
    "Zanzibar": ["Nungwi", "Kendwa"],
    "Seychelles": ["La Digue", "Praslin", "Mahe"]
  }
};

const App = {
  state: {
    view: 'home',
    searchQuery: '',
    searchResults: [],
    isSearching: false,
    selectedBeach: null,
    weatherData: null,
    weatherError: null,
    // Navigation State
    selectedContinent: 'Europa', // Default open
    selectedCountry: null,
    recentBeaches: [],
    // Dynamic Homepage Data
    trendingBeaches: [],
    famousBeaches: [],
    isLoadingHome: true
  },

  init() {
    BeachService.allBeaches = [...BeachService.localBeaches];

    // Load Recent Searches (Safeguarded & Hydrated)
    try {
      const saved = localStorage.getItem('recentBeaches');
      if (saved) {
        let loaded = JSON.parse(saved);
        // HYDRATION FIX: Refresh data from localBeaches source of truth
        // This fixes broken/stale URLs in localStorage
        this.state.recentBeaches = loaded.map(recent => {
          const fresh = BeachService.localBeaches.find(lb => lb.id === recent.id);
          if (fresh) {
            return { ...recent, preview: fresh.preview, name: fresh.name, location: fresh.location };
          }
          return recent;
        });
      }
    } catch (e) {
      console.warn("Storage access failed or empty", e);
    }

    // INITIAL RENDER (Skeleton/Loading)
    this.render();
    lucide.createIcons();

    // DYNAMIC FETCH
    // We do this after initial render so the app opens immediately
    BeachService.fetchFeatured().then(data => {
      this.state.trendingBeaches = data.trending;
      this.state.famousBeaches = data.famous;
      this.state.isLoadingHome = false;
      this.render(); // Re-render with data
      lucide.createIcons();
    });
  },

  navigateTo(view, data = {}) {
    this.state = { ...this.state, view, ...data };
    this.render();
    lucide.createIcons();
    window.scrollTo(0, 0);
  },

  goBack() {
    // Reset selection to prevent lingering state
    this.state.selectedBeach = null;
    this.state.weatherData = null;

    if (this.state.view === 'map-explorer') {
      this.navigateTo('results');
      return;
    }

    if (this.state.searchResults.length > 0) {
      this.navigateTo('results');
    } else {
      this.navigateTo('home');
    }
  },

  // --- RENDER FUNCTIONS ---

  render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      ${this.renderHeader()}
      <main>
        ${this.renderView()}
      </main>
      ${this.renderFooter()}
    `;
    this.attachEvents();
    if (this.state.view === 'detail' && this.state.selectedBeach) {
      this.initMap(this.state.selectedBeach);
    }
    // Autocomplete on Home
    if (this.state.view === 'home') {
      this.initAutocomplete();
    }
  },

  renderHeader() {
    return `
      <header class="app-header">
        <div class="container header-content">
          <div class="logo" onclick="window.App.navigateTo('home')">
            <i data-lucide="palmtree"></i> FinderBeach
          </div>
          <nav>
            <button class="btn btn-ghost" onclick="window.App.navigateTo('home')">Home</button>
          </nav>
        </div>
      </header>
    `;
  },

  // --- DESTINATIONS NAV ---

  selectContinent(name) {
    this.state.selectedContinent = name;
    this.state.selectedCountry = null; // Reset sub-selection
    this.render(); // Re-render to show countries
    lucide.createIcons();
  },

  selectCountry(name) {
    this.state.selectedCountry = (this.state.selectedCountry === name) ? null : name; // Toggle
    this.render();
    lucide.createIcons();
  },

  selectRegion(name) {
    // Trigger Search
    const query = name.includes(" / ") ? name.split(" / ")[0] : name;
    // Add "Spiagge" prefix for better results context if needed, or just search the name
    const fullQuery = `Spiagge ${query}`;

    // Set search box value for feedback
    const input = document.getElementById('home-search-input');
    if (input) input.value = fullQuery;

    this.handleSearch(fullQuery);
  },

  renderDestinations() {
    const s = this.state;
    const continents = Object.keys(Destinations);

    // 1. Continents Row
    let html = `
      <div class="destinations-box">
        <div class="pill-row">
          ${continents.map(c => `
            <button class="nav-pill ${s.selectedContinent === c ? 'active' : ''}" 
                    onclick="window.App.selectContinent('${c}')">
              ${c}
            </button>
          `).join('')}
        </div>
    `;

    // 2. Countries Row (if Continent selected)
    if (s.selectedContinent) {
      const countries = Object.keys(Destinations[s.selectedContinent]);
      html += `
        <div class="pill-row fade-in" style="margin-top: 1rem; padding-top:1rem; border-top:1px solid var(--border);">
           ${countries.map(c => `
            <button class="nav-pill outline ${s.selectedCountry === c ? 'active' : ''}" 
                    onclick="window.App.selectCountry('${c}')">
              ${c}
            </button>
          `).join('')}
        </div>
      `;
    }

    // 3. Regions Row (if Country selected)
    if (s.selectedContinent && s.selectedCountry) {
      const regions = Destinations[s.selectedContinent][s.selectedCountry];
      html += `
        <div class="pill-row fade-in" style="margin-top: 1rem;">
           ${regions.map(r => `
            <button class="nav-pill small" onclick="window.App.selectRegion('${r}')">
              ${r} <i data-lucide="arrow-right" style="width:12px; height:12px; margin-left:4px;"></i>
            </button>
          `).join('')}
        </div>
      `;
    }

    html += `</div>`;
    return html;
  },

  renderFooter() {
    return `
      <footer style="padding: 2rem 0; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
        <div class="container">
          <p>&copy; 2025 BeachFinder. Dati: Open-Meteo & OpenStreetMap & Flickr.</p>
        </div>
      </footer>
    `;
  },

  renderView() {
    switch (this.state.view) {
      case 'home': return this.renderHome();
      case 'results': return this.renderResults();
      case 'detail': return this.renderDetail();
      case 'map-explorer': return this.renderMapExplorer();
      default: return this.renderHome();
    }
  },

  renderMapExplorer() {
    // We expect this.state.mapRegion to be set
    setTimeout(() => this.initExplorerMap(), 100);

    return `
        <div class="map-explorer-container" style="position:relative; height: calc(100vh - 80px);">
            <div id="explorer-map" style="width:100%; height:100%;"></div>
            
            <!-- Floating Back Button -->
            <div style="position:absolute; top: 1rem; left: 1rem; z-index: 1000; background: white; padding: 0.5rem; border-radius: 0.5rem; box-shadow: 0 2px 10px rgba(0,0,0,0.2);">
                <button class="btn btn-ghost" onclick="window.App.goBack()">
                    <i data-lucide="arrow-left"></i> Torna ai Risultati
                </button>
            </div>

            <!-- Floating Search Here Button -->
            <div style="position:absolute; top: 1rem; left: 50%; transform:translateX(-50%); z-index: 1000;">
                <button id="search-area-btn" class="btn btn-primary" style="background: white; color: var(--primary); padding: 0.8rem 1.5rem; font-weight: 600; box-shadow: 0 4px 15px rgba(0,0,0,0.2); display:none;" onclick="window.App.searchCurrentMapArea()">
                    <i data-lucide="search"></i> Cerca in quest'area
                </button>
            </div>

            <!-- Floating Title -->
             <div style="position:absolute; bottom: 2rem; left: 50%; transform:translateX(-50%); z-index: 1000; background: rgba(255,255,255,0.9); padding: 0.8rem 1.5rem; border-radius: 2rem; box-shadow: 0 4px 20px rgba(0,0,0,0.2); backdrop-filter:blur(5px); text-align:center;">
                <h3 style="margin:0; font-size:1rem; color:var(--text-primary);">
                    ${this.state.mapRegion ? this.state.mapRegion.name : 'Esplora'}
                    <span id="map-result-count" style="font-weight:400; font-size:0.9rem; color:#666; display:block;">
                        ${this.state.searchResults.filter(r => !r.isRegion).length} spiagge trovate
                    </span>
                </h3>
            </div>
        </div>
      `;
  },

  // New function to handle manual map search
  searchCurrentMapArea() {
    if (!this.currentMap || !window.google) return;

    const btn = document.getElementById('search-area-btn');
    if (btn) {
      btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Cercando...';
      btn.disabled = true;
      lucide.createIcons();
    }

    const center = this.currentMap.getCenter();
    const service = new google.maps.places.PlacesService(this.currentMap);

    const request = {
      location: center,
      radius: 50000,
      keyword: 'beach',
    };

    service.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        console.log(`Manual area search found ${results.length} beaches.`);

        // Existing Markers are not cleared, we just add new ones (deduplication visually handled by map or simple overwrite)
        // Ideally we should track them.

        // Reuse addMarker logic if possible, but it's scoped. Let's replicate simple marker add.
        const infowindow = new google.maps.InfoWindow();
        const bounds = new google.maps.LatLngBounds();

        results.forEach(b => {
          const marker = new google.maps.Marker({
            position: b.geometry.location,
            map: this.currentMap,
            title: b.name,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#ea580c",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            }
          });

          const id = b.place_id;
          marker.addListener("click", () => {
            infowindow.setContent(`
                        <div style="text-align:center; min-width: 150px; color: black; font-family: sans-serif;">
                            <h4 style="margin:0 0 5px 0; font-size:1rem;">${b.name}</h4>
                            <button onclick="window.App.selectBeach(decodeURIComponent('${encodeURIComponent(id)}'))" 
                                    style="margin-top:0.8rem; background:#0ea5e9; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:500;">
                                Vedi Dettagli
                            </button>
                        </div>
                     `);
            infowindow.open(window.App.currentMap, marker);
          });
        });

        // Update count
        const countEl = document.getElementById('map-result-count');
        if (countEl) countEl.innerText = `${results.length} nuove spiagge trovate`;

      } else {
        console.warn("Manual search empty/failed", status);
      }

      if (btn) {
        btn.innerHTML = '<i data-lucide="search"></i> Cerca in quest\'area';
        btn.disabled = false;
        btn.style.display = 'none'; // Hide again until moved? Or keep visible? Better hide to reset.
        lucide.createIcons();
      }
    });
  },

  // --- AUTOCOMPLETE ---
  initAutocomplete() {
    setTimeout(() => {
      const input = document.getElementById('home-search-input');
      if (!input || !window.google || !window.google.maps || !window.google.maps.places) return;

      // Prevent multiple initializations if already attached
      // straightforward way: just recreate, cost is low.

      const autocomplete = new google.maps.places.Autocomplete(input, {
        types: ['(regions)'], // Prefer regions/islands
        fields: ['place_id', 'geometry', 'name']
      });

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();

        if (!place.geometry) {
          // User hit enter without selecting suggestion
          this.handleSearch(place.name);
          return;
        }

        // User selected a suggestion - PASS LOCATION & COUNTRY FOR RADAR SEARCH
        console.log("Selected from Autocomplete:", place.name, place.geometry.location);

        let countryCode = null;
        if (place.address_components) {
          const country = place.address_components.find(c => c.types.includes('country'));
          if (country) countryCode = country.short_name;
        }

        this.handleSearch(place.name, place.geometry.location, countryCode);
      });
    }, 500); // Slight delay to ensure DOM and Google JS
  },

  initExplorerMap() {
    const region = this.state.mapRegion;
    // Current results might just be the region itself, so we filter.
    let beaches = this.state.searchResults.filter(r => !r.isRegion);

    // Default center
    let center = { lat: 20, lng: 0 };
    let zoom = 2;

    if (region) {
      center = { lat: parseFloat(region.lat), lng: parseFloat(region.lng) };
      zoom = 10;
    } else if (beaches.length > 0) {
      center = { lat: parseFloat(beaches[0].lat), lng: parseFloat(beaches[0].lng) };
      zoom = 9;
    }

    if (!window.google) {
      console.error("Google Maps not loaded in initExplorerMap");
      return;
    }

    const mapEl = document.getElementById('explorer-map');
    if (!mapEl) return;

    const map = new google.maps.Map(mapEl, {
      center: center,
      zoom: zoom,
      disableDefaultUI: false,
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false
    });
    this.currentMap = map; // Global ref for searchCurrentMapArea

    // Show "Search Here" button when map is dragged
    map.addListener('dragend', () => {
      const btn = document.getElementById('search-area-btn');
      if (btn) btn.style.display = 'inline-flex';
    });

    const bounds = new google.maps.LatLngBounds();
    const infowindow = new google.maps.InfoWindow();

    // Helper to add marker
    const addMarker = (b) => {
      const lat = parseFloat(b.lat || b.geometry?.location?.lat());
      const lng = parseFloat(b.lng || b.geometry?.location?.lng());

      if (isNaN(lat) || isNaN(lng)) return;
      const pos = { lat, lng };

      const marker = new google.maps.Marker({
        position: pos,
        map: map,
        title: b.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#ea580c",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        }
      });

      // Handle different ID structures (PlaceResult vs internal App ID)
      const id = b.place_id || b.id;

      marker.addListener("click", () => {
        infowindow.setContent(`
                <div style="text-align:center; min-width: 150px; color: black; font-family: sans-serif;">
                    <h4 style="margin:0 0 5px 0; font-size:1rem;">${b.name}</h4>
                    <p style="margin:0; font-size:0.8rem; color:#666;">${b.formatted_address || b.location || ''}</p>
                    <button onclick="window.App.selectBeach(decodeURIComponent('${encodeURIComponent(id)}'))" 
                            style="margin-top:0.8rem; background:#0ea5e9; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:500;">
                        Vedi Dettagli
                    </button>
                </div>
             `);
        infowindow.open(map, marker);
      });

      bounds.extend(pos);
      return marker;
    };

    // SCENARIO 1: We already have beaches from the main search
    if (beaches.length > 0) {
      beaches.forEach(addMarker);
      map.fitBounds(bounds);
    }
    // SCENARIO 2: We have a REGION using the Map Explorer, but 0 beaches in state (Common for "Sardegna" search)
    else if (region) {
      console.log(`Region found: ${region.name}, but 0 beaches in state. Triggering local search...`);

      const service = new google.maps.places.PlacesService(map);
      const request = {
        location: center,
        radius: 50000, // 50km radius from region center
        keyword: 'beach', // More specific than textSearch
        // rankBy: google.maps.places.RankBy.PROMINENCE
      };

      service.nearbySearch(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          console.log(`Local search found ${results.length} beaches.`);

          // Add these new results to the map
          results.forEach(addMarker);

          // Update the "X beaches found" text via DOM since we are bypassing state render
          const countEl = document.getElementById('map-result-count');
          if (countEl) countEl.innerText = `${results.length} spiagge trovate`;

          // Fit bounds to new results
          if (results.length > 0) {
            const newBounds = new google.maps.LatLngBounds();
            results.forEach(r => newBounds.extend(r.geometry.location));
            map.fitBounds(newBounds);
          }
        } else {
          console.warn("Local map search failed:", status);
        }
      });
    }
  },

  renderHome() {
    const trending = BeachService.localBeaches.slice(0, 3);
    const recommended = BeachService.localBeaches.slice(3, 6);

    return `
      <section class="hero">
        <div class="container">
          <h1 class="hero-title">Trova la tua spiaggia perfetta</h1>
          <p class="hero-subtitle">Esplora le acque più cristalline e le mete più ambite del 2025.</p>
          
          <div class="search-container">
            <input type="text" class="search-input" placeholder="Cerca 'Bali', 'Costa Smeralda', 'Varigotti'..." id="home-search-input">
            <button class="search-btn" id="home-search-btn">
              <i data-lucide="search"></i>
            </button>
          </div>
        </div>
      </section>

    <!-- EXPLORE SECTION -->
    <div class="container" style="margin-top: -2rem; position: relative; z-index: 10;">
       ${this.renderDestinations()}
    </div>

    <div class="container" style="padding-bottom: 4rem;">
       
       <!-- RECENTLY VIEWED -->
       ${this.state.recentBeaches.length > 0 ? `
           <div style="margin-top: 3rem; margin-bottom: 1.5rem; display:flex; align-items:center; gap:0.5rem;">
              <i data-lucide="clock" style="color:var(--text-muted);"></i>
              <h3 style="margin:0;">Visti di recente</h3>
           </div>
           
           <!-- Horizontal Scroll Container -->
           <div style="display: flex; gap: 1rem; overflow-x: auto; padding-bottom: 1rem; margin-left: -1rem; padding-left: 1rem; margin-right: -1rem; padding-right: 1rem; scroll-padding-left: 1rem;">
             ${this.state.recentBeaches.map(b => `
                <div class="card" onclick="window.App.selectBeach(decodeURIComponent('${encodeURIComponent(b.id)}'))" style="min-width: 280px; width: 280px; flex-shrink: 0; margin-bottom: 0;">
                    <div class="card-image-container" style="height: 160px; background: #e2e8f0; overflow:hidden;">
                        <img src="${b.preview}" alt="${b.name}" class="card-image" loading="lazy" 
                             style="width:100%; height:100%; object-fit:cover;"
                             onerror="this.onerror=null; this.src=window.BeachImageService.getImage('${b.name.replace(/'/g, "\\'")}')">
                    </div>
                    <div class="card-content">
                        <h3 class="card-title" style="font-size: 1.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${b.name}</h3>
                        <div class="card-meta">
                            <i data-lucide="map-pin" size="14"></i> <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${b.location}</span>
                        </div>
                    </div>
                </div>
             `).join('')}
           </div>
       ` : ''}

       <!-- Spiagge del Momento -->
       <div style="margin-top: 3rem; margin-bottom: 1.5rem; display:flex; align-items:center; gap:0.5rem;">
          <i data-lucide="trending-up" style="color:var(--secondary);"></i>
          <h3 style="margin:0;">Spiagge del momento</h3>
       </div>
       
       ${this.state.isLoadingHome ?
        `<div style="text-align:center; padding:2rem; color:var(--text-muted);"><i data-lucide="loader" class="spin"></i> Caricamento tendenze...</div>` :
        `<div class="beach-grid">
            ${this.state.trendingBeaches.map(b => this.renderCard(b)).join('')}
          </div>`
      }

       <!-- Le più famose al mondo -->
       <div style="margin-top: 3rem; margin-bottom: 1.5rem; display:flex; align-items:center; gap:0.5rem;">
          <i data-lucide="globe-2" style="color:var(--primary);"></i>
          <h3 style="margin:0;">Le più famose al mondo</h3>
       </div>
       
       ${this.state.isLoadingHome ?
        `<div style="text-align:center; padding:2rem; color:var(--text-muted);"><i data-lucide="loader" class="spin"></i> Caricamento top destinations...</div>` :
        `<div class="beach-grid">
            ${this.state.famousBeaches.map(b => this.renderCard(b)).join('')}
          </div>`
      }
    </div>
  `;
  },

  renderResults() {
    if (this.state.isSearching) {
      return `
        <div class="container" style="padding-top: 4rem; text-align: center;">
             <div style="display:inline-block; animation: spin 1s linear infinite;">
                <i data-lucide="loader-2" width="48" height="48" style="color: var(--primary);"></i>
             </div>
             <p style="margin-top: 1rem; color: var(--text-muted);">Cerco le spiagge migliori...</p>
             <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
        </div>
      `;
    }

    const regions = this.state.searchResults.filter(r => r.isRegion);
    const beaches = this.state.searchResults.filter(r => !r.isRegion);

    return `
      <div class="container" style="padding-top: 2rem;">
        <div style="margin-bottom: 2rem;">
            <button class="btn btn-ghost" onclick="window.App.navigateTo('home')" style="margin-bottom:1rem;"><i data-lucide="arrow-left"></i> Torna alla Home</button>
            <h2>Risultati per "${this.state.searchQuery}"</h2>
        </div>
        
        ${this.state.searchResults.length === 0 ? '<p>Nessun risultato trovato. Prova con un nome più generico.</p>' :
        `
          <!-- REGIONS HEADER -->
          ${regions.length > 0 ? regions.map(r => this.renderRegionCard(r)).join('') : ''}

          <!-- BEACHES GRID -->
          ${beaches.length > 0 ?
          `<div class="beach-grid">
                  ${beaches.map(b => this.renderCard(b)).join('')}
               </div>`
          : (regions.length > 0 ? '<p style="margin-top:2rem; color:var(--text-muted);">Nessuna spiaggia specifica trovata nel database per questa zona. Prova ad esplorare la mappa.</p>' : '')
        }
        `}
      </div>
    `;
  },

  renderRegionCard(region) {
    // Use the preview image if available, else a gradient
    const bgStyle = region.preview ?
      `background: linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url('${region.preview}') center/cover; color: white;` :
      `background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%); color: white;`;

    return `
      <div class="region-card" style="grid-column: 1 / -1; ${bgStyle} padding: 2rem; border-radius: var(--radius-lg); margin-bottom: 2rem; box-shadow: var(--shadow-md);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
             <div>
                 <span style="text-transform:uppercase; letter-spacing:1px; font-size:0.8rem; font-weight:700; opacity:0.9;">Regione / Area</span>
                 <h2 style="margin:0.5rem 0; font-size: 2rem;">${region.name}</h2>
                 <p style="opacity:0.9; margin:0;">${region.location || ''}</p>
             </div>
             <div>
                <button onclick='window.App.navigateTo("map-explorer", { mapRegion: ${JSON.stringify(region).replace(/'/g, "&#39;")} })' class="btn btn-primary" style="background: white; color: var(--primary); border:none;">
                   <i data-lucide="map"></i> Esplora Spiagge su Mappa
                </button>
             </div>
          </div>
      </div>
      `;
  },

  renderCard(beach) {
    const safeId = encodeURIComponent(beach.id); // URLEncode key to be safe in function arguments
    return `
      <div class="card" onclick="window.App.selectBeach(decodeURIComponent('${safeId}'))">
        <div class="card-image-container" style="height:200px; background: #e2e8f0; overflow:hidden;">
            <img src="${beach.preview}" 
                 alt="${beach.name}" 
                 class="card-image"
                 onerror="this.onerror=null; this.src=window.BeachImageService.getImage('${beach.name.replace(/'/g, "\\'")}')">
        </div>
        <div class="card-content">
          <h3 class="card-title" style="font-size:1.1rem;">${beach.name}</h3>
          <div class="card-meta">
            <i data-lucide="map-pin" size="14"></i> ${beach.location}
          </div>
        </div>
      </div>
    `;
  },



  // --- EVENTS & LOGIC ---

  attachEvents() {
    const input = document.getElementById('home-search-input');
    const btn = document.getElementById('home-search-btn');

    if (input && btn) {
      const handleSearch = async (forcedQuery, location = null, countryCode = null) => {
        const query = forcedQuery || input.value.trim();
        if (!query) return;

        // CRITICAL FIX: The Autocomplete widget might still be processing events (like 'Enter' or 'click').
        // If we destroy the DOM immediately (navigateTo -> render), Google Maps JS crashes ('Script Error').
        // We add a small delay to let the event loop clear.

        // Show loading state on button immediately for feedback
        if (btn) btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';

        setTimeout(async () => {
          this.navigateTo('results', { isSearching: true, searchQuery: query });
          const results = await BeachService.search(query, location, countryCode);
          this.navigateTo('results', { isSearching: false, searchQuery: query, searchResults: results });
        }, 100);
      };

      this.handleSearch = handleSearch; // Expose for Autocomplete

      btn.onclick = () => handleSearch();
      input.onkeypress = (e) => {
        if (e.key === 'Enter') {
          // If autocomplete is active, it might trigger its own search.
          // We rely on the 100ms delay to debounce/handle this gracefully.
          handleSearch();
        }
      };
    }
  },

  // --- GALLERY HELPERS ---

  setGalleryImage(index) {
    const b = this.state.selectedBeach;
    if (!b || !b.gallery) return;

    // Wrap index
    if (index < 0) index = b.gallery.length - 1;
    if (index >= b.gallery.length) index = 0;

    this.state.currentGalleryIndex = index;

    // Update Hero
    const hero = document.getElementById('gallery-hero-img');
    if (hero) {
      hero.style.opacity = '0.5';
      setTimeout(() => {
        hero.src = b.gallery[index];
        hero.style.opacity = '1';
      }, 150);
    }

    // Update Thumbnails active state
    document.querySelectorAll('.gallery-thumbnail').forEach((el, i) => {
      if (i === index) el.classList.add('active');
      else el.classList.remove('active');
    });
  },

  nextImage(direction) {
    const current = this.state.currentGalleryIndex || 0;
    this.setGalleryImage(current + direction);
  },

  toggleDay(index) {
    if (this.state.expandedDayIndex === index) {
      this.state.expandedDayIndex = null;
    } else {
      this.state.expandedDayIndex = index;
    }
    this.render();
    lucide.createIcons();
    if (this.state.selectedBeach) {
      this.initMap(this.state.selectedBeach);
    }
  },

  async selectBeach(id) {
    const beach = BeachService.getById(id);
    if (beach) {
      console.log("Selected Beach:", beach);
      this.state.selectedBeach = beach;
      this.state.weatherData = null; // Reset weather while loading

      // SAVE TO RECENT HISTORY
      this.addToHistory(beach);

      // DYNAMIC GALLERY FIX FOR LOCAL BEACHES
      // If gallery is empty or just has the preview (length 1), try fetching more
      if (!beach.gallery || beach.gallery.length <= 1) {
        console.log("Fetching dynamic photos for local beach:", beach.name);
        try {
          const photos = await BeachService.getPhotos(beach.name);
          if (photos && photos.length > 0) {
            console.log("Dynamic photos fetched:", photos.length, beach.id, this.state.selectedBeach.id);
            beach.gallery = photos; // Update the beach object in memory
            this.state.selectedBeach = beach; // Force update state ref

            // Re-render if we are still on the detail view to show the new photos
            // Use loose comparison just in case
            if (this.state.view === 'detail' && String(this.state.selectedBeach.id) === String(beach.id)) {
              console.log("Forcing re-render for new photos");
              this.render();
              lucide.createIcons();
            } else {
              console.warn("Not re-rendering: view mismatch", this.state.view, this.state.selectedBeach.id, beach.id);
            }
          }
        } catch (e) { console.warn("Could not fetch dynamic photos", e); }
      }

      this.navigateTo('detail'); // Navigate immediately, weather loads async
      this.fetchWeatherForSelected(beach);
    }
  },

  addToHistory(beach) {
    // Remove if already exists (to push to top)
    let list = this.state.recentBeaches.filter(b => String(b.id) !== String(beach.id));
    // Add to front
    list.unshift({
      id: beach.id,
      name: beach.name,
      location: beach.location,
      preview: beach.preview
    });
    // Limit to 10
    list = list.slice(0, 10);

    this.state.recentBeaches = list;
    localStorage.setItem('recentBeaches', JSON.stringify(list));
  },

  async fetchWeatherForSelected(beach) {
    // 1. Reset State
    this.state.weatherData = undefined;
    this.state.weatherError = null;
    this.state.currentGalleryIndex = 0; // Reset gallery
    this.state.expandedDayIndex = null; // Reset weather expansion

    // 2. ASYNC: Google Photos Update (Instead of Flickr)
    const photoPromise = (async () => {
      if (!window.google) return;

      // Only fetch if we have a valid Google Place ID (doesn't start with 'trend', 'rec', 'osm', 'world')
      const isGooglePlace = !beach.id.toString().startsWith('trend') &&
        !beach.id.toString().startsWith('rec') &&
        !beach.id.toString().startsWith('osm') &&
        !beach.id.toString().startsWith('world');

      if (isGooglePlace) {
        console.log("Fetching photos for Google Place:", beach.id);
        const service = new google.maps.places.PlacesService(document.createElement('div'));

        service.getDetails({
          placeId: beach.id,
          fields: ['photos']
        }, (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place.photos) {
            const newPhotos = place.photos.slice(0, 10).map(p => p.getUrl({ maxWidth: 1600 })); // High Res

            if (newPhotos.length > 0) {
              beach.gallery = newPhotos;
              beach.preview = newPhotos[0]; // Update main preview too

              // Re-render if still looking at this beach
              if (this.state.view === 'detail' && this.state.selectedBeach.id === beach.id) {
                this.render();
                lucide.createIcons();
                this.initMap(beach);
              }
            }
          } else {
            console.warn("Google Photos fetch failed or empty", status);
          }
        });
      } else {
        console.log("DEBUG: Not a Google Place ID, skipping photo fetch", beach.id);
      }
    })();

    // 3. ASYNC: Weather Update
    const weatherPromise = (async () => {
      try {
        const weather = await WeatherService.getWeather(beach.lat, beach.lng);
        if (!weather) throw new Error("WeatherService returned null/undefined");

        this.state.weatherData = weather;
        this.state.weatherError = null;
      } catch (e) {
        console.error("App: Weather update failed", e);
        this.state.weatherData = null;
        this.state.weatherError = e.message;
      }
      if (this.state.view === 'detail' && this.state.selectedBeach.id === beach.id) {
        this.render();
        lucide.createIcons();
        this.initMap(beach);
      }
    })();

    // Initial Map
    setTimeout(() => {
      lucide.createIcons();
      this.initMap(beach);
    }, 50);
  },

  initMap(beach) {
    if (!window.google) return;

    setTimeout(() => {
      const mapEl = document.getElementById('map');
      if (!mapEl) return;

      // No need to remove map instance with Google Maps, just overwrite or let GC handle
      // if (this.currentMap) this.currentMap.remove(); // Not valid for Google Maps

      const map = new google.maps.Map(mapEl, {
        center: { lat: parseFloat(beach.lat), lng: parseFloat(beach.lng) },
        zoom: 15,
        mapTypeId: 'satellite',
        disableDefaultUI: true,
        zoomControl: true
      });

      new google.maps.Marker({
        position: { lat: parseFloat(beach.lat), lng: parseFloat(beach.lng) },
        map: map,
        title: beach.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#ea580c",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        }
      });
    }, 100);
  },

  renderDetail() {
    const b = this.state.selectedBeach;
    const w = this.state.weatherData;

    if (!b) return '<div class="container" style="padding-top:2rem">Caricamento...</div>';

    // Ensure gallery exists
    const galleryImages = b.gallery && b.gallery.length ? b.gallery : [b.preview];

    const currentIdx = this.state.currentGalleryIndex || 0;
    const heroImage = galleryImages[currentIdx] || b.preview;

    // --- RENDER HELPERS ---

    // Hourly
    const renderHourly = () => {
      if (!w || !w.hourly) return '';
      const currentHour = new Date().getHours();
      const nextHoursIndices = w.hourly.time
        .map((t, i) => ({ t, i, h: new Date(t).getHours() }))
        .filter(obj => obj.h >= currentHour)
        .slice(0, 6);

      if (nextHoursIndices.length === 0) return '';

      return `
             <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.2);">
               <h4 style="margin-bottom:1rem; opacity:0.9; font-size:1rem;">Prossime Ore</h4>
               <div style="display:flex; flex-direction:column; gap:0.5rem;">
                 ${nextHoursIndices.map(obj => {
        const i = obj.i;
        const code = w.hourly.weather_code[i];
        const temp = Math.round(w.hourly.temperature_2m[i]);
        const wind = Math.round(w.hourly.wind_speed_10m[i]);
        const hour = obj.h.toString().padStart(2, '0');
        return `
                      <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.8rem; background:rgba(255,255,255,0.1); border-radius:0.5rem;">
                         <div style="font-weight:600; width:50px;">${hour}:00</div>
                         <div style="flex:1; display:flex; align-items:center; gap:0.5rem;">
                           <span style="font-size:1.2rem;">${WeatherService.getWeatherLabel(code).includes('Pioggia') ? '🌧️' :
            WeatherService.getWeatherLabel(code).includes('Sole') || code === 0 ? '☀️' : '☁️'}</span>
                           <span style="font-size:0.9rem; opacity:0.9;">${WeatherService.getWeatherLabel(code)}</span>
                         </div>
                         <div style="display:flex; gap: 1rem; align-items:center;">
                            <div style="opacity:0.8; font-size:0.8rem;">${wind} km/h</div>
                            <div style="font-weight:700;">${temp}°</div>
                         </div>
                      </div>
                    `;
      }).join('')}
               </div>
             </div>
      `;
    };

    // Daily
    const renderDaily = () => {
      if (!w || !w.daily) return '';
      return `
             <div class="weather-widget" style="background: linear-gradient(135deg, #64748b, #475569);">
               <h4 style="margin-bottom:1rem; opacity:0.9;">Prossimi Giorni</h4>
               <div style="display:flex; flex-direction:column; gap:0.5rem;">
                 ${w.daily.time.slice(1, 6).map((t, i) => {
        const idx = i + 1; // skip today
        // Safety check
        if (!w.daily.weather_code[idx]) return '';

        const code = w.daily.weather_code[idx];
        const min = Math.round(w.daily.temperature_2m_min[idx]);
        const max = Math.round(w.daily.temperature_2m_max[idx]);
        const dayName = new Date(t).toLocaleDateString('it-IT', { weekday: 'long' });

        return `
                      <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.8rem; background:rgba(255,255,255,0.1); border-bottom:1px solid rgba(255,255,255,0.1); border-radius: 0.5rem;">
                         <div style="text-transform:capitalize; width: 100px; font-weight:500;">${dayName}</div>
                         <div style="flex:1; text-align:center; opacity:0.9; font-size:0.9rem;">${WeatherService.getWeatherLabel(code)}</div>
                         <div style="font-weight:700; width:80px; text-align:right;">${min}° / ${max}°</div>
                      </div>
                    `;
      }).join('')}
               </div>
             </div>
      `;
    };

    // Main Template - SIMPLIFIED
    return `
      <div class="container">
        <div class="detail-layout">
          <div>
            <div style="margin-bottom:1rem;"><button class="btn btn-ghost" onclick="window.App.goBack()"><i data-lucide="arrow-left"></i> Indietro</button></div>
            
            <!-- HERO GRID SPLIT -->
            <div class="hero-grid-split">
                <!-- COL 1: PHOTO -->
                <div>
                   <img src="${heroImage}" 
                     class="gallery-hero" 
                     id="gallery-hero-img"
                     style="margin-bottom:0;"
                     alt="${b.name}"
                     onerror="this.onerror=null; this.src=window.BeachImageService.getImage('${b.name.replace(/'/g, "\\'")}')">
                   
                   <!-- THUMBNAILS -->
                   <div style="display:flex; gap:0.5rem; overflow-x:auto; margin-top:0.5rem; padding-bottom:0.5rem;">
                      ${galleryImages.map((src, i) => `
                        <img src="${src}" class="gallery-thumbnail ${i === currentIdx ? 'active' : ''}" 
                             onclick="window.App.setGalleryImage(${i})"
                             style="width:60px; height:60px; border-radius:4px; object-fit:cover; cursor:pointer; flex-shrink:0;">
                      `).join('')}
                   </div>
                </div>
                
                <!-- COL 2: MAP -->
                <div>
                    <div id="map" class="map-container" style="margin-top:0; height: 300px;"></div>
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}" target="_blank" class="btn btn-primary" style="margin-top: 1rem; width:100%; justify-content:center;">
                      <i data-lucide="navigation"></i> Portami Qui (Google Maps)
                    </a>
                </div>
            </div>

            <h1>${b.name}</h1>
            <div style="display:flex; align-items:center; gap:0.5rem; color:var(--text-muted); margin-bottom: 2rem;">
               <i data-lucide="map-pin"></i> ${b.location}
            </div>
            
            ${(() => {
        if (w === null) {
          return `
                       <div class="weather-widget" style="background: linear-gradient(135deg, #64748b, #475569);">
                          <div style="padding: 2rem; text-align:center; color: #ef4444; border: 2px dashed red;">
                             <i data-lucide="cloud-off" style="margin-bottom:0.5rem;"></i>
                             <p style="font-weight:bold; font-size:1.2rem;">ERRORE METEO</p>
                             <p>${this.state.weatherError || "Nessun dettaglio errore"}</p>
                          </div>
                       </div>`;
        }
        if (!w) {
          return `
                       <div class="weather-widget" style="background: linear-gradient(135deg, #64748b, #475569);">
                          <div style="padding: 2rem; text-align:center; opacity:0.6;">
                             <i data-lucide="loader" class="spin"></i> Caricamento meteo...
                          </div>
                       </div>`;
        }

        const scoreData = WeatherService.calculateBeachScore(w);
        const color = scoreData.raw >= 4 ? '#22c55e' : scoreData.raw >= 2.5 ? '#eab308' : '#ef4444';

        return `
                  <div class="score-card">
                     <div style="position:relative; z-index:1;">
                         <h3 style="margin:0; font-size:1.2rem; color:white; font-weight:700;">Beach Score</h3>
                         <div class="sea-badge ${scoreData.css}">${scoreData.sea}</div>
                     </div>
                     <div class="score-circle" style="color:${color};">
                         ${scoreData.score}
                     </div>
                  </div>

                  <div class="weather-row">
                     <div class="weather-widget" style="margin-bottom:0;">
                         <div style="display:flex; align-items:center; gap: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.2);">
                              <div style="font-size: 4rem; font-weight: 700; line-height: 1;">${Math.round(w.current.temperature_2m)}°</div>
                              <div>
                                   <div style="font-size: 1.25rem; font-weight: 500;">${WeatherService.getWeatherLabel(w.current.weather_code)}</div>
                              </div>
                         </div>
                         ${renderHourly()}
                     </div>
                     ${renderDaily()}
                  </div>
                `;
      })()} 
          </div>
        </div>
      </div>
    `;
  }
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
  App.init();

  // Production Build - No Badge
});
