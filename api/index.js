const app = require('../app'); // app.js থেকে import

module.exports = (req, res) => {
  app(req, res); // Express app handle করবে req/res
};
