// Global Application State
let state = {
    releases: [],
    selectedId: null,
    activeCategory: 'all',
    searchQuery: '',
    filteredReleases: [] // Cache currently visible items for CSV export
};

// DOM Elements
const DOM = {
    refreshBtn: document.getElementById('refresh-btn'),
    refreshSpinner: document.getElementById('refresh-spinner'),
    searchInput: document.getElementById('search-input'),
    categoryFilters: document.getElementById('category-filters'),
    releasesList: document.getElementById('releases-list'),
    updateCount: document.getElementById('update-count'),
    exportCsvBtn: document.getElementById('export-csv-btn'), // Export CSV button
    
    // Detail Pane
    detailPane: document.getElementById('detail-pane'),
    emptyState: document.getElementById('detail-empty-state'),
    contentState: document.getElementById('detail-content'),
    detailDate: document.getElementById('detail-date'),
    detailBadge: document.getElementById('detail-badge'),
    detailTitle: document.getElementById('detail-title'),
    detailBody: document.getElementById('detail-body'),
    detailLink: document.getElementById('detail-link'),
    
    // Tweet Composer
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCounter: document.getElementById('char-counter'),
    tweetBtn: document.getElementById('tweet-btn'),
    toastContainer: document.getElementById('toast-container')
};


// -------------------------------------------------------------
// EVENT LISTENERS & INITS
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // Fetch initial feed data
    fetchReleases();

    // Refresh button event
    DOM.refreshBtn.addEventListener('click', () => {
        fetchReleases(true);
    });

    // Search input typing event
    DOM.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase().trim();
        filterAndRender();
    });

    // Category button filters event
    DOM.categoryFilters.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;

        // Toggle active button style
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        state.activeCategory = btn.dataset.category;
        filterAndRender();
    });

    // Tweet textarea live counter
    DOM.tweetTextarea.addEventListener('input', () => {
        updateCharCount();
    });

    // Tweet execution
    DOM.tweetBtn.addEventListener('click', () => {
        shareOnTwitter();
    });

    // Export CSV click event
    DOM.exportCsvBtn.addEventListener('click', () => {
        exportToCSV();
    });
}


// -------------------------------------------------------------
// API CLIENT
// -------------------------------------------------------------
async function fetchReleases(forceRefresh = false) {
    toggleLoading(true);
    const endpoint = forceRefresh ? '/api/releases?refresh=true' : '/api/releases';

    try {
        const response = await fetch(endpoint);
        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }

        state.releases = data.updates || [];
        showToast('Successfully updated releases feed!', 'success');
        
        // Render data
        filterAndRender();

        // Auto-select the first release card if none is active or if we forced refresh
        if (state.releases.length > 0) {
            selectRelease(state.releases[0].id);
        }

    } catch (error) {
        console.error("Fetch Error:", error);
        showToast(`Error updating feed: ${error.message}`, 'error');
        renderErrorState(error.message);
    } finally {
        toggleLoading(false);
    }
}

// -------------------------------------------------------------
// UI RENDERERS
// -------------------------------------------------------------
function toggleLoading(isLoading) {
    if (isLoading) {
        DOM.refreshBtn.classList.add('loading');
        DOM.refreshBtn.disabled = true;
        
        // Show skeleton loading animations in list
        DOM.releasesList.innerHTML = `
            <div class="loading-skeleton">
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
            </div>
        `;
        DOM.updateCount.textContent = 'Loading...';
    } else {
        DOM.refreshBtn.classList.remove('loading');
        DOM.refreshBtn.disabled = false;
    }
}

function renderErrorState(message) {
    DOM.releasesList.innerHTML = `
        <div class="detail-empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="empty-illustration" style="color: var(--badge-deprecated-text)">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <h3>Feed Fetch Failed</h3>
            <p>${message}</p>
            <button class="btn btn-primary" onclick="fetchReleases(true)" style="margin-top: 1rem;">Retry</button>
        </div>
    `;
    DOM.updateCount.textContent = 'Error';
    DOM.emptyState.classList.remove('hidden');
    DOM.contentState.classList.add('hidden');
}

