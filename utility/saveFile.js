const fs = require("fs");


function saveFile(fileName, content) {
  fs.writeFileSync('files/'+ fileName, content);
}

module.exports = saveFile;