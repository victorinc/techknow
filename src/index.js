const fs = require("fs");
const https = require("https");
const yaml = require("js-yaml");
const path = require("path");
const config = require("./config");
const endpoints = require("./endpoints");

const urls = fs
  .readFileSync(`${path.resolve(__dirname)}/../hostnames.txt`)
  .toString()
  .split("\n");

let alltechnologies = [];

try {
  for (let technology of config.TECHNOLOGY) {
    const doc = yaml.load(
      fs.readFileSync(
        `${path.resolve(__dirname)}/../technologies/${technology}.yaml`,
        "utf8"
      )
    );

    alltechnologies.push({ name: technology, doc });
  }
} catch (e) {
  console.log(e);
}

for (let url of urls) {
  makeRequest(url)
    .then((res) => {
      const { technology = [] } = res || {};

      console.log(`for URL: ${url}, technologies present: `);
      console.log(technology.join(", "));
      console.log("-----------------------------------------");

      return technology;
    })
    .then(async (technologies) => {
      let criticalEndpoints = [];
      if (technologies.length === 0) {
        for (const technology of Object.keys(endpoints)) {
            const currentEndpoints = endpoints[technology] ? endpoints[technology] : [];
          criticalEndpoints = [...criticalEndpoints, ...currentEndpoints];
        }
      } else {
        for (const technology of technologies) {
            const currentEndpoints = endpoints[technology] ? endpoints[technology] : [];
          criticalEndpoints = [...criticalEndpoints, ...currentEndpoints];
        }
      }

      await Promise.all([
        ...criticalEndpoints.map(async (endpoint) => {
            const options = getOptions(url, endpoint);
            const isSuccess = await new Promise((resolve, reject) => {
              try {
                const req = https.request(options, async (res) => {
                  const statusCheck = checkStatus(res.statusCode, { code: 200 });
    
                  if (statusCheck) {
                    resolve(true);
                  } else {
                    resolve(false);
                  }
                });
    
                req.on("error", (e) => {
                  console.error("req error:", e);
                });
                req.end();
              } catch (error) {
                console.log("error :: ", error);
              }
            });
    
            console.log(
              `Url : ${url} with endpoint: ${endpoint} is ${
                isSuccess ? "valid" : "not valid"
              }`
            );
        })
      ]);
    });
}

function getOptions(url, endpoint = "/", method = "GET", headers = {}) {
  return {
    hostname: url,
    path: endpoint,
    method,
    headers,
  };
}

async function makeRequest(url, technologies = alltechnologies) {
  let presentTechnologies = [];
  for (let technology of technologies) {
    const { name, doc: { rules = {}, condition = {} } = {} } = technology || {};

    let rulesValid = {};

    for (let rule of Object.keys(rules)) {
      const {
        request: { method = "GET", endpoint = "/", headers = {} } = {},
        response = {},
      } = rules[rule] || {};

      const options = getOptions(url, endpoint, method, headers);

      const isTech = await new Promise((resolve, reject) => {
        try {
          const req = https.request(options, async (res) => {
            const statusCheck = checkStatus(res.statusCode, response);

            const headerCheck = checkHeader(res.headers, response);

            const bodyCheck = await checkBody(res, response);

            if (statusCheck && headerCheck && bodyCheck) {
              resolve(true);
            } else {
              resolve(false);
            }
          });

          req.on("error", (e) => {
            console.error("req error:", e);
          });
          req.end();
        } catch (error) {
          console.log("error :: ", error);
        }
      });

      rulesValid[rule] = isTech;
    }

    const { required = [], optional = [] } = condition || {};

    let conditionCheck = Object.keys(rulesValid).reduce(
      (key, value) => rulesValid[value] || key,
      null
    );
    if (required.length > 1) {
      for (let key of required) {
        conditionCheck =
          conditionCheck === null
            ? rulesValid[key]
            : conditionCheck && rulesValid[key];
      }
    }
    if (optional.length > 1) {
      for (let key of optional) {
        conditionCheck =
          conditionCheck === null
            ? rulesValid[key]
            : conditionCheck || rulesValid[key];
      }
    }

    if (conditionCheck) {
      presentTechnologies.push(name);
    }
  }

  return { technology: presentTechnologies };
}

function checkStatus(status, response) {
  const { code } = response || {};
  if (parseInt(status) === parseInt(code)) return true;
  return false;
}

function checkHeader(responseHeaders, response) {
  const { headers = {} } = response || {};

  let headerKeys = Object.keys(headers) || [];

  for (let headerKey of headerKeys) {
    if (
      responseHeaders[headerKey] &&
      responseHeaders[headerKey] === headers[headerKey]
    ) {
      continue;
    } else {
      return false;
    }
  }
  return true;
}

async function checkBody(res, response) {
  return await new Promise((resolve, reject) => {
    try {
      let responseBody = "";
      res.on("data", (data) => {
        responseBody += data.toString();
      });

      res.on("end", () => {
        const { body = "" } = response || {};
        const pattern = new RegExp(body, "g");

        resolve(pattern.test(responseBody));
      });
    } catch (error) {
      reject(error);
    }
  });
}