function filterAndRender() {
    // Filter the releases
    const filtered = state.releases.filter(item => {
        const matchesCategory = state.activeCategory === 'all' || item.type === state.activeCategory;
        
        // Simple full text search
        const plainText = stripHtml(item.content).toLowerCase();
        const matchesSearch = item.date.toLowerCase().includes(state.searchQuery) ||
                              item.type.toLowerCase().includes(state.searchQuery) ||
                              plainText.includes(state.searchQuery);
                              
        return matchesCategory && matchesSearch;
    });

    // Cache the visible filtered records for CSV exports
    state.filteredReleases = filtered;
    DOM.updateCount.textContent = `${filtered.length} items`;

    if (filtered.length === 0) {
        DOM.releasesList.innerHTML = `
            <div class="detail-empty-state" style="padding: 2rem 1rem;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="empty-illustration">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <h3>No Updates Found</h3>
                <p>Try clearing your search query or selecting a different category filter.</p>
            </div>
        `;
        return;
    }

    // Generate list HTML with Clipboard Copy button inside card headers
    DOM.releasesList.innerHTML = filtered.map(item => {
        const snippet = makeExcerpt(item.content);
        const isActive = item.id === state.selectedId ? 'active' : '';
        
        return `
            <div class="release-card ${item.type} ${isActive}" data-id="${item.id}" tabindex="0" role="button">
                <div class="card-meta">
                    <span class="card-date">${item.date}</span>
                    <div class="card-meta-right">
                        <button class="copy-card-btn" data-id="${item.id}" title="Copy description to clipboard" aria-label="Copy description">
                            <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M16 4H18C18.5304 4 19.0391 4.21071 19.4142 4.58579C19.7893 4.96086 20 5.46957 20 6V20C20 20.5304 19.7893 21.0391 19.4142 21.4142C19.0391 21.7893 18.5304 22 18 22H6C5.46957 22 4.96086 21.7893 4.58579 21.4142C4.21071 21.0391 4 20.5304 4 20V6C4 5.46957 4.21071 4.96086 4.58579 4.58579C4.96086 4.21071 5.46957 4 6 4H8"/>
                                <rect x="8" y="2" width="8" height="4" rx="1"/>
                            </svg>
                            <svg class="check-icon hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20 6L9 17L4 12"/>
                            </svg>
                        </button>
                        <span class="badge ${item.type}">${item.type}</span>
                    </div>
                </div>
                <div class="card-excerpt">${snippet}</div>
            </div>
        `;
    }).join('');

    // Attach click events to the cards
    document.querySelectorAll('.release-card').forEach(card => {
        card.addEventListener('click', () => {
            selectRelease(card.dataset.id);
        });
        // Accessibility press Enter to select
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectRelease(card.dataset.id);
            }
        });
    });

    // Attach click events to copy buttons inside cards
    document.querySelectorAll('.copy-card-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop click from bubbling up and selecting card
            copyCardContent(btn);
        });
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation(); // Stop enter/space selection bubbling
            }
        });
    });
}


// -------------------------------------------------------------
// DETAIL PANE LOGIC
// -------------------------------------------------------------
function selectRelease(id) {
    const release = state.releases.find(item => item.id === id);
    if (!release) return;

    state.selectedId = id;

    // Update active highlight classes in the sidebar DOM
    document.querySelectorAll('.release-card').forEach(card => {
        if (card.dataset.id === id) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });

    // Populate detail panels
    DOM.detailDate.textContent = release.date;
    
    // Style and populate Badge
    DOM.detailBadge.className = `badge ${release.type}`;
    DOM.detailBadge.textContent = release.type;
    
    DOM.detailTitle.textContent = `${release.type} Update`;
    DOM.detailBody.innerHTML = release.content;
    DOM.detailLink.href = release.link;

    // Compose custom tweet
    prepareTweet(release);

    // Show panel
    DOM.emptyState.classList.add('hidden');
    DOM.contentState.classList.remove('hidden');

    // Scroll details to top smoothly
    DOM.detailPane.querySelector('.detail-content').scrollTo({ top: 0, behavior: 'smooth' });
}

// -------------------------------------------------------------
// TWEET COMPOSER SYSTEM
// -------------------------------------------------------------
function prepareTweet(release) {
    const plainText = stripHtml(release.content);
    const dateStr = release.date;
    const typeStr = release.type;
    
    // Formatting a premium styled tweet
    let header = `🚀 BigQuery Update (${dateStr}) — [${typeStr}]\n\n`;
    let hashtags = `\n\nRead more: ${release.link}\n#BigQuery #GoogleCloud`;
    
    // Determine available length for description snippet
    // Maximum tweet size is 280 characters.
    const overhead = header.length + hashtags.length;
    const maxSnippetLength = 280 - overhead;
    
    let description = plainText;
    if (description.length > maxSnippetLength) {
        // Truncate description cleanly at word bounds if possible
        description = description.slice(0, maxSnippetLength - 4);
        const lastSpace = description.lastIndexOf(' ');
        if (lastSpace > 50) {
            description = description.slice(0, lastSpace);
        }
        description += '...';
    }
    
    const defaultTweet = `${header}${description}${hashtags}`;
    DOM.tweetTextarea.value = defaultTweet;
    
    // Trigger character counter
    updateCharCount();
}

