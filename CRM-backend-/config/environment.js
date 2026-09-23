const path = require('path');
// Local overrides are loaded first; the legacy cloud .env stays intact.
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
