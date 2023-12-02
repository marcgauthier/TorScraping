/*

This Application will server a REST API on port 5055
a request can be done to ask the application to do a 
web scrape using TOR.  The app will make sure that 
the same domain can't be scrape more than once per 
24hr per IP.  The default is to have 5 TOR circuit this give 
the opportunitty to use different IP to scrape.
The 5 cirtcuit are also changing every 5 mins this mean 
each 5 min a set of five new IP should be present.
the history is saved into SQLITE so if the application
stopped it remember what domain not to scrape.

http://localhost:5055/get?url=https://www.lapresse.ca

The return will be a JSON 

{ message: sanitizedOutput, url: website_url, time: currentTime}; 
    or 
{ error: "message"}
 

*/

// keep the publicIP / domain cached for x hours
const cacheIPDuration = 24;

// package to extract domain from url
const url = require('url');

// package to handle sqlite database.
const sqlite3 = require('sqlite3').verbose();

// package to clean html code.
const sanitizeHtml = require('sanitize-html');

// package to build the webserver of our REST API
const express = require('express');

// package use to handle html, for getpublicIP
const axios = require('axios');

// package to get http request through proxy (TOR)
const { SocksProxyAgent } = require('socks-proxy-agent');

// create a constructor for our website HTTP server
const app = express();

// package to control chrome headless
const puppeteer = require('puppeteer-extra')

// package to hide puppeteer 
const StealthPlugin = require('puppeteer-extra-plugin-stealth')

// enable the stealth plugin
puppeteer.use(StealthPlugin())

// Server REST API on this port
const port = 5055;


////////////////////////////////////////////////////
///////////////// DATABASE FUNCTIONS ///////////////
////////////////////////////////////////////////////


// constructor to handle the database 
db = new sqlite3.Database('./data/data.sqlite');

// function to create the table in the sqlite database, this database is use 
// to remember what public IP was use to access what domain to prevent 
// using the same TOR public IP more than twice in 24hr

