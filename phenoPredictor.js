function declination(dayOfYear) {
    return 23.45 * Math.sin(2 * Math.PI * (284 + dayOfYear) / 365);
}

function posPart(x) {
    return Math.max(x, 0);
}

function eq(doy, lat = 49) {
    const latRad = lat * Math.PI / 180;
    const declRad = declination(doy) * Math.PI / 180;

    const cosHourAngle = -Math.tan(latRad) * Math.tan(declRad);
    const clampedCos = Math.max(-1, Math.min(1, cosHourAngle));

    const daylength = (2 * (24 / (2 * Math.PI)) * Math.acos(clampedCos)) - (0.1 * lat + 5);
    return daylength;
}

function trapz(x, y) {
    let sum = 0;
    for (let i = 0; i < x.length - 1; i++) {
        sum += (x[i + 1] - x[i]) * (y[i] + y[i + 1]) / 2;
    }
    return sum;
}

function singlesi(doy, lat) {
    const daysToDoy = Array.from({length: doy}, (_, i) => i + 1);
    const daysFullYear = Array.from({length: 365}, (_, i) => i + 1);

    const numeratorY = daysToDoy.map(d => posPart(eq(d, lat)));
    const denominatorY = daysFullYear.map(d => posPart(eq(d, lat)));

    const numerator = trapz(daysToDoy, numeratorY);
    const denominator = trapz(daysFullYear, denominatorY);

    return numerator / denominator;
}

function calculateSeasind(date, latitude) {
    const startOfYear = new Date(date.getFullYear(), 0, 0);
    const diff = date - startOfYear;
    const oneDay = 1000 * 60 * 60 * 24;
    const doy = Math.floor(diff / oneDay);

    return singlesi(doy, latitude);
}

function findDoyFromSeasind(targetSeasind, latitude) {
    for (let doy = 1; doy <= 365; doy++) {
        const si = singlesi(doy, latitude);
        if (si >= targetSeasind) {
            return doy;
        }
    }
    return 365;
}

function doyToDate(doy, year = 2023) {
    const date = new Date(year, 0);
    date.setDate(doy);
    return date;
}

