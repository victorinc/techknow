const fs = require("fs");
const https = require("https");
const yaml = require("js-yaml");
const path = require("path");
const config = require("./config");

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

  // console.log(doc);
} catch (e) {
  console.log(e);
}

for (let url of urls) {
  makeRequest(url).then((res) => {
    const { technology } = res || {};

    console.log(`for URL: ${url}, technologies present: \n`);
    console.log(technology.join(", "));
  });
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

      let options = {
        hostname: url,
        path: endpoint,
        method,
        headers,
      };

      // console.log("options: ", options);

      const isTech = await new Promise((resolve, reject) => {
        try {
          const req = https.request(options, async (res) => {
            const statusCheck = checkStatus(res.statusCode, response);

            const headerCheck = checkHeader(res.headers, response);

            const bodyCheck = await checkBody(res, response);

            // console.log("res.statusCode", res.statusCode);
            // console.log("statusCheck, headerCheck, bodyCheck", {statusCheck, headerCheck, bodyCheck});

            if (statusCheck && headerCheck && bodyCheck) {
              resolve(true);
            } else {
              resolve(false);
            }
          });

          req.on("error", (e) => {
            // reject(e);
            console.error("req error:", e);
          });
          req.end();
        } catch (error) {
          console.log("error :: ", error);
        }
      });

      rulesValid[rule] = isTech;

      // console.log(`rule ${rule} success for ${name}? `, isTech);
      // check for critical endpoints
    }

    const { required = [], optional = [] } = condition || {};

    let conditionCheck = Object.keys(rulesValid).reduce((key, value) =>  rulesValid[value] || key, null);
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

    //   console.log(`Technology ${name} present: `, conditionCheck);

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
        // console.log("body: ", responseBody);
        const pattern = new RegExp(body, "g");

        resolve(pattern.test(responseBody));
      });
    } catch (error) {
      reject(error);
    }
  });
}
