# TorScraping
The provided Node.js code represents a REST API that utilizes Tor for web scraping. Here's a summary of the code:

Web Scraping Setup:

The REST API is served on port 5055.
TOR circuits are used to facilitate web scraping with different IP addresses.
The application ensures that the same domain is not scraped more than once every 24 hours per IP.
The default configuration includes 5 TOR circuits, and these circuits change every 5 minutes.
Dependencies:

The code utilizes various packages, including express for the web server, sqlite3 for SQLite database handling, sanitize-html for cleaning HTML code, puppeteer for controlling Chrome headless, and socks-proxy-agent for handling HTTP requests through TOR.
Database Functions:

The application uses an SQLite database to store the history of scraped domains and associated public IPs.
Functions include creating the database, adding entries, querying the database to check recent usage, and cleaning old entries.
String Manipulation Functions:

Several functions handle string manipulation tasks such as removing HTML, JavaScript, and CSS, filtering alphanumeric characters, removing newlines and tabs, replacing tabs with spaces, and removing extra spaces.
Scrape Functions:

The code uses puppeteer to scrape website content through TOR circuits.
Public IPs are rotated to avoid using the same IP for a domain within a 24-hour period.
The scraped content is sanitized by removing unwanted elements and formatting.
REST API Endpoint:

The main REST API endpoint /get accepts a URL parameter and initiates the web scraping process.
The response is a JSON object containing the sanitized output, the website URL, and the timestamp, or an error message if applicable.