function formatDate(date) {
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

async function fetchInatObservations(params, maxPages = 1) {
    const baseUrl = 'https://api.inaturalist.org/v1/observations';
    const allResults = [];
    let page = 1;
    let totalResults = 0;

    const urlParams = new URLSearchParams(params);
    urlParams.set('per_page', '200');

    while (page <= maxPages) {
        urlParams.set('page', page);
        const url = `${baseUrl}?${urlParams.toString()}`;

        try {
            const response = await fetch(url);
            const data = await response.json();

            if (page === 1) {
                totalResults = data.total_results;
            }

            if (!data.results || data.results.length === 0) {
                break;
            }

            allResults.push(...data.results);

            if (data.results.length < 200) {
                break;
            }

            page++;
        } catch (error) {
            console.error('Error fetching observations:', error);
            break;
        }
    }

    return {
        results: allResults,
        totalResults: totalResults,
        fetchedPages: page - 1
    };
}

function processObservations(rawObservations) {
    const processed = [];

    for (const obs of rawObservations) {
        if (!obs.location || !obs.observed_on) continue;

        const [lat, lon] = obs.location.split(',').map(parseFloat);
        const date = new Date(obs.observed_on);
        const doy = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
        const seasind = calculateSeasind(date, lat);

        processed.push({
            id: obs.id,
            date: date,
            doy: doy,
            latitude: lat,
            longitude: lon,
            seasind: seasind,
            taxonName: obs.taxon?.name || 'Unknown'
        });
    }

    return processed;
}

function summarizeObservations(observations) {
    if (observations.length === 0) {
        return null;
    }

    const doys = observations.map(o => o.doy);
    const lats = observations.map(o => o.latitude);
    const lons = observations.map(o => o.longitude);
    const seasinds = observations.map(o => o.seasind);

    return {
        count: observations.length,
        doy: {
            min: Math.min(...doys),
            max: Math.max(...doys),
            mean: doys.reduce((a, b) => a + b, 0) / doys.length
        },
        latitude: {
            min: Math.min(...lats),
            max: Math.max(...lats),
            mean: lats.reduce((a, b) => a + b, 0) / lats.length
        },
        longitude: {
            min: Math.min(...lons),
            max: Math.max(...lons),
            mean: lons.reduce((a, b) => a + b, 0) / lons.length
        },
        seasind: {
            min: Math.min(...seasinds),
            max: Math.max(...seasinds),
            mean: seasinds.reduce((a, b) => a + b, 0) / seasinds.length,
            std: Math.sqrt(seasinds.reduce((sq, n) => sq + Math.pow(n - (seasinds.reduce((a, b) => a + b, 0) / seasinds.length), 2), 0) / seasinds.length)
        }
    };
}

function predictPhenologyDates(observations, targetLatitude, thresholdMethod = 'minmax', stdevMultiplier = 1.64) {
    const summary = summarizeObservations(observations);
    if (!summary) return null;

    let minSeasind, maxSeasind;

    if (observations.length < 10 || thresholdMethod === 'minmax') {
        minSeasind = summary.seasind.min;
        maxSeasind = summary.seasind.max;
    } else {
        minSeasind = Math.max(0, summary.seasind.mean - (stdevMultiplier * summary.seasind.std));
        maxSeasind = Math.min(1, summary.seasind.mean + (stdevMultiplier * summary.seasind.std));
    }

    const startDoy = findDoyFromSeasind(minSeasind, targetLatitude);
    const endDoy = findDoyFromSeasind(maxSeasind, targetLatitude);

    const startDate = doyToDate(startDoy);
    const endDate = doyToDate(endDoy);

    return {
        targetLatitude: targetLatitude,
        minSeasind: minSeasind,
        maxSeasind: maxSeasind,
        startDoy: startDoy,
        endDoy: endDoy,
        startDate: startDate,
        endDate: endDate,
        sampleSize: observations.length,
        thresholdMethod: thresholdMethod
    };
}
        let currentObservations = [];
        let currentParams = {};
        let totalResults = 0;
        let comparisonMode = false;
        let url1Params = null;
        let url2Params = null;

        // Check if we were passed URLs from URLgen
        window.addEventListener('DOMContentLoaded', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const url1 = urlParams.get('url1');
            const url2 = urlParams.get('url2');

            console.log('URL1:', url1);
            console.log('URL2:', url2);

            if (url1) {
                if (url2) {
                    // Comparison mode
                    comparisonMode = true;
                    document.getElementById('singleUrlMode').style.display = 'none';
                    document.getElementById('comparisonUrlMode').style.display = 'block';

                    // Set textareas
                    const textarea1 = document.getElementById('inatUrl1');
                    const textarea2 = document.getElementById('inatUrl2');

                    if (textarea1 && textarea2) {
                        textarea1.value = url1;
                        textarea2.value = url2;
                        console.log('Set textarea1 to:', textarea1.value);
                        console.log('Set textarea2 to:', textarea2.value);
                    } else {
                        console.error('Textareas not found!', textarea1, textarea2);
                    }

                    document.getElementById('queryTitle').textContent = 'Phenophase Transition Analysis';
                } else {
                    // Single URL mode
                    document.getElementById('inatUrl').value = url1;
                }
            }
        });

        function openUrlGen() {
            window.open('URLgen.html', '_blank');
        }

        document.getElementById('openUrlGenLink').addEventListener('click', (e) => {
            e.preventDefault();
            openUrlGen();
        });

        document.getElementById('openUrlGenButton').addEventListener('click', (e) => {
            e.preventDefault();
            openUrlGen();
        });

        document.getElementById('fetchButton').addEventListener('click', fetchObservations);

        function showStatus(message, type = 'info') {
            const statusDiv = document.getElementById('status');
            statusDiv.textContent = message;
            statusDiv.className = type;
        }

        function parseInatUrl(url) {
            try {
                const urlObj = new URL(url);
                const params = {};

                for (const [key, value] of urlObj.searchParams) {
                    params[key] = value;
                }

                return params;
            } catch (error) {
                showStatus('Invalid URL format. Please check the URL and try again.', 'error');
                return null;
            }
        }

        async function fetchObservations() {
            showStatus('Fetching observations from iNaturalist...', 'info');
            document.getElementById('fetchButton').disabled = true;
            document.getElementById('summary').style.display = 'none';
            document.getElementById('paginationWarning').style.display = 'none';

            let params;

            if (comparisonMode) {
                const url1Input = document.getElementById('inatUrl1').value.trim();
                const url2Input = document.getElementById('inatUrl2').value.trim();

                if (!url1Input || !url2Input) {
                    showStatus('Please enter both URLs for comparison mode', 'warning');
                    document.getElementById('fetchButton').disabled = false;
                    return;
                }

                url1Params = parseInatUrl(url1Input);
                url2Params = parseInatUrl(url2Input);

                if (!url1Params || !url2Params) {
                    document.getElementById('fetchButton').disabled = false;
                    return;
                }

                showStatus('Comparison mode: Fetching both URL datasets separately (not yet implemented - showing URL 1 for now)', 'warning');
                params = url1Params; // For now, just show first URL
            } else {
                const urlInput = document.getElementById('inatUrl').value.trim();

                if (!urlInput) {
                    showStatus('Please enter an iNaturalist URL', 'warning');
                    document.getElementById('fetchButton').disabled = false;
                    return;
                }

                params = parseInatUrl(urlInput);
                if (!params) {
                    document.getElementById('fetchButton').disabled = false;
                    return;
                }
            }

            currentParams = params;

            try {
                const data = await fetchInatObservations(params, 1);
                totalResults = data.totalResults;

                showStatus(`Fetched ${data.results.length} observations`, 'success');

                if (data.results.length === 0) {
                    showStatus('No observations found. Try adjusting your parameters.', 'warning');
                    document.getElementById('fetchButton').disabled = false;
                    return;
                }

                const processed = processObservations(data.results);
                currentObservations = processed;

                if (totalResults > 200) {
                    document.getElementById('totalCount').textContent = totalResults;
                    document.getElementById('paginationWarning').style.display = 'block';
                } else {
                    displayResults(processed);
                }

            } catch (error) {
                showStatus('Error fetching observations: ' + error.message, 'error');
            }

            document.getElementById('fetchButton').disabled = false;
        }

        async function fetchAllPages() {
            showStatus('Fetching all pages... This may take a while.', 'info');
            document.getElementById('paginationWarning').style.display = 'none';

            const maxPages = Math.ceil(totalResults / 200);

            try {
                const data = await fetchInatObservations(currentParams, maxPages);
                const processed = processObservations(data.results);
                currentObservations = processed;

                showStatus(`Fetched all ${processed.length} observations`, 'success');
                displayResults(processed);

            } catch (error) {
                showStatus('Error fetching all pages: ' + error.message, 'error');
            }
        }

        function useCurrentData() {
            document.getElementById('paginationWarning').style.display = 'none';
            displayResults(currentObservations);
        }

        function refineParameters() {
            document.getElementById('paginationWarning').style.display = 'none';
            showStatus('Please adjust your parameters and try again.', 'info');
        }

        function displayResults(observations) {
            const summary = summarizeObservations(observations);
            if (!summary) {
                showStatus('No valid observations to analyze.', 'warning');
                return;
            }

            const summaryDiv = document.getElementById('summary');
            summaryDiv.style.display = 'block';

            const minDate = doyToDate(summary.doy.min);
            const maxDate = doyToDate(summary.doy.max);

            summaryDiv.innerHTML = `
                <h2>Observation Summary</h2>
                <div class="summary-grid">
                    <div class="summary-card">
                        <h3>Total Observations</h3>
                        <div class="value">${summary.count}</div>
                    </div>
                    <div class="summary-card">
                        <h3>Day of Year Range</h3>
                        <div class="value">${summary.doy.min} - ${summary.doy.max}</div>
                        <div class="subvalue">${formatDate(minDate)} to ${formatDate(maxDate)}</div>
                    </div>
                    <div class="summary-card">
                        <h3>Latitude Range</h3>
                        <div class="value">${summary.latitude.min.toFixed(2)}° - ${summary.latitude.max.toFixed(2)}°</div>
                        <div class="subvalue">Mean: ${summary.latitude.mean.toFixed(2)}°</div>
                    </div>
                    <div class="summary-card">
                        <h3>Longitude Range</h3>
                        <div class="value">${summary.longitude.min.toFixed(2)}° - ${summary.longitude.max.toFixed(2)}°</div>
                        <div class="subvalue">Mean: ${summary.longitude.mean.toFixed(2)}°</div>
                    </div>
                    <div class="summary-card">
                        <h3>Season Index Range</h3>
                        <div class="value">${summary.seasind.min.toFixed(4)} - ${summary.seasind.max.toFixed(4)}</div>
                        <div class="subvalue">Mean: ${summary.seasind.mean.toFixed(4)} ± ${summary.seasind.std.toFixed(4)}</div>
                    </div>
                </div>

                <div class="prediction-section">
                    <h2>Phenology Predictions by Latitude</h2>
                    <p>Using ${summary.count < 10 ? 'min/max' : 'mean ± 1.64 SD'} threshold method</p>
                    <table>
                        <thead>
                            <tr>
                                <th>Latitude</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>DOY Range</th>
                                <th>Season Index Range</th>
                            </tr>
                        </thead>
                        <tbody id="predictionTable">
                        </tbody>
                    </table>
                </div>
            `;

            const predictionTable = document.getElementById('predictionTable');
            const thresholdMethod = summary.count < 10 ? 'minmax' : 'stdev';

            for (let lat = 25; lat <= 50; lat += 5) {
                const prediction = predictPhenologyDates(observations, lat, thresholdMethod);
                if (prediction) {
                    const row = predictionTable.insertRow();
                    row.innerHTML = `
                        <td>${prediction.targetLatitude}°N</td>
                        <td>${formatDate(prediction.startDate)}</td>
                        <td>${formatDate(prediction.endDate)}</td>
                        <td>${prediction.startDoy} - ${prediction.endDoy}</td>
                        <td>${prediction.minSeasind.toFixed(4)} - ${prediction.maxSeasind.toFixed(4)}</td>
                    `;
                }
            }
        }