function updateCharCount() {
    const tweetLen = DOM.tweetTextarea.value.length;
    const remaining = 280 - tweetLen;
    DOM.charCounter.textContent = remaining;

    // Update counter styling warnings
    if (remaining < 0) {
        DOM.charCounter.className = 'char-counter danger';
        DOM.tweetBtn.disabled = true;
    } else if (remaining < 30) {
        DOM.charCounter.className = 'char-counter warning';
        DOM.tweetBtn.disabled = false;
    } else {
        DOM.charCounter.className = 'char-counter';
        DOM.tweetBtn.disabled = false;
    }
}

function shareOnTwitter() {
    const text = DOM.tweetTextarea.value;
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(intentUrl, '_blank');
}

// -------------------------------------------------------------
// HELPER UTILITIES
// -------------------------------------------------------------
function stripHtml(html) {
    if (!html) return "";
    
    // 1. Remove style and script tags content completely
    let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    
    // 2. Replace all HTML tags with spaces
    text = text.replace(/<[^>]+>/g, ' ');
    
    // 3. Decode common HTML entities
    text = text.replace(/&nbsp;/g, ' ')
               .replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'");
               
    // 4. Clean up redundant spaces and carriage returns
    text = text.replace(/[\r\n\t]+/g, ' ');
    text = text.replace(/\s+/g, ' ');
    
    return text.trim();
}


function makeExcerpt(html) {
    const text = stripHtml(html);
    if (text.length <= 130) return text;
    return text.slice(0, 127) + '...';
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Add success or error SVG icons inside toast
    const icon = type === 'success' ? 
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.25rem; height:1.25rem;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3"/></svg>` :
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.25rem; height:1.25rem;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

    toast.innerHTML = `${icon}<span>${message}</span>`;
    DOM.toastContainer.appendChild(toast);

    // Fade out and remove toast
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('transitionend', () => {
            toast.remove();
        });
    }, 3500);
}

// -------------------------------------------------------------
// NEW UTILITY FEATURES
// -------------------------------------------------------------
function copyCardContent(btn) {
    const release = state.releases.find(item => item.id === btn.dataset.id);
    if (!release) return;

    const plainText = stripHtml(release.content);
    
    navigator.clipboard.writeText(plainText).then(() => {
        // Toggle icon visual feedback
        const copyIcon = btn.querySelector('.copy-icon');
        const checkIcon = btn.querySelector('.check-icon');
        
        copyIcon.classList.add('hidden');
        checkIcon.classList.remove('hidden');
        
        showToast('Description copied to clipboard!', 'success');
        
        // Revert checkmark back to clipboard after delay
        setTimeout(() => {
            copyIcon.classList.remove('hidden');
            checkIcon.classList.add('hidden');
        }, 1500);
    }).catch(err => {
        console.error('Clipboard write failed:', err);
        showToast('Failed to copy to clipboard', 'error');
    });
}

function exportToCSV() {
    const items = state.filteredReleases || [];
    if (items.length === 0) {
        showToast('No updates available to export.', 'error');
        return;
    }

    // Define CSV Headers with UTF-8 BOM for Excel compliance
    let csvContent = "\ufeffDate,Type,Description,Link\r\n";
    
    items.forEach(item => {
        const escapeCSV = (text) => `"${text.replace(/"/g, '""')}"`;
        
        const dateVal = escapeCSV(item.date);
        const typeVal = escapeCSV(item.type);
        const descVal = escapeCSV(stripHtml(item.content));
        const linkVal = escapeCSV(item.link);
        
        csvContent += `${dateVal},${typeVal},${descVal},${linkVal}\r\n`;
    });

    try {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement("a");
        
        const fileTimestamp = new Date().toISOString().slice(0, 10);
        downloadLink.setAttribute("href", url);
        downloadLink.setAttribute("download", `BigQuery_Releases_Export_${fileTimestamp}.csv`);
        
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        showToast(`Successfully exported ${items.length} records to CSV!`, 'success');
    } catch (err) {
        console.error('CSV Export failed:', err);
        showToast('Failed to export to CSV file', 'error');
    }
}

