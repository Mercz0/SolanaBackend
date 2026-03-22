const crypto = require('crypto');
const generateHash = (data) => {
    const sortedData = Object.keys(data).sort().reduce((obj, key) => {
        obj[key] = data[key];
        return obj;
    }, {});

    const dataString = JSON.stringify(sortedData);

    return crypto
        .createHash('sha256')
        .update(dataString)
        .digest('hex');
};

module.exports = { generateHash };