function createDB() {
    
    console.log("Creating SQLITE Table if require");

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        DOMAIN TEXT,
        TIME INT,
        SCRAPERIP TEXT
      )
    `;

    db.run(createTableQuery, (err) => {
      if (err) {
        console.error('Error creating table:', err.message);
      } else {
        console.log('Table created successfully');
      }
    });
}

// Add an entry in the database domain name and public IP used.

function addEntry(SCRAPERIP, DOMAIN) {
    const currentTime = Math.floor(Date.now() / 1000); // Current time in epoch (seconds)
    const insertQuery = 'INSERT INTO data (DOMAIN, TIME, SCRAPERIP) VALUES (?, ?, ?)';

    console.log("adding into db " + DOMAIN + " using " + SCRAPERIP);
      
    db.run(insertQuery, [DOMAIN, currentTime, SCRAPERIP], (err) => {
      if (err) {
        console.error('Error adding entry:', err.message);
      }
    });
}

// Search the database to see if the public IP was use less than 
// 24hr ago to download an URL on the domain.

function queryDatabase(SCRAPERIP, DOMAIN) {
   
    const currentTime = Math.floor(Date.now() / 1000); // Current time in epoch (seconds)
    const query = `
      SELECT MAX(TIME) AS maxTime
      FROM data
      WHERE SCRAPERIP = ? AND DOMAIN = ? AND TIME >= ?
    `;

    return new Promise((resolve, reject) => {
      db.get(query, [SCRAPERIP, DOMAIN, currentTime - cacheIPDuration * 60 * 60], (err, row) => {
        if (err) {
          console.error('Error querying database:', err.message);
          reject(err);
        } else {
          resolve(row ? row.maxTime : 0);
        }
      });
    });
  }

// This function will be execute at interval of once a day to delete 
// all the cache data older than 24hr

function cleanDatabase() {
   
    const currentTime = Math.floor(Date.now() / 1000); // Current time in epoch (seconds)
    
    const query = `
      DELETE 
      FROM data
      WHERE TIME < ?
    `;

    return new Promise((resolve, reject) => {
      db.get(query, [currentTime - cacheIPDuration * 60 * 60], (err, row) => {
        if (err) {
          console.error('Error cleaning database:', err.message);
          reject(err);
        } else {
          resolve(row ? row.maxTime : 0);
        }
      });
    });
  }


////////////////////////////////////////////////////
///////////////// STRINGS  FUNCTIONS ///////////////
////////////////////////////////////////////////////


// Remove HTML, JavaScript, and CSS using sanitize-html

function removeHtmlJavaScriptCss(inputString) {
    const sanitizedString = sanitizeHtml(inputString, {
      allowedTags: [],
      allowedAttributes: {},
      exclusiveFilter: (frame) => {
        return frame.tag === 'script' || frame.tag === 'style';
      },
    });
}

// Use a regular expression to keep only letter incuding special letters 
// and numbers

function filterAlphanumeric(inputString) {
    const filteredString = inputString.replace(/[^a-zA-Z0-9À-ÿ ]/g, '');
  
    return filteredString;
  }


// Use a regular expression to replace \n, \r, and \t with an empty string

function removeNewlinesAndTabs(inputString) {
    const sanitizedString = inputString.replace(/[\n\r\t]/g, '');
  
    return sanitizedString;
  }

// Use a regular expression to replace \t or \x09 with a space

function replaceTabsWithSpace(inputString) {
    const replacedString = inputString.replace(/[\t\x09]/g, ' ');
  
    return replacedString;
  }


// extract the domain name from an URL

function getDomainFromUrl(inputUrl) {
    const parsedUrl = new URL(inputUrl);
    return parsedUrl.hostname;
  }

  function removeExtraSpaces(inputString) {
    // Use a regular expression to replace two or more spaces with a single space
    const resultString = inputString.replace(/\s{2,}/g, ' ');
  
    return resultString;
  }
  

////////////////////////////////////////////////////////
///////////////// SELECT PORT  FUNCTIONS ///////////////
////////////////////////////////////////////////////////

var TOR_circuits = new Map([
    ['9050', "0.0.0.0"],
    ['9052', "0.0.0.0"],
    ['9053', "0.0.0.0"],
    ['9054', "0.0.0.0"],
    ['9055', "0.0.0.0"],
    ['9056', "0.0.0.0"],
    ['9057', "0.0.0.0"],
    ['9058', "0.0.0.0"],
    ['9059', "0.0.0.0"],
    ['9060', "0.0.0.0"]
]);

var nextCircuit = -1;

function getNextPort() {
    nextCircuit++;
    if (nextCircuit<=0) {
        return 9050
    } else if (nextCircuit==1) {
        return 9052
    } else if (nextCircuit==2) {
        return 9053
    } else if (nextCircuit==3) {
        return 9054
      } else if (nextCircuit==4) {
        return 9055
      } else if (nextCircuit==5) {
        return 9056
      } else if (nextCircuit==6) {
        return 9057
      } else if (nextCircuit==7) {
        return 9058
    } else if (nextCircuit>=8) {
        nextCircuit = 0;
        return 9059
    }
}

function getPublicIPs() {

  TOR_circuits.forEach((value, key) => {
    
        getPublicIPWithProxy("localhost", key).then((publicIP) => {
            if (publicIP) {
              TOR_circuits[key] = publicIP;
              console.log('public IP address (through proxy ' + key + ') is:', publicIP);
            } else {
              console.log('Unable to fetch public IP through proxy. ' + key);
            }
          });
    
    });
          
}

async function getPublicIPWithProxy(proxyHost, proxyPort) {

    const agent = new SocksProxyAgent("socks://" + proxyHost + ":" + proxyPort);
  
    try {
      const response = await axios.get('https://api64.ipify.org?format=json', {
        httpsAgent: agent,
      });
  
      return response.data.ip;
    } catch (error) {
      console.error('Error fetching public IP with proxy:', error.message);
      return null;
    }
  }
  
  
////////////////////////////////////////////////////
///////////////// SCRAPE   FUNCTIONS ///////////////
////////////////////////////////////////////////////


async function scrape(port, url, ip) {
 
    console.log("fetching " + url + " using port " + port + " Public IP " + ip);
      
    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--proxy-server=socks5://localhost:' + port]
    });
  
    const page = await browser.newPage();
    // use puppeteer default timeout 30secs
    await page.goto(url);
    const content = await page.content();
  
    browser.close();
    return content;
}
  
async function getURL(website_url) {
  
    const domain = getDomainFromUrl(website_url);
     
    var maxtry = 5;
    var publicip;
    let port = 0;

    while (true) {

        maxtry--;

        // get next port 
        port = getNextPort()
        publicip = TOR_circuits[port];
    
        console.log("testing socks " + port + " public is will be " + publicip );
  
        // query the database to see when we use this IP on the domain
        var time = await queryDatabase(publicip, domain)
        if (time == null || time == 0) {
            break;
        } 
       
        if (maxtry < 0) {
            return {error: "all our public IP have been use within 24hr for " + domain };
        }
    }
      
    try {
        content = await scrape(port, website_url, publicip);
        addEntry(publicip, domain);
        console.log("fetched " + content.length);
    } catch (err) {
        console.log("Unable to fetch website: " + website_url);
        return {error: "Unable to fetch website: " + website_url, details: err };
    }

   
    //remove HtmlJavaScriptCss(content);
    var sanitizedOutput = sanitizeHtml(content, {
        allowedTags: [],
        allowedAttributes: {},
        exclusiveFilter: (frame) => {
          return frame.tag === 'script' || frame.tag === 'style';
        },
      });

    // remove special line 
    sanitizedOutput = removeNewlinesAndTabs(sanitizedOutput);
    
    // remove non alpha numeric 
    sanitizedOutput = filterAlphanumeric(sanitizedOutput);

    sanitizedOutput = replaceTabsWithSpace(sanitizedOutput);

    sanitizedOutput = removeExtraSpaces(sanitizedOutput);

    console.log("sanitized " + sanitizedOutput.length);
  
    const currentTime = new Date().toLocaleTimeString();

    let obj = { message: sanitizedOutput, url: website_url, time: currentTime}; 

    return obj;
}
  
  

/*
    This function handle the HTTP REST request, it receive 
    a URL and try to fetch it's HTML.
*/
app.get('/get', async (req, res) => {
    try {
      const { url } = req.query;
  
      if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
      }
  
      // Call your getURL function with the provided URL
      const result = await getURL(url);
  
      // Send the result as a JSON response
      res.json(result);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });



/*
    This is the main function handle, it start the webserver, 
    create the database  and start a interval function to 
    check what are the current public IPs associated with 
    the five TOR socks.
*/
app.listen(port, async() => {
    
    // Create the database and table
    createDB();
    
    console.log(`Server is running on http://localhost:${port}`);
    console.log(`Monitoring Public IP every 10min`);
  
    getPublicIPs();
    const interval = setInterval(getPublicIPs, 10 * 60 * 1000);
    
    // remove old cache domain/public IP < 24hr 
    const clean_interval = setInterval(cleanDatabase, 24 * 60 * 60 * 1000);
       

});

