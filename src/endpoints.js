const fs = require("fs");
const path = require("path");

let allEndpoints = {};

const endpointsAndTechnology = fs
  .readFileSync(`${path.resolve(__dirname)}/../endpoints.txt`)
  .toString()
  .split("\n");

for(let endpointData of endpointsAndTechnology) {
    const [endpoint, technologies] = endpointData.split(" ");

    const alltechnologies = technologies.split(",");

    alltechnologies.forEach(technology => {

        if(allEndpoints.hasOwnProperty(technology)) {
            allEndpoints[technology].push(endpoint);
        } else {
            allEndpoints[technology] = [];
            allEndpoints[technology].push(endpoint);
        }
    });
}

module.exports = allEndpoints;
