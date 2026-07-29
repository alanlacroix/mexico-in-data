'use strict';

// A reviewed homepage note is a dated overlay, not permanent content. Keep the
// display layer and the publication gate on this one rule so an expired note can
// never block a later daily refresh.
function currentHomeEditorial(editorial, editorialDate) {
  return editorial && editorial.forDate === editorialDate ? editorial : null;
}

module.exports = { currentHomeEditorial };
