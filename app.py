import os
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# XML namespace for Atom feeds
ATOM_NS = {'atom': 'http://www.w3.org/2005/Atom'}

# Simple in-memory cache
cache = {
    'data': None,
    'timestamp': 0,
    'expiry': 300  # Cache duration in seconds (5 minutes)
}

def fetch_and_parse_feed():
    url = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=10) as response:
        xml_data = response.read()
    
    root = ET.fromstring(xml_data)
    all_updates = []
    update_counter = 0
    
    for entry in root.findall('atom:entry', ATOM_NS):
        # The title contains the release date, e.g. "June 17, 2026"
        title_elem = entry.find('atom:title', ATOM_NS)
        date_str = title_elem.text.strip() if title_elem is not None else "Unknown Date"
        
        # Link to the release note anchor
        link_elem = entry.find('atom:link[@rel="alternate"]', ATOM_NS)
        link = link_elem.attrib['href'] if link_elem is not None else "https://cloud.google.com/bigquery/docs/release-notes"
        
        # Content element
        content_elem = entry.find('atom:content', ATOM_NS)
        content_html = content_elem.text if content_elem is not None else ""
        
        # Find <h3> tags for splitting multiple sub-updates on the same day
        h3_matches = list(re.finditer(r'<h3>(.*?)</h3>', content_html, re.IGNORECASE))
        
        if not h3_matches:
            # If no <h3> header is present, treat the entire content as one update of type "Update"
            update_counter += 1
            all_updates.append({
                'id': f"up-{update_counter}",
                'date': date_str,
                'type': 'Update',
                'content': content_html.strip(),
                'link': link
            })
        else:
            for i in range(len(h3_matches)):
                # The text inside <h3> represents the update type (e.g. Feature, Announcement, Issue, Deprecated)
                type_name = h3_matches[i].group(1).strip()
                
                start = h3_matches[i].end()
                end = h3_matches[i+1].start() if i + 1 < len(h3_matches) else len(content_html)
                update_content = content_html[start:end].strip()
                
                update_counter += 1
                
                # Try to create a more specific link if anchor exists
                # Atom feed IDs often look like: tag:google.com,2016:bigquery-release-notes#June_17_2026
                # We can construct the proper anchor for this day:
                anchor = date_str.replace(" ", "_").replace(",", "")
                day_link = f"https://cloud.google.com/bigquery/docs/release-notes#{anchor}"
                
                all_updates.append({
                    'id': f"up-{update_counter}",
                    'date': date_str,
                    'type': type_name,
                    'content': update_content,
                    'link': day_link
                })
                
    return all_updates

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    current_time = time.time()
    
    # Check if cache is valid and refresh is not forced
    if not force_refresh and cache['data'] is not None and (current_time - cache['timestamp']) < cache['expiry']:
        return jsonify({
            'source': 'cache',
            'cached_at': cache['timestamp'],
            'updates': cache['data']
        })
        
    try:
        updates = fetch_and_parse_feed()
        cache['data'] = updates
        cache['timestamp'] = current_time
        return jsonify({
            'source': 'network',
            'cached_at': current_time,
            'updates': updates
        })
    except Exception as e:
        # Fallback to cache if request fails, or return error if cache is empty
        if cache['data'] is not None:
            return jsonify({
                'source': 'cache_fallback',
                'error': str(e),
                'cached_at': cache['timestamp'],
                'updates': cache['data']
            })
        return jsonify({
            'error': f"Failed to fetch feed: {str(e)}"
        }), 500

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '-1'
    return response

if __name__ == '__main__':
    # Flask runs on http://127.0.0.1:5000 by default
    app.run(debug=True, port=5000)

