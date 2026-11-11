/* Stand-in for Zoho's widget SDK (widgetsdk-min.js v2). The original widgets run unchanged;
   every ZOHO.CREATOR.* call goes to the local server instead of creator.zoho.com. */
(function () {
  function user() {
    try { return localStorage.getItem('local-app:user') || 'admin@local'; } catch (e) { return 'admin@local'; }
  }
  function post(op, body) {
    return fetch('/api/' + op, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User': user() },
      body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json(); }).then(function (res) {
      // Zoho's SDK rejects on errors with { code, message, responseText }
      if (res && res.code !== 3000) {
        var err = new Error(res.message || 'Request failed');
        err.code = res.code; err.responseText = JSON.stringify(res);
        throw err;
      }
      return res;
    });
  }
  function queryParams() {
    var out = {};
    new URLSearchParams(location.search).forEach(function (v, k) { out[k] = v; });
    return out;
  }
  function upload(cfg) {
    var file = cfg.file;
    var qs = new URLSearchParams({ report: cfg.report_name || '', id: String(cfg.id || ''), field: cfg.field_name || '', name: (file && file.name) || 'file' });
    return fetch('/api/uploadFile?' + qs, { method: 'POST', headers: { 'X-User': user() }, body: file })
      .then(function (r) { return r.json(); });
  }

  var DATA = {
    getRecords: function (c) { return post('getRecords', c); },
    getRecordById: function (c) { return post('getRecordById', c); },
    addRecords: function (c) { return post('addRecords', c); },
    updateRecordById: function (c) { return post('updateRecordById', c); },
    updateRecords: function (c) { return post('updateRecords', c); },
    deleteRecordById: function (c) { return post('deleteRecordById', c); },
    invokeCustomApi: function (c) { return post('invokeCustomApi', c); },
  };
  var UTIL = {
    getInitParams: function () {
      return Promise.resolve({ loginUser: user(), appLinkName: 'supply-chain-app', scope: 'homecartel', envUrlFragment: '' });
    },
    getQueryParams: function () { return Promise.resolve(queryParams()); },
    navigateParentURL: function (cfg) {
      var url = typeof cfg === 'string' ? cfg : (cfg && cfg.url) || '';
      if (window.parent !== window) window.parent.postMessage({ type: 'zoho-navigate', url: url }, '*');
      else location.href = url;
      return Promise.resolve({ code: 3000 });
    },
    setImageData: function (img, src, cb) {
      if (img) img.src = src;
      if (typeof cb === 'function') setTimeout(cb, 0);
      return Promise.resolve();
    },
    uploadFile: upload,
    setVisible: function () { return Promise.resolve({ code: 3000 }); },
  };
  // FILE.readFile({ report_name, id, field_name }) -> { code: 3000, data: { filecontent: Blob } }
  function readFile(cfg) {
    return fetch('/api/readFile', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User': user() },
      body: JSON.stringify({ report_name: cfg.report_name || cfg.reportName, id: String(cfg.id), field_name: cfg.field_name || cfg.fieldName }),
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { var err = new Error(e.message); err.code = e.code; throw err; });
      return r.blob().then(function (b) { return { code: 3000, data: { filecontent: b } }; });
    });
  }
  var API = { // v1 SDK aliases some widgets still call
    getAllRecords: function (c) { return DATA.getRecords(Object.assign({ report_name: c.reportName }, c)); },
    addRecord: function (c) { return DATA.addRecords({ form_name: c.formName, payload: c.data }); },
    readFile: readFile,
  };
  window.ZOHO = {
    CREATOR: {
      init: function () { return Promise.resolve({}); },
      DATA: DATA, UTIL: UTIL, API: API,
      FILE: { uploadFile: upload, readFile: readFile },
    },
  };
})();
